import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { getAccount, getWalletClient } from "@wagmi/core";
import { ExternalLink, RefreshCw } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useConfig, usePublicClient, useSwitchChain } from "wagmi";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { loadRewardManifests, readRewardStatus, verifyRewardDeployment } from "@/lib/reward-claims";
import { REWARD_ABI } from "@/lib/rewards";

import deploymentJson from "../../config/reward-deployment.json";

import type { Address, Hex } from "viem";
import type { RewardDeployment } from "@/lib/rewards";

type EpochStatus = Awaited<ReturnType<typeof readRewardStatus>>;
interface Transaction { hash: Hex; status: "submitted" | "confirmed" | "reverted" }
type Transactions = Record<string, Transaction>;

function loadTransactions(key: string): Transactions {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([epoch, tx]) =>
      /^[1-9][0-9]{0,77}$/.test(epoch) && tx && typeof tx === "object" &&
      /^0x[0-9a-fA-F]{64}$/.test(tx.hash) && ["submitted", "confirmed", "reverted"].includes(tx.status)
    ).slice(0, 520));
  } catch { return {}; }
}

export function RewardClaimsPanel({ deployment = deploymentJson as RewardDeployment }: { deployment?: RewardDeployment }) {
  const { address, isConnected, chainId } = useAccount();
  if (!deployment.distributor || deployment.epochOrigin === null) {
    return <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      USDC claims are not available yet. The approved terms require a deployed distributor and funded weekly allocations before rewards can be claimed.
    </p>;
  }
  if (!isConnected || !address) return <p className="text-sm text-slate-700">Connect your wallet to view your weekly USDC allocations.</p>;
  if (![8453, 84532].includes(deployment.chainId)) return <p role="alert">This reward network is not supported.</p>;
  return <WalletRewardClaims key={`${deployment.chainId}:${deployment.distributor}:${address}:${chainId}`}
    deployment={deployment} address={address} walletChainId={chainId} />;
}

function WalletRewardClaims({ deployment, address, walletChainId }: {
  deployment: RewardDeployment; address: Address; walletChainId: number | undefined;
}) {
  const config = useConfig();
  const client = usePublicClient({ chainId: deployment.chainId });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const storageKey = `amutt-claims:${deployment.chainId}:${deployment.distributor?.toLowerCase()}:${address.toLowerCase()}`;
  const [transactions, setTransactions] = useState<Transactions>(() => loadTransactions(storageKey));
  const explorer = deployment.chainId === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
  const network = deployment.chainId === 84532 ? "Base Sepolia" : "Base";
  const wrongChain = walletChainId !== deployment.chainId;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const rewards = useQuery({
    queryKey: ["amutt-claims", deployment.chainId, deployment.distributor, deployment.rewardToken, deployment.epochOrigin, address, walletChainId],
    queryFn: async ({ signal }) => {
      if (!client) throw new Error("The reward network is unavailable. Please reconnect your wallet.");
      await verifyRewardDeployment(client, deployment);
      const manifests = await loadRewardManifests(deployment, signal);
      const statuses: EpochStatus[] = [];
      for (let i = 0; i < manifests.length; i += 4) {
        statuses.push(...await Promise.all(manifests.slice(i, i + 4).map((manifest) => readRewardStatus(client, manifest, address))));
      }
      return statuses;
    },
    retry: false,
    refetchInterval: 30_000,
  });

  function saveTransaction(epochId: string, transaction: Transaction) {
    // Persist even if the user changed wallets while a transaction was being mined.
    const next = { ...loadTransactions(storageKey), [epochId]: transaction };
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Private browsing can disable storage. */ }
    if (active.current) setTransactions(next);
  }

  async function assertWallet() {
    const live = getAccount(config);
    if (!active.current || !live.isConnected || live.address?.toLowerCase() !== address.toLowerCase() || live.chainId !== deployment.chainId) {
      throw new Error("Your wallet or network changed. Review the allocation again.");
    }
    const wallet = await getWalletClient(config, { chainId: deployment.chainId });
    const [addresses, chain] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
    if (!active.current || addresses[0]?.toLowerCase() !== address.toLowerCase() || chain !== deployment.chainId) {
      throw new Error("Your wallet or network changed. Review the allocation again.");
    }
    return wallet;
  }

  async function claim(row: EpochStatus) {
    if (lock.current || !client || !row.valid || row.claimed || !row.allocation || wrongChain || transactions[row.manifest.epochId]?.status === "submitted") return;
    lock.current = true;
    setBusy(row.manifest.epochId);
    setError(null);
    let submitted = false;
    try {
      await assertWallet();
      await verifyRewardDeployment(client, deployment);
      const current = await readRewardStatus(client, row.manifest, address);
      if (!current.valid || current.claimed) throw new Error("This allocation is no longer claimable. Refresh its status.");
      await assertWallet();
      const { request } = await client.simulateContract({
        address: row.manifest.distributor, abi: REWARD_ABI, functionName: "claim", account: address,
        args: [BigInt(row.manifest.epochId), address, BigInt(row.allocation.amount), row.allocation.proof],
      });
      const wallet = await assertWallet();
      const hash = await wallet.writeContract({ ...request, account: address, chain: wallet.chain });
      submitted = true;
      saveTransaction(row.manifest.epochId, { hash, status: "submitted" });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
      saveTransaction(row.manifest.epochId, { hash: receipt.transactionHash, status: receipt.status === "success" ? "confirmed" : "reverted" });
      if (receipt.status !== "success") throw new Error("The claim transaction reverted. No reward was paid by this transaction.");
      if (active.current) await rewards.refetch();
    } catch (cause) {
      if (active.current) setError(submitted
        ? "Check the transaction receipt below. An unconfirmed transaction is still pending; do not submit it again."
        : cause instanceof Error ? cause.message : "The claim could not be submitted.");
    } finally {
      lock.current = false;
      if (active.current) setBusy(null);
    }
  }

  async function refresh() {
    setError(null);
    if (client) {
      for (const [epoch, transaction] of Object.entries(transactions)) {
        if (transaction.status !== "submitted") continue;
        try {
          const receipt = await client.getTransactionReceipt({ hash: transaction.hash });
          saveTransaction(epoch, { hash: receipt.transactionHash, status: receipt.status === "success" ? "confirmed" : "reverted" });
        } catch { /* Keep the submitted hash when the receipt is not available. */ }
      }
    }
    await rewards.refetch();
  }

  return <section aria-label="Weekly USDC claims" className="space-y-4 border-t border-purple-100 pt-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold text-slate-900">Your weekly USDC allocations</h3>
        <p className="mt-1 text-xs text-slate-600">{network} · {address.slice(0, 6)}…{address.slice(-4)} · Earlier allocations remain claimable after unstaking.</p></div>
      <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={rewards.isFetching || busy !== null}>
        <RefreshCw className="mr-1.5 size-3.5" /> Refresh
      </Button>
    </div>
    {wrongChain && <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      Switch to {network} to claim your USDC.
      <Button size="sm" disabled={switching} onClick={() => void switchChainAsync({ chainId: deployment.chainId }).catch(() => setError(`Switch to ${network} in your wallet, then try again.`))}>Switch to {network}</Button>
    </AlertDescription></Alert>}
    {rewards.isPending && <p role="status" className="text-sm text-slate-600">Checking your allocations and on-chain claim status…</p>}
    {(error || rewards.error) && <Alert variant="destructive"><AlertDescription>{error || (rewards.error instanceof Error ? rewards.error.message : "Unable to check rewards.")}</AlertDescription></Alert>}
    {!rewards.isPending && !rewards.error && rewards.data?.length === 0 && <p className="text-sm text-slate-600">No weekly allocations have been published yet.</p>}
    {!rewards.error && rewards.data?.map((row) => {
      const tx = transactions[row.manifest.epochId];
      const pending = tx?.status === "submitted";
      return <article key={row.manifest.epochId} className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-slate-600">Week {row.manifest.epochId} · {new Date(row.manifest.startTimestamp * 1000).toLocaleDateString()} – {new Date(row.manifest.endTimestamp * 1000).toLocaleDateString()}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{formatUnits(BigInt(row.allocation?.amount ?? "0"), 6)} <span className="text-sm">USDC</span></p>
          <p className="mt-1 text-xs text-slate-700">{!row.valid ? "Allocation does not match a funded on-chain record. Claims unavailable." : row.claimed ? "Claimed on-chain" : !row.allocation ? "No allocation for this wallet this week." : pending ? "Transaction submitted — confirmation pending" : "Available to claim"}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {row.allocation && <Button className="bg-purple-700 text-white hover:bg-purple-800" disabled={!row.valid || row.claimed || wrongChain || busy !== null || pending || rewards.isFetching}
            onClick={() => void claim(row)}>{busy === row.manifest.epochId ? "Processing claim…" : row.claimed ? "Claimed" : pending ? "Confirmation pending" : "Claim USDC"}</Button>}
          {tx && <a className="inline-flex items-center gap-1 text-xs text-purple-800 underline underline-offset-2" href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">
            {tx.status === "confirmed" ? "Confirmed receipt" : tx.status === "reverted" ? "Reverted receipt" : "View submitted transaction"}<ExternalLink className="size-3" />
          </a>}
        </div>
      </article>;
    })}
    <p className="text-xs leading-relaxed text-slate-600">Allocations use your verified stake over the full week. Claims pay this wallet directly; no USDC approval is needed. Network gas fees apply.</p>
  </section>;
}
