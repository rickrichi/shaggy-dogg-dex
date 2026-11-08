import { useContext, useEffect, useState } from "react";

import { encodeDeployData, getAddress, type Hex, isAddress, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  WagmiContext,
} from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ARB_DEPLOY_CHAINS,
  ARB_EXECUTOR_BYTECODE,
  ARB_EXECUTOR_CONSTRUCTOR_ABI,
  DEFAULT_FLASHBOTS_AUTH_ADDRESS,
  DEFAULT_OPERATOR_ADDRESS,
  SHAGGY_DOGG_OWNER,
} from "@/config/arbExecutorArtifact";

const STORAGE_PREFIX = "shaggy:arb-executor:";
const DEFAULT_BASE_EXECUTOR = "0x48a3e5e013B30E12d66008b62fF74840aA9611E5";

export function ArbExecutorDeployCard() {
  const wagmiConfig = useContext(WagmiContext);
  if (!wagmiConfig) return null;
  return <ArbExecutorDeployCardInner />;
}

function ArbExecutorDeployCardInner() {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const [targetChain, setTargetChain] = useState<"ethereum" | "base">("ethereum");
  const [ownerInput, setOwnerInput] = useState<string>(SHAGGY_DOGG_OWNER);
  const [beneficiaryInput, setBeneficiaryInput] = useState<string>(SHAGGY_DOGG_OWNER);
  const [operatorInput, setOperatorInput] = useState<string>(DEFAULT_OPERATOR_ADDRESS);
  const [deployedAddresses, setDeployedAddresses] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return { base: DEFAULT_BASE_EXECUTOR };
    return {
      ethereum: window.localStorage.getItem(`${STORAGE_PREFIX}ethereum`) || "",
      base: window.localStorage.getItem(`${STORAGE_PREFIX}base`) || DEFAULT_BASE_EXECUTOR,
    };
  });
  const [deployTxHash, setDeployTxHash] = useState<Hex | undefined>(undefined);
  const [fundTxHash, setFundTxHash] = useState<Hex | undefined>(undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const { data: deployReceipt, isLoading: isConfirmingDeploy } = useWaitForTransactionReceipt({
    hash: deployTxHash,
  });

  useEffect(() => {
    if (deployReceipt?.contractAddress) {
      const addr = getAddress(deployReceipt.contractAddress);
      setDeployedAddresses((prev) => {
        const next = { ...prev, [targetChain]: addr };
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`${STORAGE_PREFIX}${targetChain}`, addr);
        }
        return next;
      });
    }
  }, [deployReceipt, targetChain]);

  const chainConfig = ARB_DEPLOY_CHAINS[targetChain];
  const isShaggyConnected =
    isConnected &&
    Boolean(address) &&
    address!.toLowerCase() === SHAGGY_DOGG_OWNER.toLowerCase();
  const isWrongChain = isConnected && activeChainId !== chainConfig.chainId;
  const deployedForChain = deployedAddresses[targetChain] || "";

  const openWalletModal = (preferQr: boolean) => {
    window.dispatchEvent(
      new CustomEvent("shaggy:open-wallet-connect", { detail: { preferQr } }),
    );
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      /* ignore clipboard failures */
    }
  };

  const handleDeploy = async () => {
    setLocalError(null);
    if (!isAddress(ownerInput)) {
      setLocalError("Owner must be a valid 0x address.");
      return;
    }
    if (!isAddress(beneficiaryInput)) {
      setLocalError("Beneficiary must be a valid 0x address.");
      return;
    }
    if (!isAddress(operatorInput)) {
      setLocalError("Operator must be a valid 0x address.");
      return;
    }
    const owner = getAddress(ownerInput);
    const beneficiary = getAddress(beneficiaryInput);
    const operator = getAddress(operatorInput);
    if (owner.toLowerCase() === operator.toLowerCase()) {
      setLocalError("Owner and Operator must be different addresses.");
      return;
    }

    try {
      if (activeChainId !== chainConfig.chainId) {
        await switchChainAsync({ chainId: chainConfig.chainId });
      }
      const deployData = encodeDeployData({
        abi: ARB_EXECUTOR_CONSTRUCTOR_ABI,
        bytecode: ARB_EXECUTOR_BYTECODE,
        args: [
          owner,
          operator,
          beneficiary,
          chainConfig.maxBribeWei,
          chainConfig.poolManager,
          chainConfig.weth,
          [...chainConfig.quotes],
        ],
      });
      const hash = await sendTransactionAsync({
        chainId: chainConfig.chainId,
        data: deployData,
        value: 0n,
      });
      setDeployTxHash(hash);
    } catch (err) {
      const msg = (err as { shortMessage?: string; message?: string })?.shortMessage ||
        (err as { message?: string })?.message ||
        "Deployment transaction cancelled or failed.";
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
      const hash = await sendTransactionAsync({
        chainId: chainConfig.chainId,
        to: getAddress(to),
        value: parseEther(amountEth),
      });
      setFundTxHash(hash);
    } catch (err) {
      const msg = (err as { shortMessage?: string; message?: string })?.shortMessage ||
        (err as { message?: string })?.message ||
        "Funding transfer cancelled or failed.";
      setLocalError(msg);
    }
  };

  const envSnippet = [
    "ARB_CHAINS=base,ethereum",
    "ARB_MODE=live",
    "LIVE_CONFIRM=I_ACCEPT_LOSSES",
    `ARB_EXECUTOR_ETHEREUM=${deployedAddresses.ethereum || "<DEPLOY_ETHEREUM_EXECUTOR_ABOVE>"}`,
    ...(deployedAddresses.base ? [`ARB_EXECUTOR_BASE=${deployedAddresses.base}`] : []),
    "# Paste ARB_OPERATOR_PRIVATE_KEY and FLASHBOTS_AUTH_KEY from Desktop/mev-live-keys-DO-NOT-SHARE.txt",
  ].join("\n");

  return (
    <Card className="border-emerald-500/40">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-lg">
            Deploy Live Flash-Swap Executor (ArbExecutor.sol)
          </CardTitle>
          <CardDescription>
            Zero-capital Uniswap v4 flash-borrow executor · Pre-configured for ShaggyDogg (
            <code className="text-xs">{SHAGGY_DOGG_OWNER}</code>)
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={targetChain === "ethereum" ? "default" : "outline"}
            onClick={() => setTargetChain("ethereum")}
          >
            Ethereum Mainnet (~$0.25)
          </Button>
          <Button
            size="sm"
            variant={targetChain === "base" ? "default" : "outline"}
            onClick={() => setTargetChain("base")}
          >
            Base Mainnet (~$0.03)
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Wallet connection banner */}
        {!isConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
            <div>
              <div className="font-medium">Connect MetaMask (`ShaggyDogg`) to deploy</div>
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
              Ready to deploy on {chainConfig.name}
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
            <strong>Note:</strong> MetaMask is currently connected to <code>{address}</code>, not
            ShaggyDogg (<code>{SHAGGY_DOGG_OWNER}</code>). You can switch accounts in MetaMask so
            ShaggyDogg pays the ~$0.25 deploy gas, or deploy right now —{" "}
            <code>{SHAGGY_DOGG_OWNER}</code> is still hard-set as the on-chain{" "}
            <strong>Owner &amp; Beneficiary</strong> below.
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
              onChange={(e) => setOwnerInput(e.target.value.trim())}
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
              onChange={(e) => setBeneficiaryInput(e.target.value.trim())}
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
              onChange={(e) => setOperatorInput(e.target.value.trim())}
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

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!isConnected || isSending || isConfirmingDeploy || isSwitching}
            onClick={handleDeploy}
          >
            {isSwitching
              ? `Switching to ${chainConfig.name}…`
              : isSending
                ? "Confirm in MetaMask…"
                : isConfirmingDeploy
                  ? "Waiting for on-chain confirmation…"
                  : isWrongChain
                    ? `Switch to ${chainConfig.name} & Deploy ArbExecutor`
                    : `Deploy ArbExecutor on ${chainConfig.name}`}
          </Button>

          {deployTxHash ? (
            <a
              href={`${chainConfig.explorerUrl}/tx/${deployTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline"
            >
              View deploy tx {deployTxHash.slice(0, 10)}…
            </a>
          ) : null}
        </div>

        {localError ? (
          <div className="rounded-md border border-destructive p-2 text-xs text-destructive">
            {localError}
          </div>
        ) : null}

        {/* Post-deploy status & funding helpers */}
        {deployedForChain ? (
          <div className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">
                  Deployed {chainConfig.name} ArbExecutor Address
                </div>
                <a
                  href={`${chainConfig.explorerUrl}/address/${deployedForChain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm font-semibold text-emerald-600 underline"
                >
                  {deployedForChain}
                </a>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyText("executor", deployedForChain)}
              >
                {copiedKey === "executor" ? "Copied!" : "Copy Executor Address"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {targetChain === "ethereum" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!isConnected || isSending}
                  onClick={() => handleFund(deployedForChain, "0.01")}
                >
                  1. Fund Executor Bribe Float (0.01 ETH)
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                disabled={!isConnected || isSending}
                onClick={() =>
                  handleFund(operatorInput, targetChain === "ethereum" ? "0.005" : "0.002")
                }
              >
                {targetChain === "ethereum"
                  ? "2. Fund Operator Gas (0.005 ETH)"
                  : "Fund Operator Gas on Base (0.002 ETH)"}
              </Button>
              {fundTxHash ? (
                <a
                  href={`${chainConfig.explorerUrl}/tx/${fundTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="self-center text-xs underline"
                >
                  Funding tx {fundTxHash.slice(0, 10)}…
                </a>
              ) : null}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>VM Config (`/etc/uni-arb.env` on GCE `market-data`):</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyText("env", envSnippet)}
                >
                  {copiedKey === "env" ? "Copied!" : "Copy Config"}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-xs">
                {envSnippet}
              </pre>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
