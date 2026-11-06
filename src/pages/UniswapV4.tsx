// src/pages/UniswapV4.tsx — Uniswap v4 on Base and Ethereum: swap (direct or two-hop), pool data,
// the wallet's positions (holdings, uncollected fees, collect / add / remove), new positions and
// pool creation. Every write is simulated from the connected wallet before it is signed.
import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { type Address, formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NATIVE_ETH, V4_HUBS, V4_TOKENS, type V4Token } from "@/config/v4-tokens";
import {
  collectFeesCall,
  createPoolCall,
  decreaseCall,
  increaseCall,
  mintCall,
  multiSwapCall,
  NATIVE,
  poolKey,
  singleSwapCall,
  V4,
  V4_TIERS,
  type V4ChainId,
} from "@/lib/amm/uniswap-v4";
import {
  approvalsNeeded,
  bestRoute,
  discoverPools,
  erc20Abi,
  findPositionIds,
  loadPositionView,
  type PoolState,
  type PositionView,
} from "@/lib/amm/v4-client";
import {
  fullRange,
  getAmountsForLiquidity,
  getLiquidityForAmount0,
  getLiquidityForAmount1,
  getLiquidityForAmounts,
  getSqrtPriceAtTick,
  getTickAtSqrtPrice,
  priceToSqrtPriceX96,
  sqrtPriceX96ToPrice,
  usableTick,
} from "@/lib/amm/v4-math";

const CHAINS: Array<{ id: V4ChainId; name: string; explorer: string }> = [
  { id: 8453, name: "Base", explorer: "https://basescan.org" },
  { id: 1, name: "Ethereum", explorer: "https://etherscan.io" },
];
const now = () => Math.floor(Date.now() / 1000);
const deadline = () => BigInt(now() + 1200);

/** Lenient amount parsing: pasted text with spaces, a unit or a comma decimal separator. */
export function parseAmount(text: string, decimals: number): bigint {
  const cleaned = text
    .replace(/[a-z]/gi, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) throw new Error("Enter the amount as a number.");
  const [whole = "0", fraction = ""] = cleaned.split(".");
  return parseUnits(`${whole || "0"}.${fraction.slice(0, decimals) || "0"}`, decimals);
}

const fmt = (v: bigint, d: number, max = 6) =>
  Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: max });
const withSlippage = (v: bigint, bps: number, up = false) =>
  up ? (v * BigInt(10_000 + bps)) / 10_000n : (v * BigInt(10_000 - bps)) / 10_000n;

// ── Wallet plumbing ──────────────────────────────────────────────────────────────────────────

interface WriteCall {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

function useV4Writer(chainId: V4ChainId) {
  const { address, chainId: walletChain } = useAccount();
  const client = usePublicClient({ chainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const explorer = CHAINS.find((c) => c.id === chainId)!.explorer;

  /** Approvals (if any), then the action. Each is simulated from the wallet before signing. */
  const run = async (
    label: string,
    action: WriteCall,
    approvals: Array<{ token: Address; spender: Address; amount: bigint }> = []
  ) => {
    if (!address || !client) {
      toast.error("Connect a wallet first.");
      return false;
    }
    setBusy(label);
    try {
      if (walletChain !== chainId) await switchChainAsync({ chainId });
      const send = async (call: WriteCall, what: string) => {
        const request = call as unknown as Record<string, unknown>;
        await client.simulateContract({ ...request, account: address } as never);
        const hash = await writeContractAsync({ ...request, chainId } as never);
        toast.message(`${what}: sent`, { description: `${explorer}/tx/${hash}` });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`${what} reverted`);
      };
      for (const a of approvals) {
        const steps = await approvalsNeeded(
          client,
          chainId,
          address,
          a.token,
          a.spender,
          a.amount,
          now()
        );
        for (const s of steps) await send(s.call as unknown as WriteCall, s.label);
      }
      await send(action, label);
      toast.success(`${label}: confirmed`);
      return true;
    } catch (e) {
      console.error(e);
      const msg =
        (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      toast.error(`${label} stopped`, { description: msg.slice(0, 200) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { address, client, run, busy, explorer };
}

// ── Token picker ─────────────────────────────────────────────────────────────────────────────

function TokenPicker({
  chainId,
  value,
  onChange,
  label,
}: {
  chainId: V4ChainId;
  value: V4Token;
  onChange: (t: V4Token) => void;
  label: string;
}) {
  const client = usePublicClient({ chainId });
  const [custom, setCustom] = useState("");
  const load = async () => {
    if (!client || !isAddress(custom)) {
      toast.error("Enter a token contract address.");
      return;
    }
    try {
      const addr = getAddress(custom);
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }),
      ]);
      onChange({ address: addr, symbol, decimals });
      setCustom("");
    } catch {
      toast.error("That address is not an ERC-20 token on this chain.");
    }
  };
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {V4_TOKENS[chainId].map((t) => (
          <Button
            key={t.address}
            type="button"
            size="sm"
            variant={t.address === value.address ? "default" : "outline"}
            onClick={() => onChange(t)}
          >
            {t.symbol}
          </Button>
        ))}
        {!V4_TOKENS[chainId].some((t) => t.address === value.address) && (
          <Badge>{value.symbol}</Badge>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.currentTarget.value)}
          placeholder="Other token address (0x…)"
          className="h-8 font-mono text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Use
        </Button>
      </div>
    </div>
  );
}

// ── Swap ─────────────────────────────────────────────────────────────────────────────────────

function SwapCard({ chainId }: { chainId: V4ChainId }) {
  const { address, client, run, busy } = useV4Writer(chainId);
  const [tokenIn, setTokenIn] = useState<V4Token>(NATIVE_ETH);
  const [tokenOut, setTokenOut] = useState<V4Token>(V4_TOKENS[chainId][1]!);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);

  const amountIn = useMemo(() => {
    try {
      return amount ? parseAmount(amount, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, tokenIn.decimals]);

  const quote = useQuery({
    queryKey: ["v4-quote", chainId, tokenIn.address, tokenOut.address, amountIn.toString()],
    enabled: !!client && amountIn > 0n && tokenIn.address !== tokenOut.address,
    refetchInterval: 15_000,
    queryFn: () =>
      bestRoute(client!, chainId, tokenIn.address, tokenOut.address, amountIn, V4_HUBS[chainId]),
  });
  const balance = useQuery({
    queryKey: ["v4-balance", chainId, tokenIn.address, address],
    enabled: !!client && !!address,
    queryFn: () =>
      tokenIn.address === NATIVE
        ? client!.getBalance({ address: address! })
        : client!.readContract({
            address: tokenIn.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address!],
          }),
  });

  const route = quote.data;
  const minOut = route ? withSlippage(route.amountOut, slippageBps) : 0n;
  const swap = async () => {
    if (!route) return;
    const call =
      route.kind === "single"
        ? singleSwapCall(chainId, {
            key: route.pool.key,
            zeroForOne: route.zeroForOne,
            amountIn,
            amountOutMinimum: minOut,
            deadline: deadline(),
          })
        : multiSwapCall(chainId, {
            currencyIn: route.currencyIn,
            path: route.path,
            amountIn,
            amountOutMinimum: minOut,
            deadline: deadline(),
          });
    const ok = await run(`Swap ${tokenIn.symbol} → ${tokenOut.symbol}`, call as WriteCall, [
      { token: tokenIn.address, spender: V4[chainId].universalRouter, amount: amountIn },
    ]);
    if (ok) {
      setAmount("");
      void balance.refetch();
    }
  };
  const viaSymbol =
    route?.kind === "multi"
      ? (V4_TOKENS[chainId].find((t) => t.address.toLowerCase() === route.via.toLowerCase())
          ?.symbol ?? route.via.slice(0, 8))
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Swap on Uniswap v4</CardTitle>
        <CardDescription>
          Live V4Quoter quotes across every standard pool, direct or through ETH/USDC. Signed by
          your wallet through Universal Router 2.1.2.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <TokenPicker chainId={chainId} label="You pay" value={tokenIn} onChange={setTokenIn} />
        <div className="flex items-center gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder={`Amount of ${tokenIn.symbol}`}
            inputMode="decimal"
            className="font-mono"
          />
          {balance.data !== undefined && (
            <button
              type="button"
              className="whitespace-nowrap text-xs text-indigo-700 hover:underline"
              onClick={() => setAmount(formatUnits(balance.data as bigint, tokenIn.decimals))}
            >
              Balance {fmt(balance.data as bigint, tokenIn.decimals)}
            </button>
          )}
        </div>
        <TokenPicker
          chainId={chainId}
          label="You receive"
          value={tokenOut}
          onChange={setTokenOut}
        />
        <div className="flex items-center gap-2 text-xs text-slate-600">
          Slippage
          {[10, 50, 100].map((b) => (
            <Button
              key={b}
              type="button"
              size="sm"
              variant={slippageBps === b ? "default" : "outline"}
              onClick={() => setSlippageBps(b)}
            >
              {b / 100}%
            </Button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          {amountIn === 0n ? (
            <p className="text-slate-500">Enter an amount to quote.</p>
          ) : quote.isFetching && !route ? (
            <p className="text-slate-500">Quoting on chain…</p>
          ) : !route ? (
            <p className="text-amber-700">
              No v4 pool or two-hop route can fill this trade right now.
            </p>
          ) : (
            <div className="space-y-1 font-mono">
              <p>
                You receive ≈{" "}
                <strong>
                  {fmt(route.amountOut, tokenOut.decimals)} {tokenOut.symbol}
                </strong>
              </p>
              <p>
                Minimum after {slippageBps / 100}% slippage: {fmt(minOut, tokenOut.decimals)}{" "}
                {tokenOut.symbol}
              </p>
              <p>
                Route:{" "}
                {route.kind === "single"
                  ? `direct, ${route.pool.key.fee / 10_000}% pool`
                  : `${tokenIn.symbol} → ${viaSymbol} → ${tokenOut.symbol}`}
              </p>
            </div>
          )}
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={!route || busy !== null || !address}
          onClick={() => void swap()}
        >
          {!address
            ? "Connect wallet"
            : (busy ?? (tokenIn.address === NATIVE ? "Swap" : "Approve if needed & swap"))}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Pools ────────────────────────────────────────────────────────────────────────────────────

function PoolsCard({
  chainId,
  onPick,
}: {
  chainId: V4ChainId;
  onPick: (p: PoolState, a: V4Token, b: V4Token) => void;
}) {
  const client = usePublicClient({ chainId });
  const [a, setA] = useState<V4Token>(NATIVE_ETH);
  const [b, setB] = useState<V4Token>(V4_TOKENS[chainId][1]!);
  const pools = useQuery({
    queryKey: ["v4-pools", chainId, a.address, b.address],
    enabled: !!client && a.address !== b.address,
    refetchInterval: 30_000,
    queryFn: () => discoverPools(client!, chainId, a.address, b.address),
  });
  const [t0, t1] = BigInt(a.address) < BigInt(b.address) ? [a, b] : [b, a];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pool data</CardTitle>
        <CardDescription>
          Initialized hook-less v4 pools for a pair, read from StateView.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <TokenPicker chainId={chainId} label="Token A" value={a} onChange={setA} />
          <TokenPicker chainId={chainId} label="Token B" value={b} onChange={setB} />
        </div>
        {pools.isPending ? (
          <p className="text-slate-500">Reading pools…</p>
        ) : !pools.data?.length ? (
          <p className="text-slate-600">
            No v4 pool exists for this pair at the standard fee tiers. Create one under “Create
            pool”.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1">Fee</th>
                <th>
                  Price ({t1.symbol} per {t0.symbol})
                </th>
                <th>Tick</th>
                <th>Liquidity</th>
                <th />
              </tr>
            </thead>
            <tbody className="font-mono">
              {pools.data.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1.5">{p.key.fee / 10_000}%</td>
                  <td>
                    {sqrtPriceX96ToPrice(p.sqrtPriceX96, t0.decimals, t1.decimals).toPrecision(6)}
                  </td>
                  <td>{p.tick}</td>
                  <td>{p.liquidity.toString()}</td>
                  <td>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onPick(p, t0, t1)}
                    >
                      Add liquidity
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ── New position ─────────────────────────────────────────────────────────────────────────────

function NewPositionCard({
  chainId,
  preset,
}: {
  chainId: V4ChainId;
  preset: { pool: PoolState; t0: V4Token; t1: V4Token } | null;
}) {
  const { address, client, run, busy } = useV4Writer(chainId);
  const [full, setFull] = useState(true);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [side, setSide] = useState<0 | 1>(0);
  const [slippageBps] = useState(100);

  const live = useQuery({
    queryKey: ["v4-live-pool", chainId, preset?.pool.id],
    enabled: !!client && !!preset,
    refetchInterval: 15_000,
    queryFn: async () =>
      (await discoverPools(client!, chainId, preset!.t0.address, preset!.t1.address)).find(
        (p) => p.id === preset!.pool.id
      ) ?? preset!.pool,
  });
  if (!preset) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>New position</CardTitle>
          <CardDescription>Pick a pool under “Pools” and choose “Add liquidity”.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const pool = live.data ?? preset.pool;
  const { t0, t1 } = preset;
  const spacing = pool.key.tickSpacing;
  let ticks: { tickLower: number; tickUpper: number } | null = full ? fullRange(spacing) : null;
  if (!full) {
    try {
      const lo = usableTick(
        getTickAtSqrtPrice(priceToSqrtPriceX96(Number(minPrice), t0.decimals, t1.decimals)),
        spacing
      );
      const hi = usableTick(
        getTickAtSqrtPrice(priceToSqrtPriceX96(Number(maxPrice), t0.decimals, t1.decimals)),
        spacing
      );
      ticks = lo < hi ? { tickLower: lo, tickUpper: hi } : null;
    } catch {
      ticks = null;
    }
  }
  // Liquidity from the amount typed on one side; the other side follows from the price.
  let plan: { liquidity: bigint; need0: bigint; need1: bigint } | null = null;
  if (ticks) {
    try {
      const sa = getSqrtPriceAtTick(ticks.tickLower);
      const sb = getSqrtPriceAtTick(ticks.tickUpper);
      const sp = pool.sqrtPriceX96;
      let L = 0n;
      if (side === 0 && amount0) {
        const a0 = parseAmount(amount0, t0.decimals);
        L = sp >= sb ? 0n : getLiquidityForAmount0(sp > sa ? sp : sa, sb, a0);
      } else if (side === 1 && amount1) {
        const a1 = parseAmount(amount1, t1.decimals);
        L = sp <= sa ? 0n : getLiquidityForAmount1(sa, sp < sb ? sp : sb, a1);
      }
      if (L > 0n) {
        const need = getAmountsForLiquidity(sp, sa, sb, L);
        plan = { liquidity: L, need0: need.amount0 + 1n, need1: need.amount1 + 1n };
      }
    } catch {
      plan = null;
    }
  }
  const mint = async () => {
    if (!plan || !ticks || !address) return;
    const max0 = withSlippage(plan.need0, slippageBps, true);
    const max1 = withSlippage(plan.need1, slippageBps, true);
    const call = mintCall(chainId, {
      key: pool.key,
      ...ticks,
      liquidity: plan.liquidity,
      amount0Max: max0,
      amount1Max: max1,
      owner: address,
      deadline: deadline(),
    });
    const spender = V4[chainId].positionManager;
    await run(`Add ${t0.symbol}/${t1.symbol} liquidity`, call as WriteCall, [
      { token: t0.address, spender, amount: max0 },
      { token: t1.address, spender, amount: max1 },
    ]);
  };
  const price = sqrtPriceX96ToPrice(pool.sqrtPriceX96, t0.decimals, t1.decimals);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          New {t0.symbol}/{t1.symbol} position · {pool.key.fee / 10_000}%
        </CardTitle>
        <CardDescription>
          Current price {price.toPrecision(6)} {t1.symbol} per {t0.symbol}. Amounts are computed
          with Uniswap's own liquidity math at the live price; up to {slippageBps / 100}% more may
          be used if the price moves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={full ? "default" : "outline"}
            onClick={() => setFull(true)}
          >
            Full range
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!full ? "default" : "outline"}
            onClick={() => setFull(false)}
          >
            Custom range
          </Button>
        </div>
        {!full && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={minPrice}
              onChange={(e) => setMinPrice(e.currentTarget.value)}
              placeholder={`Min price (${t1.symbol}/${t0.symbol})`}
              inputMode="decimal"
            />
            <Input
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.currentTarget.value)}
              placeholder={`Max price (${t1.symbol}/${t0.symbol})`}
              inputMode="decimal"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={side === 0 ? amount0 : plan ? formatUnits(plan.need0, t0.decimals) : ""}
            onFocus={() => setSide(0)}
            onChange={(e) => {
              setSide(0);
              setAmount0(e.currentTarget.value);
            }}
            placeholder={`${t0.symbol} amount`}
            inputMode="decimal"
            className="font-mono"
          />
          <Input
            value={side === 1 ? amount1 : plan ? formatUnits(plan.need1, t1.decimals) : ""}
            onFocus={() => setSide(1)}
            onChange={(e) => {
              setSide(1);
              setAmount1(e.currentTarget.value);
            }}
            placeholder={`${t1.symbol} amount`}
            inputMode="decimal"
            className="font-mono"
          />
        </div>
        {ticks && (
          <p className="font-mono text-xs text-slate-500">
            Ticks {ticks.tickLower} → {ticks.tickUpper}
          </p>
        )}
        <Button
          type="button"
          className="w-full"
          disabled={!plan || busy !== null || !address}
          onClick={() => void mint()}
        >
          {!address ? "Connect wallet" : (busy ?? "Approve if needed & add liquidity")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Positions ────────────────────────────────────────────────────────────────────────────────

function symbolOf(chainId: V4ChainId, a: Address) {
  return V4_TOKENS[chainId].find((t) => t.address.toLowerCase() === a.toLowerCase()) ?? null;
}

function PositionRow({
  chainId,
  view,
  onChanged,
}: {
  chainId: V4ChainId;
  view: PositionView;
  onChanged: () => void;
}) {
  const { address, run, busy } = useV4Writer(chainId);
  const [addAmount, setAddAmount] = useState("");
  const t0 = symbolOf(chainId, view.key.currency0) ?? {
    symbol: view.key.currency0.slice(0, 8),
    decimals: 18,
    address: view.key.currency0,
  };
  const t1 = symbolOf(chainId, view.key.currency1) ?? {
    symbol: view.key.currency1.slice(0, 8),
    decimals: 18,
    address: view.key.currency1,
  };
  const mine = !!address && address.toLowerCase() === view.owner.toLowerCase();
  const sa = getSqrtPriceAtTick(view.tickLower);
  const sb = getSqrtPriceAtTick(view.tickUpper);

  const remove = async (pct: number) => {
    if (!view.pool || !address) return;
    const L = (view.liquidity * BigInt(pct)) / 100n;
    const out = getAmountsForLiquidity(view.pool.sqrtPriceX96, sa, sb, L);
    const ok = await run(
      `Remove ${pct}% of #${view.tokenId}`,
      decreaseCall(chainId, {
        tokenId: view.tokenId,
        key: view.key,
        liquidity: L,
        amount0: withSlippage(out.amount0, 100),
        amount1: withSlippage(out.amount1, 100),
        recipient: address,
        deadline: deadline(),
      }) as WriteCall
    );
    if (ok) onChanged();
  };
  const collect = async () => {
    if (!address) return;
    const ok = await run(
      `Collect fees of #${view.tokenId}`,
      collectFeesCall(chainId, {
        tokenId: view.tokenId,
        key: view.key,
        recipient: address,
        deadline: deadline(),
      }) as WriteCall
    );
    if (ok) onChanged();
  };
  const add = async () => {
    if (!view.pool || !address) return;
    let a0: bigint;
    try {
      a0 = parseAmount(addAmount, t0.decimals);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const sp = view.pool.sqrtPriceX96;
    // Liquidity from the token0 amount; when the range is entirely below the price, use token1.
    const L =
      sp >= sb
        ? getLiquidityForAmount1(sa, sb, parseAmount(addAmount, t1.decimals))
        : getLiquidityForAmounts(sp, sa, sb, a0, (1n << 128n) - 1n);
    const need = getAmountsForLiquidity(sp, sa, sb, L);
    const max0 = withSlippage(need.amount0 + 1n, 100, true);
    const max1 = withSlippage(need.amount1 + 1n, 100, true);
    const spender = V4[chainId].positionManager;
    const ok = await run(
      `Add to #${view.tokenId}`,
      increaseCall(chainId, {
        tokenId: view.tokenId,
        key: view.key,
        liquidity: L,
        amount0: max0,
        amount1: max1,
        recipient: address,
        deadline: deadline(),
      }) as WriteCall,
      [
        { token: view.key.currency0, spender, amount: max0 },
        { token: view.key.currency1, spender, amount: max1 },
      ]
    );
    if (ok) {
      setAddAmount("");
      onChanged();
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-bold">
          #{view.tokenId.toString()} · {t0.symbol}/{t1.symbol} · {view.key.fee / 10_000}%
          {view.key.hooks !== NATIVE && " · hooked pool"}
        </span>
        <Badge
          className={
            view.inRange ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }
        >
          {view.inRange ? "In range" : "Out of range"}
        </Badge>
      </div>
      <div className="grid gap-1 font-mono sm:grid-cols-2">
        <span>
          Holds: {fmt(view.amount0, t0.decimals)} {t0.symbol} + {fmt(view.amount1, t1.decimals)}{" "}
          {t1.symbol}
        </span>
        <span>
          Uncollected fees: {fmt(view.fees0, t0.decimals, 8)} {t0.symbol} +{" "}
          {fmt(view.fees1, t1.decimals, 8)} {t1.symbol}
        </span>
        <span>
          Ticks {view.tickLower} → {view.tickUpper}
        </span>
        <span>Liquidity {view.liquidity.toString()}</span>
      </div>
      {mine ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || (view.fees0 === 0n && view.fees1 === 0n)}
            onClick={() => void collect()}
          >
            Collect fees
          </Button>
          {[25, 50, 100].map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null || view.liquidity === 0n}
              onClick={() => void remove(p)}
            >
              Remove {p}%
            </Button>
          ))}
          <Input
            value={addAmount}
            onChange={(e) => setAddAmount(e.currentTarget.value)}
            placeholder={`Add ${view.tickUpper <= (view.pool?.tick ?? 0) ? t1.symbol : t0.symbol}`}
            className="h-8 w-32 font-mono text-xs"
            inputMode="decimal"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null || !addAmount}
            onClick={() => void add()}
          >
            Add
          </Button>
          {busy && <span className="text-slate-500">{busy}…</span>}
        </div>
      ) : (
        <p className="text-slate-500">Owned by {view.owner}; actions need that wallet.</p>
      )}
    </div>
  );
}

function PositionsCard({ chainId }: { chainId: V4ChainId }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const [extra, setExtra] = useState<bigint[]>([]);
  const [idText, setIdText] = useState("");
  const scan = useQuery({
    queryKey: ["v4-position-ids", chainId, address],
    enabled: !!client && !!address,
    staleTime: 300_000,
    queryFn: () => findPositionIds(client!, chainId, address!),
  });
  const ids = useMemo(
    () => [...new Set([...(scan.data?.ids ?? []), ...extra])],
    [scan.data, extra]
  );
  const views = useQuery({
    queryKey: ["v4-positions", chainId, ids.join(",")],
    enabled: !!client && ids.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const out = await Promise.all(
        ids.map((id) => loadPositionView(client!, chainId, id).catch(() => null))
      );
      return out.filter(
        (v): v is PositionView =>
          !!v &&
          (v.liquidity > 0n || v.fees0 > 0n || v.fees1 > 0n) &&
          (!address || v.owner.toLowerCase() === address.toLowerCase() || extra.includes(v.tokenId))
      );
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Your v4 positions</CardTitle>
          <CardDescription>
            Found from PositionManager transfer logs; holdings and uncollected fees read from
            StateView.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void scan.refetch();
            void views.refetch();
          }}
        >
          <RefreshCw className="mr-1 size-3.5" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!address ? (
          <p className="text-slate-600">
            Connect a wallet to find your positions, or add one by ID below.
          </p>
        ) : scan.isPending ? (
          <p className="text-slate-500">Searching transfer logs… (up to a minute on public RPCs)</p>
        ) : (
          scan.data &&
          !scan.data.complete && (
            <p className="text-xs text-amber-700">
              Searched back to block {scan.data.scannedFrom.toString()}; older positions can be
              added by ID.
            </p>
          )
        )}
        {views.data?.map((v) => (
          <PositionRow
            key={v.tokenId.toString()}
            chainId={chainId}
            view={v}
            onChanged={() => void views.refetch()}
          />
        ))}
        {address && views.data?.length === 0 && !scan.isPending && (
          <p className="text-slate-600">No open v4 positions found for this wallet.</p>
        )}
        <div className="flex gap-1.5">
          <Input
            value={idText}
            onChange={(e) => setIdText(e.currentTarget.value)}
            placeholder="Position ID"
            className="h-8 w-48 font-mono text-xs"
            inputMode="numeric"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (/^\d+$/.test(idText.trim())) {
                setExtra((x) => [...x, BigInt(idText.trim())]);
                setIdText("");
              }
            }}
          >
            Add by ID
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create pool ──────────────────────────────────────────────────────────────────────────────

function CreatePoolCard({ chainId }: { chainId: V4ChainId }) {
  const { address, client, run, busy } = useV4Writer(chainId);
  const [a, setA] = useState<V4Token>(NATIVE_ETH);
  const [b, setB] = useState<V4Token>(V4_TOKENS[chainId][1]!);
  const [tier, setTier] = useState<(typeof V4_TIERS)[number]>(V4_TIERS[2]);
  const [price, setPrice] = useState("");
  const [t0, t1] = BigInt(a.address) < BigInt(b.address) ? [a, b] : [b, a];
  const existing = useQuery({
    queryKey: ["v4-pools", chainId, a.address, b.address],
    enabled: !!client && a.address !== b.address,
    queryFn: () => discoverPools(client!, chainId, a.address, b.address),
  });
  const exists = existing.data?.some((p) => p.key.fee === tier.fee);
  const create = async () => {
    let sqrt: bigint;
    try {
      sqrt = priceToSqrtPriceX96(Number(price.replace(/,/g, ".")), t0.decimals, t1.decimals);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const ok = await run(
      `Create ${t0.symbol}/${t1.symbol} ${tier.fee / 10_000}% pool`,
      createPoolCall(
        chainId,
        poolKey(t0.address, t1.address, tier.fee, tier.tickSpacing),
        sqrt
      ) as WriteCall
    );
    if (ok) void existing.refetch();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a v4 pool</CardTitle>
        <CardDescription>
          Initializes a hook-less pool at a starting price. Add liquidity afterwards under “Pools”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <TokenPicker chainId={chainId} label="Token A" value={a} onChange={setA} />
          <TokenPicker chainId={chainId} label="Token B" value={b} onChange={setB} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {V4_TIERS.map((t) => (
            <Button
              key={t.fee}
              type="button"
              size="sm"
              variant={t.fee === tier.fee ? "default" : "outline"}
              onClick={() => setTier(t)}
            >
              {t.fee / 10_000}%
            </Button>
          ))}
        </div>
        <Input
          value={price}
          onChange={(e) => setPrice(e.currentTarget.value)}
          placeholder={`Starting price: ${t1.symbol} per 1 ${t0.symbol}`}
          inputMode="decimal"
        />
        {exists && (
          <p className="text-xs text-amber-700">
            This pool already exists; creating it again would revert.
          </p>
        )}
        <Button
          type="button"
          className="w-full"
          disabled={!price || exists || busy !== null || !address || a.address === b.address}
          onClick={() => void create()}
        >
          {!address ? "Connect wallet" : (busy ?? "Create pool")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────────

export default function UniswapV4() {
  const [chainId, setChainId] = useState<V4ChainId>(8453);
  const [tab, setTab] = useState("swap");
  const [preset, setPreset] = useState<{ pool: PoolState; t0: V4Token; t1: V4Token } | null>(null);
  const chain = CHAINS.find((c) => c.id === chainId)!;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Uniswap v4</h1>
          <p className="text-sm text-slate-500">
            Swap, provide liquidity and manage positions on Uniswap v4 — live on {chain.name}.
          </p>
        </div>
        <div className="flex gap-1.5">
          {CHAINS.map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={c.id === chainId ? "default" : "outline"}
              onClick={() => {
                setChainId(c.id);
                setPreset(null);
              }}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} key={chainId}>
        <TabsList>
          <TabsTrigger value="swap">Swap</TabsTrigger>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="new">New position</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="create">Create pool</TabsTrigger>
        </TabsList>
        <TabsContent value="swap">
          <SwapCard chainId={chainId} />
        </TabsContent>
        <TabsContent value="pools">
          <PoolsCard
            chainId={chainId}
            onPick={(pool, t0, t1) => {
              setPreset({ pool, t0, t1 });
              setTab("new");
            }}
          />
        </TabsContent>
        <TabsContent value="new">
          <NewPositionCard chainId={chainId} preset={preset} />
        </TabsContent>
        <TabsContent value="positions">
          <PositionsCard chainId={chainId} />
        </TabsContent>
        <TabsContent value="create">
          <CreatePoolCard chainId={chainId} />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-slate-500">
        Contracts: PoolManager {V4[chainId].poolManager}, PositionManager{" "}
        {V4[chainId].positionManager}, Universal Router {V4[chainId].universalRouter}.{" "}
        <a
          className="inline-flex items-center gap-0.5 text-indigo-700 hover:underline"
          href={`${chain.explorer}/address/${V4[chainId].poolManager}`}
          target="_blank"
          rel="noreferrer"
        >
          Explorer <ExternalLink className="size-3" />
        </a>
      </p>
    </div>
  );
}
