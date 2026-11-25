import { useContext, useEffect, useState } from "react";

import {
  encodeFunctionData,
  formatEther,
  getAddress,
  type Hex,
  isAddress,
  parseAbi,
  parseEther,
} from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  WagmiContext,
} from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ARB_DEPLOY_CHAINS,
  DEFAULT_FLASHBOTS_AUTH_ADDRESS,
  DEFAULT_OPERATOR_ADDRESS,
  SHAGGY_DOGG_OWNER,
} from "@/config/arbExecutorArtifact";

const DEFAULT_ETHEREUM_EXECUTOR_V4 = "0xa4ee94804d177382429c9cd77214a4d23ceccbdb";
const DEFAULT_BASE_EXECUTOR_V3 = "0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413";

function balanceLabel({ data, isError }: { data: { value: bigint } | undefined; isError: boolean }) {
  if (isError) return "Unavailable";
  if (!data) return "Loading…";
  if (data.value > 0n && data.value < parseEther("0.0001")) return "<0.0001 ETH";
  return `${Number(formatEther(data.value)).toFixed(4)} ETH`;
}

export function ArbExecutorDeployCard() {
  const wagmiConfig = useContext(WagmiContext);
  if (!wagmiConfig) return null;
  return <ArbExecutorDeployCardInner />;
}

function ArbExecutorDeployCardInner() {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [targetChain, setTargetChain] = useState<"ethereum" | "base">("ethereum");
  const ownerInput = SHAGGY_DOGG_OWNER;
  const beneficiaryInput = SHAGGY_DOGG_OWNER;
  const operatorInput = DEFAULT_OPERATOR_ADDRESS;
  const liveAddresses: Record<"ethereum" | "base", string> = {
    ethereum: DEFAULT_ETHEREUM_EXECUTOR_V4,
    base: DEFAULT_BASE_EXECUTOR_V3,
  };
  const [fundTxByChain, setFundTxByChain] = useState<Partial<Record<"ethereum" | "base", Hex>>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyStatus !== "copied") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const chainConfig = ARB_DEPLOY_CHAINS[targetChain];
  const publicClient = usePublicClient({ chainId: chainConfig.chainId });
  const currentFundTxHash = fundTxByChain[targetChain];

  const walletAddress = isConnected && address ? address : SHAGGY_DOGG_OWNER;
  const ethBalance = useBalance({
    address: walletAddress,
    chainId: 1,
  });
  const baseBalance = useBalance({
    address: walletAddress,
    chainId: 8453,
  });
  const execEthBalance = useBalance({
    address: (liveAddresses.ethereum || DEFAULT_ETHEREUM_EXECUTOR_V4) as `0x${string}`,
    chainId: 1,
  });
  const opEthBalance = useBalance({
    address: (isAddress(operatorInput) ? operatorInput : DEFAULT_OPERATOR_ADDRESS) as `0x${string}`,
    chainId: 1,
  });
  const opBaseBalance = useBalance({
    address: (isAddress(operatorInput) ? operatorInput : DEFAULT_OPERATOR_ADDRESS) as `0x${string}`,
    chainId: 8453,
  });

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const isShaggyConnected =
    isConnected &&
    Boolean(address) &&
    address!.toLowerCase() === SHAGGY_DOGG_OWNER.toLowerCase();

  const needsEthBridge =
    isConnected &&
    address &&
    targetChain === "ethereum" &&
    ethBalance.isSuccess &&
    baseBalance.isSuccess &&
    ethBalance.data.value < parseEther("0.0002") &&
    baseBalance.data.value > parseEther("0.001");

  const openWalletModal = (preferQr: boolean) => {
    window.dispatchEvent(
      new CustomEvent("shaggy:open-wallet-connect", { detail: { preferQr } }),
    );
  };

  const getDynamicEip1559Fees = async () => {
    if (targetChain !== "ethereum" || !publicClient) return {};
    try {
      // Ask the connected chain for current EIP-1559 fees instead of relying on
      // a static priority fee. Wallets may still let the user adjust these.
      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas({
        type: "eip1559",
      });
      return { maxFeePerGas, maxPriorityFeePerGas };
    } catch {
      // Omitting overrides delegates fee estimation to the wallet/provider.
      return {};
    }
  };

  const handleSetMaxBribe = async (newMaxEth: string) => {
    setLocalError(null);
    const execAddr = liveAddresses[targetChain];
    if (!isAddress(execAddr)) return;
    try {
      if (activeChainId !== chainConfig.chainId) {
        await switchChainAsync({ chainId: chainConfig.chainId });
      }
      const feeOverrides = await getDynamicEip1559Fees();
      const data = encodeFunctionData({
        abi: parseAbi(["function setMaxBribeWei(uint256 next)"]),
        functionName: "setMaxBribeWei",
        args: [parseEther(newMaxEth)],
      });
      const hash = await sendTransactionAsync({
        chainId: chainConfig.chainId,
        to: getAddress(execAddr),
        data,
        value: 0n,
        ...(targetChain === "ethereum" ? { gas: 60_000n, ...feeOverrides } : {}),
      });
      setFundTxByChain((prev) => ({ ...prev, [targetChain]: hash }));
    } catch (err) {
      const msg =
        (err as { shortMessage?: string; message?: string })?.shortMessage ||
        (err as { message?: string })?.message ||
        "setMaxBribeWei transaction cancelled or failed.";
      setLocalError(msg);
    }
  };

  const handleFund = async (to: string, amountEth: string) => {
    setLocalError(null);
    if (!isAddress(to)) {
      setLocalError("Recipient address is invalid.");
      return;
    }
    try {
      if (activeChainId !== chainConfig.chainId) {
        await switchChainAsync({ chainId: chainConfig.chainId });
      }
      const feeOverrides = await getDynamicEip1559Fees();
      const hash = await sendTransactionAsync({
        chainId: chainConfig.chainId,
        to: getAddress(to),
        value: parseEther(amountEth),
        ...(targetChain === "ethereum" ? { gas: 30_000n, ...feeOverrides } : {}),
      });
      setFundTxByChain((prev) => ({ ...prev, [targetChain]: hash }));
    } catch (err) {
      const msg =
        (err as { shortMessage?: string; message?: string })?.shortMessage ||
        (err as { message?: string })?.message ||
        "Funding transfer cancelled or failed.";
      setLocalError(msg);
    }
  };

  const envSnippet = [
    "ARB_CHAINS=base,ethereum",
    "ARB_MODE=live",
    "LIVE_CONFIRM=I_ACCEPT_LOSSES",
    `ARB_EXECUTOR_ETHEREUM=${liveAddresses.ethereum || DEFAULT_ETHEREUM_EXECUTOR_V4}`,
    `ARB_EXECUTOR_BASE=${liveAddresses.base || DEFAULT_BASE_EXECUTOR_V3}`,
  ].join("\n");

  const copyConfig = async () => {
    setCopyStatus("copying");
    try {
      await navigator.clipboard.writeText(envSnippet);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const contractVersion = targetChain === "ethereum" ? "V4" : "V3";

  return (
    <Card className="min-w-0 border-emerald-500/40 [&_code]:break-all">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-lg">
            Live Flash-Swap Executor (ArbExecutorV4.sol / V3.sol)
          </CardTitle>
          <CardDescription>
            Zero-capital Uniswap v4 flash-borrow executor · Pre-configured for ShaggyDogg (
            <code className="text-xs">{SHAGGY_DOGG_OWNER}</code>)
          </CardDescription>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={targetChain === "ethereum" ? "default" : "outline"}
            aria-pressed={targetChain === "ethereum"}
            onClick={() => {
              setLocalError(null);
              setTargetChain("ethereum");
            }}
          >
            Ethereum Mainnet (V4 Live ✅)
          </Button>
          <Button
            size="sm"
            variant={targetChain === "base" ? "default" : "outline"}
            aria-pressed={targetChain === "base"}
            onClick={() => {
              setLocalError(null);
              setTargetChain("base");
            }}
          >
            Base Mainnet (V3 Live ✅)
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Per-chain ETH balance bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <div>
            <strong>Live Bot Balances:</strong>{" "}
            <span className="ml-2">
              Ethereum V4 Executor Float: <strong>{balanceLabel(execEthBalance)}</strong>
            </span>{" "}
            ·{" "}
            <span>
              Ethereum Operator Gas: <strong>{balanceLabel(opEthBalance)}</strong>
            </span>{" "}
            ·{" "}
            <span>
              Base Operator Gas: <strong>{balanceLabel(opBaseBalance)}</strong>
            </span>
          </div>
          <div className="text-muted-foreground">
            {isConnected && address && !isShaggyConnected
              ? "Connected wallet"
              : "ShaggyDogg wallet"}
            : {balanceLabel(baseBalance)} (Base) · {balanceLabel(ethBalance)} (L1)
          </div>
        </div>

        {needsEthBridge ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
            Your connected wallet holds <strong>{balanceLabel(baseBalance)}</strong> on Base and{" "}
            <strong>{balanceLabel(ethBalance)}</strong> on Ethereum Mainnet.{" "}
            <a
              href="https://relay.link/bridge/ethereum?fromChainId=8453"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              View Base → Ethereum bridge
            </a>
            . Review the quote, fees, destination amount, and network before approving a transfer.
          </div>
        ) : null}

        {/* Wallet connection banner */}
        {!isConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
            <div>
              <div className="font-medium">Connect a wallet to fund operator gas</div>
              <div className="text-xs text-muted-foreground">
                Target Owner &amp; Beneficiary: <code>{SHAGGY_DOGG_OWNER}</code>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => openWalletModal(false)}>
                Connect MetaMask
              </Button>
              <Button size="sm" variant="outline" onClick={() => openWalletModal(true)}>
                Mobile QR
              </Button>
            </div>
          </div>
        ) : isShaggyConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
            <div>
              <Badge className="mr-2 bg-emerald-600">ShaggyDogg Connected</Badge>
              <code className="text-xs">{address}</code>
            </div>
            <span className="text-xs text-muted-foreground">
              {contractVersion} verified &amp; live on {chainConfig.name}
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
            Connected wallet <code>{address}</code> can fund operator gas. Connect the ShaggyDogg
            owner wallet to change executor settings.
          </div>
        )}

        {/* Role configuration grid */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">
              Owner (controls settings &amp; ETH float)
            </div>
            <input
              type="text"
              value={ownerInput}
              readOnly
              className="mt-1 w-full rounded border bg-background px-2 py-1 font-mono text-xs"
            />
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">
              Beneficiary (receives 100% of arb profits)
            </div>
            <input
              type="text"
              value={beneficiaryInput}
              readOnly
              className="mt-1 w-full rounded border bg-background px-2 py-1 font-mono text-xs"
            />
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">
              Operator (VM hot key — gas only, cannot withdraw)
            </div>
            <input
              type="text"
              value={operatorInput}
              readOnly
              className="mt-1 w-full rounded border bg-background px-2 py-1 font-mono text-xs"
            />
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div>
            <strong>{chainConfig.name} Constructor Immutables:</strong> Uniswap v4 PoolManager{" "}
            <code>{chainConfig.poolManager}</code> · WETH <code>{chainConfig.weth}</code> ·{" "}
            {chainConfig.quotes.length} approved quote tokens · Max bribe cap{" "}
            <code>{chainConfig.maxBribeWei === 0n ? "0 ETH" : "0.05 ETH"}</code> · Flashbots Auth
            Signer <code>{DEFAULT_FLASHBOTS_AUTH_ADDRESS}</code>
          </div>
        </div>

        <div className="space-y-3 rounded-md border-2 border-emerald-500/60 bg-emerald-500/5 p-3">
          <div>
            <div className="font-semibold text-emerald-700 dark:text-emerald-300">
              {targetChain === "ethereum"
                ? "ArbExecutorV4 — active in production (profit-funded WETH & stablecoin bids)"
                : "ArbExecutorV3 — active in production (hardened two-step ownership & profit-funded bids)"}
            </div>
            <p className="text-xs text-muted-foreground">
              {targetChain === "ethereum"
                ? "Pays builder bribes directly out of trade profit (unwrapping WETH profit or selling stablecoin profit on the deepest Uniswap V3 0.05% pool inside executeFunded). No executor ETH float is required."
                : "Executes flash-swap arbitrage across Uniswap V2/V3/V4 on Base Mainnet with two-step ownership protection and atomic beneficiary settlement."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-emerald-600 text-white">
              {contractVersion} deployed, verified &amp; active
            </Badge>
          </div>
          {liveAddresses[targetChain] ? (
            <div className="space-y-2 text-xs">
              <div>
                Active production executor:{" "}
                <a
                  href={`${chainConfig.explorerUrl}/address/${liveAddresses[targetChain]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono font-semibold underline"
                >
                  {liveAddresses[targetChain]}
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-auto min-h-9 whitespace-normal bg-emerald-600 py-1.5 text-white hover:bg-emerald-700"
                  disabled={!isConnected || isSending}
                  onClick={() => handleFund(operatorInput, "0.002")}
                >
                  Top Up {chainConfig.name} Operator Gas (+0.002 ETH)
                </Button>
                {targetChain === "ethereum" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-9 whitespace-normal py-1.5"
                    disabled={!isShaggyConnected || isSending}
                    onClick={() => handleSetMaxBribe("10")}
                  >
                    Raise On-Chain V4 MaxBribe Cap to 10 ETH (Owner)
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {localError ? (
          <div className="rounded-md border border-destructive p-2 text-xs text-destructive">
            {localError}
          </div>
        ) : null}

        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
          {currentFundTxHash ? (
            <a
              href={`${chainConfig.explorerUrl}/tx/${currentFundTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="mb-3 block text-xs underline"
            >
              View transaction {currentFundTxHash.slice(0, 10)}…
            </a>
          ) : null}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Shared Ethereum and Base configuration example for{" "}
                <code>/etc/mev-authority/arb-ethereum.env</code>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                disabled={copyStatus === "copying"}
                onClick={copyConfig}
              >
                {copyStatus === "copied" ? "Copied!" : "Copy Config"}
              </Button>
            </div>
            {copyStatus === "failed" && (
              <p role="status" className="mb-1 text-xs">
                Copy failed. Select and copy the configuration below.
              </p>
            )}
            <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-xs">
              {envSnippet}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
