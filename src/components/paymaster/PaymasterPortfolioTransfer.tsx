import { useEffect, useMemo, useState } from "react";

import { createSmartAccountClient } from "permissionless";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import {
  type Address,
  encodeFunctionData,
  formatUnits,
  getAddress,
  type Hex,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortfolio } from "@/hooks/usePortfolio";
import { rewardTokenAbi } from "@/lib/paymaster/client";

interface ProgramConfig {
  ready: boolean;
  chainId: number;
  paymaster: Address | null;
  entryPoint: Address;
  accountImplementation: Address;
  walletEligible: boolean;
}

interface TokenChoice {
  address: Address;
  symbol: string;
  decimals: number;
  balance: bigint;
}

function decimal(value: bigint | undefined): string {
  return (value ?? 0n).toString();
}

export function PaymasterPortfolioTransfer() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { tokens, refetch } = usePortfolio();
  const [config, setConfig] = useState<ProgramConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [selected, setSelected] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customToken, setCustomToken] = useState<TokenChoice | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);

  useEffect(() => {
    if (!address) {
      setConfig(null);
      return;
    }
    let active = true;
    fetch(`/api/paymaster/config?wallet=${address}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Program configuration is unavailable.");
        return response.json() as Promise<ProgramConfig>;
      })
      .then((value) => {
        if (active) {
          setConfig(value);
          setConfigError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setConfigError(cause instanceof Error ? cause.message : "Program unavailable.");
      });
    return () => {
      active = false;
    };
  }, [address]);

  const choices = useMemo(
    () =>
      tokens
        .filter(
          (token) =>
            token.chainId === base.id &&
            token.address !== "0x0000000000000000000000000000000000000000" &&
            BigInt(token.balance) > 0n
        )
        .map((token) => ({
          address: token.address as Address,
          symbol: token.symbol,
          decimals: token.decimals,
          balance: BigInt(token.balance),
        })),
    [tokens]
  );

  useEffect(() => {
    if (!publicClient || !isAddress(customAddress)) {
      setCustomToken(null);
      return;
    }
    let active = true;
    const tokenAddress = getAddress(customAddress);
    Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "balanceOf",
        args: [address ?? tokenAddress],
      }),
    ])
      .then(([symbol, decimals, balance]) => {
        if (active) setCustomToken({ address: tokenAddress, symbol, decimals, balance });
      })
      .catch(() => {
        if (active) setCustomToken(null);
      });
    return () => {
      active = false;
    };
  }, [address, customAddress, publicClient]);

  const token =
    selected === "custom"
      ? customToken
      : (choices.find((choice) => choice.address.toLowerCase() === selected.toLowerCase()) ?? null);
  const canSubmit = Boolean(
    isConnected &&
      address &&
      publicClient &&
      walletClient &&
      config?.ready &&
      config.walletEligible &&
      config.paymaster &&
      token &&
      recipient &&
      amount &&
      !pending
  );

  async function transfer() {
    setError("");
    setTxHash(null);
    if (!address || !walletClient || !publicClient || !config?.paymaster || !token) return;
    setPending(true);
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
        throw new Error("Base is selected. Review the transfer, then submit it again.");
      }
      if (!isAddress(recipient)) throw new Error("Enter a valid recipient address.");
      const to = getAddress(recipient);
      if (to.toLowerCase() === address.toLowerCase())
        throw new Error("Recipient must be another address.");
      const units = parseUnits(amount.trim(), token.decimals);
      if (units <= 0n || units > token.balance)
        throw new Error("Enter an amount within the token balance.");
      const code = await publicClient.getBytecode({ address });
      const expectedCode = `0xef0100${config.accountImplementation.slice(2).toLowerCase()}`;
      if (code && code !== "0x" && code.toLowerCase() !== expectedCode) {
        throw new Error("This wallet is delegated to a different smart account implementation.");
      }
      const authorization =
        code && code !== "0x"
          ? undefined
          : await walletClient.signAuthorization({
              account: walletClient.account,
              address: config.accountImplementation,
              chainId: base.id,
              nonce: await publicClient.getTransactionCount({ address }),
            });
      const account = await to7702SimpleSmartAccount({
        client: publicClient,
        owner: walletClient,
      });
      const smartClient = createSmartAccountClient({
        account,
        chain: base,
        bundlerTransport: http(`${window.location.origin}/api/paymaster/bundler`),
        paymaster: {
          getPaymasterStubData: async () => ({
            paymaster: config.paymaster!,
            paymasterData: `0x${"00".repeat(71)}` as Hex,
            paymasterVerificationGasLimit: 120_000n,
            paymasterPostOpGasLimit: 100_000n,
          }),
          getPaymasterData: async (operation) => {
            const response = await fetch("/api/paymaster/sign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sender: operation.sender,
                nonce: decimal(operation.nonce),
                callData: operation.callData,
                factory: operation.factory,
                factoryData: operation.factoryData,
                callGasLimit: decimal(operation.callGasLimit),
                verificationGasLimit: decimal(operation.verificationGasLimit),
                preVerificationGas: decimal(operation.preVerificationGas),
                maxFeePerGas: decimal(operation.maxFeePerGas),
                maxPriorityFeePerGas: decimal(operation.maxPriorityFeePerGas),
                paymasterVerificationGasLimit: decimal(
                  operation.paymasterVerificationGasLimit ?? 120_000n
                ),
                paymasterPostOpGasLimit: decimal(operation.paymasterPostOpGasLimit ?? 100_000n),
                authorization: authorization && {
                  address: authorization.address,
                  chainId: authorization.chainId,
                  nonce: String(authorization.nonce),
                  r: authorization.r,
                  s: authorization.s,
                  yParity: authorization.yParity,
                },
              }),
            });
            const result = (await response.json()) as { error?: string; paymasterData?: Hex };
            if (!response.ok || !result.paymasterData)
              throw new Error(result.error ?? "Sponsorship declined.");
            return {
              paymaster: config.paymaster!,
              paymasterData: result.paymasterData,
              paymasterVerificationGasLimit: operation.paymasterVerificationGasLimit ?? 120_000n,
              paymasterPostOpGasLimit: operation.paymasterPostOpGasLimit ?? 100_000n,
            };
          },
        },
      });
      const hash = await smartClient.sendTransaction({
        calls: [
          {
            to: token.address,
            value: 0n,
            data: encodeFunctionData({
              abi: rewardTokenAbi,
              functionName: "transfer",
              args: [to, units],
            }),
          },
        ],
        authorization,
      });
      setTxHash(hash);
      refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transfer failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-indigo-100 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Sponsored portfolio transfer</CardTitle>
        <CardDescription>
          Send an ERC-20 token you hold on Base. The program pays network gas and sends MRWD to your
          wallet after a successful operation. No MRWD is taken from you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && (
          <p className="text-sm text-slate-600">Connect your wallet to view your Base tokens.</p>
        )}
        {isConnected && chainId !== base.id && (
          <p className="text-sm text-amber-800">Switch to Base to load your portfolio tokens.</p>
        )}
        {configError && (
          <p role="alert" className="text-sm text-rose-700">
            {configError}
          </p>
        )}
        {config && !config.ready && (
          <p className="text-sm text-amber-800">
            Sponsorship is awaiting the funded paymaster, signer, bundler, and wallet allowlist
            configuration.
          </p>
        )}
        {config?.ready && !config.walletEligible && (
          <p className="text-sm text-amber-800">
            This wallet is not enrolled in the reward program.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="paymaster-token">Portfolio token</Label>
            <select
              id="paymaster-token"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Choose a Base token</option>
              {choices.map((choice) => (
                <option key={choice.address} value={choice.address}>
                  {choice.symbol} · {formatUnits(choice.balance, choice.decimals)}
                </option>
              ))}
              <option value="custom">Enter token contract…</option>
            </select>
          </div>
          {selected === "custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="paymaster-custom-token">Base token contract</Label>
              <Input
                id="paymaster-custom-token"
                value={customAddress}
                onChange={(event) => setCustomAddress(event.target.value)}
                placeholder="0x…"
              />
              {customToken && (
                <p className="text-xs text-slate-600">
                  {customToken.symbol} balance:{" "}
                  {formatUnits(customToken.balance, customToken.decimals)}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="paymaster-recipient">Recipient</Label>
            <Input
              id="paymaster-recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="0x…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymaster-amount">Amount {token ? `(${token.symbol})` : ""}</Label>
            <Input
              id="paymaster-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.0"
            />
          </div>
        </div>
        <p className="text-xs text-slate-600">
          Your wallet may ask you to authorize EIP-7702 account code on its first sponsored
          transfer. Only wallets that support this authorization can use the existing portfolio
          address.
        </p>
        <Button
          onClick={transfer}
          disabled={!canSubmit}
          className="bg-indigo-700 hover:bg-indigo-800"
        >
          {pending ? "Waiting for wallet and bundler…" : "Send with sponsored gas"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        {txHash && (
          <p className="text-sm text-emerald-700">
            Transfer submitted:{" "}
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://basescan.org/tx/${txHash}`}
            >
              {txHash.slice(0, 10)}…
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
