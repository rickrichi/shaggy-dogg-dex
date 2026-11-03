// src/components/launchpad/LaunchStakingPanel.tsx
import { useEffect, useState } from "react";

import { Link2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { type Address, erc20Abi, formatUnits, parseAbi, parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useBytecode, usePublicClient, useReadContracts, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { positiveAmount } from "@/lib/amm/own-dex";
import { bufferedGas } from "@/lib/gas";
import { isLaunchStakingCode, launchStakingLink } from "@/lib/launchpad/stakingContract";

const STAKING_ABI = parseAbi([
  "function token() view returns (address)",
  "function minimumStakePeriod() view returns (uint256)",
  "function withdrawalFeeBps() view returns (uint16)",
  "function tiersLength() view returns (uint256)",
  "function tiers(uint256) view returns (uint256 stakeRequired, uint16 discountBps)",
  "function getTier(address) view returns (uint16)",
  "function stakedBalance(address) view returns (uint256)",
  "function unlockTimestamp(address) view returns (uint256)",
  "function stake(uint256)",
  "function unstake(uint256)",
]);
const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

/** Tiers shown; launches create four. */
const MAX_TIERS_SHOWN = 8;
const zeroAddress: Address = "0x0000000000000000000000000000000000000000";

const fmt = (units: bigint, decimals: number) =>
  Number(formatUnits(units, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 });
const pct = (bps: number) => `${bps / 100}%`;
const days = (seconds: bigint) => {
  const d = Number(seconds) / 86_400;
  return `${Number.isInteger(d) ? d : d.toFixed(2)} day${d === 1 ? "" : "s"}`;
};

interface LaunchStakingPanelProps {
  stakingAddress: Address;
  /**
   * "card" sits on a launched token's card and stays hidden unless the contract is recognised.
   * "page" is opened from a shared link and explains when it is not.
   */
  variant?: "card" | "page";
}

type Action = "stake" | "unstake";

/**
 * Stake and unstake for one launched token's staking contract (FeeDiscountStaking), with ordinary
 * wallet transactions. Only acts on contracts whose on-chain code is a launchpad staking build for
 * the token it reports, so a shared link cannot point holders at a look-alike.
 */
export function LaunchStakingPanel({ stakingAddress, variant = "card" }: LaunchStakingPanelProps) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { data: wallet } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const user = address ?? zeroAddress;
  const staking = { address: stakingAddress, abi: STAKING_ABI, chainId: base.id } as const;
  const { data: code, isLoading: codeLoading } = useBytecode({
    address: stakingAddress,
    chainId: base.id,
  });
  const { data: core, refetch: refetchCore } = useReadContracts({
    query: { refetchInterval: 15_000 },
    contracts: [
      { ...staking, functionName: "token" },
      { ...staking, functionName: "minimumStakePeriod" },
      { ...staking, functionName: "withdrawalFeeBps" },
      { ...staking, functionName: "tiersLength" },
      { ...staking, functionName: "getTier", args: [user] },
      { ...staking, functionName: "stakedBalance", args: [user] },
      { ...staking, functionName: "unlockTimestamp", args: [user] },
    ],
  });
  const token = core?.[0]?.result;
  const lockSeconds = core?.[1]?.result;
  const feeBps = core?.[2]?.result;
  const tierCount = Math.min(Number(core?.[3]?.result ?? 0n), MAX_TIERS_SHOWN);
  const discountBps = core?.[4]?.result ?? 0;
  const staked = core?.[5]?.result ?? 0n;
  const unlockAt = core?.[6]?.result ?? 0n;
  const verified = isLaunchStakingCode(code ?? undefined, token);

  const tokenContract = {
    address: token ?? zeroAddress,
    abi: TOKEN_ABI,
    chainId: base.id,
  } as const;
  const { data: details, refetch: refetchDetails } = useReadContracts({
    query: { enabled: verified, refetchInterval: 15_000 },
    contracts: [
      { ...tokenContract, functionName: "name" },
      { ...tokenContract, functionName: "symbol" },
      { ...tokenContract, functionName: "decimals" },
      { ...tokenContract, functionName: "balanceOf", args: [user] },
    ],
  });
  const { data: tierReads } = useReadContracts({
    query: { enabled: verified && tierCount > 0 },
    contracts: Array.from({ length: tierCount }, (_, i) => ({
      ...staking,
      functionName: "tiers" as const,
      args: [BigInt(i)] as const,
    })),
  });

  // Re-render when the lock ends so Unstake enables without a reload.
  const unlockSeconds = Number(unlockAt);
  useEffect(() => {
    if (unlockSeconds <= now) return;
    const timer = setTimeout(
      () => setNow(Math.floor(Date.now() / 1000)),
      Math.min((unlockSeconds - now) * 1000 + 500, 2 ** 31 - 1)
    );
    return () => clearTimeout(timer);
  }, [unlockSeconds, now]);

  if (!verified) {
    if (variant === "card") return null;
    const checking = codeLoading || (code && code !== "0x" && !core);
    return (
      <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        {checking
          ? "Checking this staking contract on Base..."
          : "This address is not a launchpad staking contract on Base. Ask the token's creator for the link from their launch."}
      </p>
    );
  }

  const name = details?.[0]?.result;
  const symbol = details?.[1]?.result ?? "tokens";
  const decimals = details?.[2]?.result ?? 18;
  const walletBalance = details?.[3]?.result;
  const tiers = (tierReads ?? [])
    .map((t) => t.result)
    .filter((t): t is readonly [bigint, number] => t !== undefined);
  const nextTier = tiers.find(([required, bps]) => bps > discountBps && required > staked);

  const units = positiveAmount(amount.trim(), decimals) ? parseUnits(amount.trim(), decimals) : 0n;
  const locked = staked > 0n && unlockSeconds > now;
  const fee = units > 0n && feeBps !== undefined ? (units * BigInt(feeBps)) / 10_000n : 0n;
  const restartsLock = staked > 0n && lockSeconds !== undefined && lockSeconds > 0n;

  const send = async (action: Action) => {
    if (!address || !wallet || !client) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (chainId !== base.id) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }
    if (units <= 0n || !token) return;
    if (action === "stake" && walletBalance !== undefined && units > walletBalance) {
      toast.error(`This wallet holds ${fmt(walletBalance, decimals)} ${symbol}.`);
      return;
    }
    if (action === "unstake" && units > staked) {
      toast.error(`You have ${fmt(staked, decimals)} ${symbol} staked.`);
      return;
    }
    setBusy(action);
    try {
      if (action === "stake") {
        const allowance = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, stakingAddress],
        });
        if (allowance < units) {
          const { request } = await client.simulateContract({
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [stakingAddress, units],
            account: address,
          });
          const approval = await wallet.writeContract(request);
          const approved = await client.waitForTransactionReceipt({ hash: approval });
          if (approved.status !== "success") throw new Error("Approval reverted");
        }
      }
      const call = {
        address: stakingAddress,
        abi: STAKING_ABI,
        functionName: action,
        args: [units],
        account: address,
      } as const;
      const { request } = await client.simulateContract(call);
      const gas = bufferedGas(await client.estimateContractGas(call));
      const hash = await wallet.writeContract({ ...request, gas });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Staking transaction reverted");
      toast.success(
        action === "stake"
          ? `Staked ${fmt(units, decimals)} ${symbol}.`
          : `Unstaked ${fmt(units, decimals)} ${symbol}.`
      );
      setAmount("");
      await Promise.all([refetchCore(), refetchDetails()]);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Staking transaction failed");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(launchStakingLink(stakingAddress));
      toast.success("Staking link copied. Share it with holders.");
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  const inputId = `stake-amount-${stakingAddress}`;
  return (
    <div className="space-y-2 rounded-lg border border-purple-100 bg-purple-50/40 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-slate-900">
          Stake {symbol}
          {variant === "page" && name && (
            <span className="font-normal text-slate-500"> ({name})</span>
          )}
        </p>
        <p className="text-slate-500">
          {lockSeconds !== undefined && lockSeconds > 0n ? `${days(lockSeconds)} lock` : "No lock"}
          {" · "}
          {feeBps !== undefined ? `${pct(feeBps)} unstake fee` : ""}
        </p>
      </div>
      {variant === "page" && token && (
        <p className="break-all text-slate-500">
          Token{" "}
          <a
            href={`https://basescan.org/token/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-indigo-600 hover:underline"
          >
            {token}
          </a>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 text-slate-600">
        <p>
          Your stake: <strong>{fmt(staked, decimals)}</strong>
        </p>
        <p>
          Wallet:{" "}
          <strong>{walletBalance !== undefined ? fmt(walletBalance, decimals) : "-"}</strong>
        </p>
        <p>
          Fee discount tier: <strong>{pct(discountBps)}</strong>
        </p>
        <p className="flex items-center gap-1">
          {locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
          {staked === 0n
            ? "Nothing staked"
            : locked
              ? `Locked until ${new Date(unlockSeconds * 1000).toLocaleString()}`
              : "Unlocked"}
        </p>
      </div>
      {tiers.length > 0 && (
        <p className="text-slate-500">
          Tiers:{" "}
          {tiers.map(([required, bps]) => `${fmt(required, decimals)} = ${pct(bps)}`).join(", ")}.
          {nextTier &&
            ` Stake ${fmt(nextTier[0] - staked, decimals)} more for ${pct(nextTier[1])}.`}{" "}
          Vaults linked to this token cut their fee on yield by your tier.
        </p>
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="text-slate-500">
            Amount of {symbol}
          </label>
          <span className="flex gap-2">
            {walletBalance !== undefined && walletBalance > 0n && (
              <button
                type="button"
                className="text-indigo-600 hover:underline"
                onClick={() => setAmount(formatUnits(walletBalance, decimals))}
              >
                Wallet max
              </button>
            )}
            {staked > 0n && (
              <button
                type="button"
                className="text-indigo-600 hover:underline"
                onClick={() => setAmount(formatUnits(staked, decimals))}
              >
                Staked max
              </button>
            )}
          </span>
        </div>
        <Input
          id={inputId}
          value={amount}
          inputMode="decimal"
          placeholder="0.0"
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy !== null}
          className="h-8 bg-white text-xs"
        />
      </div>
      {restartsLock && units > 0n && (
        <p role="note" className="rounded bg-amber-50 p-1.5 text-amber-800">
          Staking more restarts the {days(lockSeconds)} lock on your whole stake.
        </p>
      )}
      {units > 0n &&
        staked > 0n &&
        !locked &&
        feeBps !== undefined &&
        feeBps > 0 &&
        units <= staked && (
          <p className="text-slate-500">
            Unstaking this returns {fmt(units - fee, decimals)} {symbol} after the {pct(feeBps)}{" "}
            fee.
          </p>
        )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          onClick={() => void send("stake")}
          disabled={busy !== null || units === 0n}
          className="bg-purple-600 text-xs font-bold text-white hover:bg-purple-700"
        >
          {busy === "stake" ? "Staking..." : "Stake"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void send("unstake")}
          disabled={busy !== null || units === 0n || locked || units > staked}
          className="text-xs font-semibold"
        >
          {busy === "unstake" ? "Unstaking..." : "Unstake"}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="flex items-center gap-1 text-indigo-600 hover:underline"
      >
        <Link2 className="size-3" /> Copy staking link for holders
      </button>
    </div>
  );
}
