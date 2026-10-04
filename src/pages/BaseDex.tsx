import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseAbi, parseUnits, zeroAddress } from "viem";
import { base } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ERC20_ABI, UNISWAP_V2_PAIR_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { DEX_WETH } from "@/config/dex/deployment";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { useOwnDex } from "@/hooks/useOwnDex";
import { DEX_FACTORY_ABI, positiveAmount, verifyDexDeployment } from "@/lib/amm/own-dex";
import { calculateMinimumAmountOut } from "@/lib/amm/swap-protection";

import type { Abi, Address, Hash } from "viem";

const tokens = BASE_MAINNET_TOKENS.filter((t) => t.kind === "erc20" && t.symbol !== "SD");
const wethAbi = parseAbi(["function deposit() payable", "function withdraw(uint256)"]);
type Mode = "swap" | "add" | "remove";
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function BaseDex({ initialMode = "swap" }: { initialMode?: Mode }) {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { deployment, client, verification, ready } = useOwnDex();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [symbolA, setSymbolA] = useState("WETH");
  const [symbolB, setSymbolB] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [amountB, setAmountB] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash>();
  const tokenA = tokens.find((t) => t.symbol === symbolA)!;
  const tokenB = tokens.find((t) => t.symbol === symbolB)!;
  const correctChain = chainId === base.id;
  const validPair = tokenA.address !== tokenB.address;
  const amountIn = positiveAmount(amount, tokenA.decimals)
    ? parseUnits(amount, tokenA.decimals)
    : 0n;
  const slippageBps = Number(slippage) * 100;
  const validSlippage =
    slippage.trim() !== "" &&
    Number.isInteger(slippageBps) &&
    slippageBps >= 0 &&
    slippageBps <= 1000;

  const pool = useQuery({
    queryKey: ["own-dex-pool", deployment?.factory, tokenA.address, tokenB.address, address],
    enabled: ready && validPair,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!client || !deployment) throw new Error("DEX unavailable");
      const pair = await client.readContract({
        address: deployment.factory,
        abi: DEX_FACTORY_ABI,
        functionName: "getPair",
        args: [tokenA.address, tokenB.address],
      });
      if (pair === zeroAddress) return null;
      const [reserves, token0, supply, lp] = await Promise.all([
        client.readContract({
          address: pair,
          abi: UNISWAP_V2_PAIR_ABI,
          functionName: "getReserves",
        }),
        client.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: "token0" }),
        client.readContract({ address: pair, abi: ERC20_ABI, functionName: "totalSupply" }),
        address
          ? client.readContract({
              address: pair,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
      ]);
      const aFirst = token0.toLowerCase() === tokenA.address.toLowerCase();
      return {
        pair,
        reserveA: reserves[aFirst ? 0 : 1],
        reserveB: reserves[aFirst ? 1 : 0],
        supply,
        lp,
      };
    },
  });
  const quote = useQuery({
    queryKey: [
      "own-dex-quote",
      deployment?.router,
      tokenA.address,
      tokenB.address,
      amountIn.toString(),
    ],
    enabled: ready && validPair && amountIn > 0n && mode === "swap",
    refetchInterval: 10_000,
    staleTime: 5000,
    retry: false,
    queryFn: async () => {
      if (!client || !deployment) throw new Error("DEX unavailable");
      const result = await client.readContract({
        address: deployment.router,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, [tokenA.address, tokenB.address]],
      });
      return result.at(-1)!;
    },
  });
  const balances = useQuery({
    queryKey: ["own-dex-balances", address, tokenA.address, tokenB.address],
    enabled: Boolean(address && client),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!client || !address) throw new Error("Connect a wallet");
      const [a, b] = await Promise.all(
        [tokenA, tokenB].map((t) =>
          client.readContract({
            address: t.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          })
        )
      );
      return { a: a!, b: b! };
    },
  });

  const run = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setHash(undefined);
    try {
      await operation();
      await Promise.all([pool.refetch(), balances.refetch(), quote.refetch()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transaction failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const assertWallet = async () => {
    if (
      !wallet ||
      !client ||
      !address ||
      !correctChain ||
      (await wallet.getChainId()) !== base.id ||
      (await wallet.getAddresses())[0]?.toLowerCase() !== address.toLowerCase()
    )
      throw new Error("Connect your wallet on Base mainnet.");
  };
  const send = async (
    target: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    value = 0n
  ) => {
    await assertWallet();
    const simulation = await client!.simulateContract({
      address: target,
      abi,
      functionName,
      args,
      account: address!,
      value,
    });
    await assertWallet();
    setMessage(`Confirm ${functionName} in your wallet.`);
    const tx = await wallet!.writeContract({
      ...simulation.request,
      chain: base,
      account: address!,
    });
    setHash(tx);
    setMessage("Transaction submitted. Waiting for confirmation…");
    const receipt = await client!.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error("Transaction reverted. Check the receipt.");
    setMessage("Transaction confirmed on Base.");
  };
  const approve = async (token: Address, quantity: bigint) => {
    const allowance = await client!.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address!, deployment!.router],
    });
    if (allowance < quantity) {
      if (allowance > 0n) await send(token, ERC20_ABI, "approve", [deployment!.router, 0n]);
      await send(token, ERC20_ABI, "approve", [deployment!.router, quantity]);
    }
  };
  const execute = () =>
    run(async () => {
      await assertWallet();
      if (!deployment || !ready || !validPair || !validSlippage)
        throw new Error(
          "Verify the DEX, select different tokens and set slippage between 0% and 10%."
        );
      await verifyDexDeployment(client!, deployment);
      const floor = (value: bigint) => calculateMinimumAmountOut(value, BigInt(slippageBps));
      const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);
      if (mode === "remove") {
        if (!positiveAmount(amount, 18))
          throw new Error("Enter a positive LP amount (up to 18 decimals).");
        const position = (await pool.refetch()).data;
        const shares = parseUnits(amount, 18);
        if (!position || position.supply === 0n || shares > position.lp)
          throw new Error("Insufficient LP balance.");
        const minA = floor((shares * position.reserveA) / position.supply);
        const minB = floor((shares * position.reserveB) / position.supply);
        await approve(position.pair, shares);
        await send(deployment.router, UNISWAP_V2_ROUTER_ABI, "removeLiquidity", [
          tokenA.address,
          tokenB.address,
          shares,
          minA,
          minB,
          address!,
          deadline(),
        ]);
      } else {
        if (amountIn <= 0n) throw new Error("Enter a positive token amount.");
        if (mode === "swap") {
          const amounts = await client!.readContract({
            address: deployment.router,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "getAmountsOut",
            args: [amountIn, [tokenA.address, tokenB.address]],
          });
          // Keep the reviewed price as the floor across any approval prompts.
          const reviewed = quote.data;
          if (!reviewed || Date.now() - quote.dataUpdatedAt > 30_000 || quote.isError)
            throw new Error("Quote expired. Wait for a fresh quote.");
          const minimum = floor(reviewed);
          if (amounts.at(-1)! < minimum)
            throw new Error("Price moved beyond your slippage limit. Review the new quote.");
          await approve(tokenA.address, amountIn);
          await send(deployment.router, UNISWAP_V2_ROUTER_ABI, "swapExactTokensForTokens", [
            amountIn,
            minimum,
            [tokenA.address, tokenB.address],
            address!,
            deadline(),
          ]);
        } else {
          if (!positiveAmount(amountB, tokenB.decimals))
            throw new Error("Enter both deposit amounts.");
          const desiredB = parseUnits(amountB, tokenB.decimals);
          await approve(tokenA.address, amountIn);
          await approve(tokenB.address, desiredB);
          await send(deployment.router, UNISWAP_V2_ROUTER_ABI, "addLiquidity", [
            tokenA.address,
            tokenB.address,
            amountIn,
            desiredB,
            floor(amountIn),
            floor(desiredB),
            address!,
            deadline(),
          ]);
        }
      }
      setAmount("");
      setAmountB("");
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div>
        <h1 className="text-3xl font-bold text-purple-900">Shaggy-Dogg-Dex</h1>
        <p className="text-sm text-slate-600">
          Independent pools · Base mainnet · 0.30% pool swap fee
        </p>
      </div>
      <p>
        <Link className="text-purple-700 underline" to="/swap/compare">
          Compare Uniswap V2 and Aerodrome routes
        </Link>
      </p>
      <Card>
        <CardContent className="space-y-2 pt-5">
          {!deployment ? (
            <p>
              Deploy your factory and router to open your DEX.{" "}
              <Link className="text-purple-700 underline" to="/dex/setup">
                Open DEX setup
              </Link>
            </p>
          ) : (
            <>
              <p>
                {ready
                  ? "Contract bytecode verified"
                  : verification.isError
                    ? "Contract verification failed"
                    : "Verifying deployment…"}
              </p>
              <p className="text-xs">
                Factory{" "}
                <a
                  className="underline"
                  href={`https://basescan.org/address/${deployment.factory}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(deployment.factory)}
                </a>{" "}
                · Router{" "}
                <a
                  className="underline"
                  href={`https://basescan.org/address/${deployment.router}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(deployment.router)}
                </a>
              </p>
              {verification.error && <p role="alert">{verification.error.message}</p>}
            </>
          )}
          {!correctChain && (
            <Button onClick={() => switchChain({ chainId: base.id })}>Switch to Base</Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trade and manage liquidity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {(["swap", "add", "remove"] as Mode[]).map((m) => (
              <Button
                key={m}
                disabled={busy}
                variant={mode === m ? "default" : "outline"}
                onClick={() => {
                  setMode(m);
                  setAmount("");
                }}
              >
                {m === "swap" ? "Swap" : m === "add" ? "Add liquidity" : "Remove liquidity"}
              </Button>
            ))}
          </div>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: symbolA, set: setSymbolA, label: "Token A" },
                { value: symbolB, set: setSymbolB, label: "Token B" },
              ].map((item) => (
                <label key={item.label} className="space-y-1 text-sm">
                  {item.label}
                  <select
                    className="block w-full rounded border bg-white p-2"
                    value={item.value}
                    onChange={(e) => {
                      item.set(e.target.value);
                      setAmount("");
                      setAmountB("");
                    }}
                  >
                    {tokens.map((t) => (
                      <option key={t.address} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              Wallet:{" "}
              {balances.data
                ? `${formatUnits(balances.data.a, tokenA.decimals)} ${symbolA} · ${formatUnits(balances.data.b, tokenB.decimals)} ${symbolB}`
                : "Connect wallet for balances"}
            </p>
            <label className="block text-sm">
              {mode === "remove" ? "LP tokens to withdraw" : `${symbolA} amount`}
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {mode === "add" && (
              <label className="block text-sm">
                {symbolB} deposit
                <Input
                  inputMode="decimal"
                  value={amountB}
                  onChange={(e) => setAmountB(e.target.value)}
                />
                {pool.data && pool.data.reserveA > 0n && amountIn > 0n && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAmountB(
                        formatUnits(
                          (amountIn * pool.data!.reserveB) / pool.data!.reserveA,
                          tokenB.decimals
                        )
                      )
                    }
                  >
                    Use current pool ratio
                  </Button>
                )}
              </label>
            )}
            <label className="block text-sm">
              Slippage tolerance (%)
              <Input
                inputMode="decimal"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
              />
            </label>
          </fieldset>
          {mode === "swap" && (
            <p aria-live="polite">
              {quote.isError
                ? "No funded direct pool or quote unavailable."
                : quote.data && amountIn > 0n
                  ? `Estimated output: ${formatUnits(quote.data, tokenB.decimals)} ${symbolB}`
                  : "Enter an amount to quote your pool."}
            </p>
          )}
          {ready && (
            <p className="text-xs text-slate-600">
              {pool.isError
                ? "Pool read unavailable"
                : pool.isPending
                  ? "Reading pool…"
                  : pool.data
                    ? `Pool reserves: ${formatUnits(pool.data.reserveA, tokenA.decimals)} ${symbolA} / ${formatUnits(pool.data.reserveB, tokenB.decimals)} ${symbolB}. Your LP: ${formatUnits(pool.data.lp, 18)}`
                    : "No pool yet. The first deposit creates one and sets its initial price."}
            </p>
          )}
          {mode === "add" && (
            <p className="text-xs text-slate-600">
              Deposits require both tokens. For a new pool, review your price ratio carefully. LP
              tokens represent your share; returns and principal value can change.
            </p>
          )}
          <Button
            disabled={
              busy ||
              !ready ||
              !address ||
              !correctChain ||
              !validPair ||
              !validSlippage ||
              (mode === "swap" && (!quote.data || quote.isError || quote.isFetching || !amountIn))
            }
            onClick={() => void execute()}
          >
            {busy
              ? "Waiting for wallet / confirmation…"
              : mode === "swap"
                ? "Review swap in wallet"
                : mode === "add"
                  ? "Approve and deposit"
                  : "Approve and withdraw"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Wrap or unwrap ETH</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Pools use WETH. Wrap ETH 1:1 on Base; keep ETH available for gas.
          </p>
          <Input
            aria-label="ETH or WETH amount"
            inputMode="decimal"
            value={wrapAmount}
            disabled={busy}
            onChange={(e) => setWrapAmount(e.target.value)}
          />
          <div className="flex gap-2">
            {[true, false].map((wrap) => (
              <Button
                key={String(wrap)}
                disabled={busy || !address || !correctChain || !positiveAmount(wrapAmount, 18)}
                onClick={() =>
                  void run(async () => {
                    const quantity = parseUnits(wrapAmount, 18);
                    await send(
                      DEX_WETH,
                      wethAbi,
                      wrap ? "deposit" : "withdraw",
                      wrap ? [] : [quantity],
                      wrap ? quantity : 0n
                    );
                    setWrapAmount("");
                  })
                }
              >
                {wrap ? "Wrap ETH" : "Unwrap WETH"}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      {message && (
        <p role="status" className="break-words rounded border bg-white p-3 text-sm">
          {message}
        </p>
      )}
      {hash && (
        <a
          className="block text-purple-700 underline"
          href={`https://basescan.org/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction {short(hash)}
        </a>
      )}
      <Link className="text-sm text-purple-700 underline" to="/dex/setup">
        Deployment settings
      </Link>
    </div>
  );
}
