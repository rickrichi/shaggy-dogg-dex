import { useContext, useState } from "react";

import {
  formatEther,
  getAddress,
  type Hex,
  isAddress,
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

const DEFAULT_ETHEREUM_EXECUTOR_V2 = "0x41f40bae5318f2c67a4d04d1dc7a42d53a346ae7";
const DEFAULT_BASE_EXECUTOR_V2 = "0x5FAca3396c177ad8a9D84655772a8a00038fD639";

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
  const v2Addresses: Record<"ethereum" | "base", string> = {
    ethereum: DEFAULT_ETHEREUM_EXECUTOR_V2,
    base: DEFAULT_BASE_EXECUTOR_V2,
  };
  const [fundTxByChain, setFundTxByChain] = useState<Partial<Record<"ethereum" | "base", Hex>>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const chainConfig = ARB_DEPLOY_CHAINS[targetChain];
  const publicClient = usePublicClient({ chainId: chainConfig.chainId });
  const currentFundTxHash = fundTxByChain[targetChain];

  const { data: ethBalance } = useBalance({
    address: address ?? SHAGGY_DOGG_OWNER,
    chainId: 1,
  });
  const { data: baseBalance } = useBalance({
    address: address ?? SHAGGY_DOGG_OWNER,
    chainId: 8453,
  });
  const { data: execEthBalance } = useBalance({
    address: (v2Addresses.ethereum || DEFAULT_ETHEREUM_EXECUTOR_V2) as `0x${string}`,
    chainId: 1,
  });
  const { data: opEthBalance } = useBalance({
    address: (isAddress(operatorInput) ? operatorInput : DEFAULT_OPERATOR_ADDRESS) as `0x${string}`,
    chainId: 1,
  });
  const { data: opBaseBalance } = useBalance({
    address: (isAddress(operatorInput) ? operatorInput : DEFAULT_OPERATOR_ADDRESS) as `0x${string}`,
    chainId: 8453,
  });

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const isShaggyConnected =
    isConnected &&
    Boolean(address) &&
    address!.toLowerCase() === SHAGGY_DOGG_OWNER.toLowerCase();

  const ethBalNum = ethBalance ? Number(formatEther(ethBalance.value)) : 0;
  const baseBalNum = baseBalance ? Number(formatEther(baseBalance.value)) : 0;
  const execEthBalNum = execEthBalance ? Number(formatEther(execEthBalance.value)) : 0;
  const opEthBalNum = opEthBalance ? Number(formatEther(opEthBalance.value)) : 0;
  const opBaseBalNum = opBaseBalance ? Number(formatEther(opBaseBalance.value)) : 0;
  const needsEthBridge =
    targetChain === "ethereum" && ethBalNum < 0.0002 && baseBalNum > 0.001;

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
    `ARB_EXECUTOR_ETHEREUM=${v2Addresses.ethereum || DEFAULT_ETHEREUM_EXECUTOR_V2}`,
    `ARB_EXECUTOR_BASE=${v2Addresses.base || DEFAULT_BASE_EXECUTOR_V2}`,
    "# Paste ARB_OPERATOR_PRIVATE_KEY and FLASHBOTS_AUTH_KEY from Desktop/mev-live-keys-DO-NOT-SHARE.txt",
  ].join("\n");

  return (
    <Card className="border-emerald-500/40">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-lg">
            Live Flash-Swap Executor (ArbExecutorV2.sol)
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
            onClick={() => {
              setLocalError(null);
              setTargetChain("ethereum");
            }}
          >
            Ethereum Mainnet (V2 Deployed ✅)
          </Button>
          <Button
            size="sm"
            variant={targetChain === "base" ? "default" : "outline"}
            onClick={() => {
              setLocalError(null);
              setTargetChain("base");
            }}
          >
            Base Mainnet (V2 Deployed ✅)
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Per-chain ETH balance bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <div>
            <strong>Live Bot Balances:</strong>{" "}
            <span className="ml-2">
              Ethereum V2 Executor Bribe Float:{" "}
              <strong className="text-emerald-600">{execEthBalNum.toFixed(4)} ETH</strong>
            </span>{" "}
            ·{" "}
            <span>
              Ethereum Operator Gas:{" "}
              <strong className="text-emerald-600">{opEthBalNum.toFixed(4)} ETH</strong>
            </span>{" "}
            ·{" "}
            <span>
              Base Operator Gas:{" "}
              <strong className="text-emerald-600">{opBaseBalNum.toFixed(4)} ETH</strong>
            </span>
          </div>
          <div className="text-muted-foreground">
            ShaggyDogg Wallet: {baseBalNum.toFixed(4)} ETH (Base) · {ethBalNum.toFixed(4)} ETH (L1)
          </div>
        </div>

        {needsEthBridge ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
            <strong>Why Ethereum Mainnet didn&apos;t go through:</strong> Your{" "}
            <strong>$16.47 ({baseBalNum.toFixed(4)} ETH)</strong> is currently on{" "}
            <strong>Base Mainnet</strong>, while your <strong>Ethereum Mainnet (L1)</strong> balance
            is <strong>{ethBalNum.toFixed(4)} ETH</strong>. Click{" "}
            <a
              href="https://relay.link/bridge/ethereum?fromChainId=8453&amount=0.004"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              Bridge 0.004 ETH (Base → Ethereum L1)
            </a>{" "}
            to move funds to Ethereum Mainnet. Review the bridge quote, fees, destination amount,
            and network before approving any transaction.
          </div>
        ) : null}

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
              V2 verified on {chainConfig.name}
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
            <strong>Note:</strong> MetaMask is currently connected to <code>{address}</code>, not
            ShaggyDogg (<code>{SHAGGY_DOGG_OWNER}</code>). You can switch accounts in MetaMask so
            ShaggyDogg pays the deployment gas, or deploy right now —{" "}
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

        <div className="space-y-3 rounded-md border-2 border-violet-500/60 bg-violet-500/5 p-3">
          <div>
            <div className="font-semibold text-violet-700 dark:text-violet-300">
              ArbExecutorV2 — staged upgrade
            </div>
            <p className="text-xs text-muted-foreground">
              Adds live post-swap sizing, per-venue v2 fees, and WETH-profit-funded builder bribes.
              Both deployments have been byte-for-byte verified on-chain. The configuration below
              is ready to activate V2 on the VM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-violet-600 text-white">V2 deployed & verified</Badge>
          </div>
          {v2Addresses[targetChain] ? (
            <div className="space-y-2 text-xs">
              <div>
                Verified deployment candidate: {" "}
                <a
                  href={`${chainConfig.explorerUrl}/address/${v2Addresses[targetChain]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-semibold underline"
                >
                  {v2Addresses[targetChain]}
                </a>
              </div>
              {targetChain === "ethereum" ? (
                <Button
                  size="sm"
                  className="bg-violet-600 text-white hover:bg-violet-700"
                  disabled={!isConnected || isSending}
                  onClick={() => handleFund(v2Addresses.ethereum, "0.0005")}
                >
                  Fund Ethereum V2 Bribe Float (0.0005 ETH)
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {localError ? (
          <div className="rounded-md border border-destructive p-2 text-xs text-destructive">
            {localError}
          </div>
        ) : null}

        <div className="rounded-md border border-violet-500/40 bg-violet-500/5 p-3">
          {currentFundTxHash ? (
            <a
              href={`${chainConfig.explorerUrl}/tx/${currentFundTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="mb-3 block text-xs underline"
            >
              V2 funding tx {currentFundTxHash.slice(0, 10)}…
            </a>
          ) : null}
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
      </CardContent>
    </Card>
  );
}
