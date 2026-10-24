// src/components/liquidity/LpLockCard.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { type Address, formatUnits, isAddressEqual } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SOVEREIGN_V3_TIMELOCK_ABI,
  SOVEREIGN_V3_TIMELOCK_ADDRESS,
  V3_POSITION_MANAGER_ABI,
} from "@/config/dex/v3TimelockAbi";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";

export const LOCKER_PLATFORMS = [
  {
    name: "UNCX Network",
    description: "Premier decentralized LP locker. Direct native support for Uniswap V3 position NFTs on Base.",
    url: "https://app.uncx.network/lockers/manage/lockers-v3",
    badge: "Official Base Partner",
    fee: "0.1 ETH",
  },
  {
    name: "FlokiFi Locker",
    description: "Multi-chain digital asset and NFT locker by Floki supporting Base liquidity locking.",
    url: "https://www.flokifi.com/",
    badge: "Audited by CertiK",
    fee: "$100 USDT",
  },
  {
    name: "Team Finance",
    description: "Audited liquidity locker supporting Base Uniswap V3 NFT positions.",
    url: "https://app.team.finance",
    badge: "Top Security Rating",
    fee: "$150 USD",
  },
] as const;

// Base Mainnet Contracts & Position
const SD_V3_POOL: Address = "0x449730674404a29856c6b1e5941549d73c5b8f10";
const SD_V3_NFT_TOKEN_ID = 6245990n;
const V3_POSITION_MANAGER: Address = CANONICAL_BASE_CONTRACTS.UniswapV3PositionManager;

type LockDuration = 3 | 12;

export function LpLockCard() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [selectedDuration, setSelectedDuration] = useState<LockDuration>(12);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showExternalLockers, setShowExternalLockers] = useState(false);

  // Live countdown state
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  } | null>(null);

  // 1. Check Owner of the Position NFT
  const {
    data: nftOwner,
    refetch: refetchNftOwner,
  } = useReadContract({
    address: V3_POSITION_MANAGER,
    abi: V3_POSITION_MANAGER_ABI,
    functionName: "ownerOf",
    args: [SD_V3_NFT_TOKEN_ID],
    chainId: 8453,
    query: {
      refetchInterval: 5_000,
    },
  });

  // 2. Check Timelock Details from Sovereign Contract
  const {
    data: lockData,
    refetch: refetchLock,
  } = useReadContract({
    address: SOVEREIGN_V3_TIMELOCK_ADDRESS,
    abi: SOVEREIGN_V3_TIMELOCK_ABI,
    functionName: "getLock",
    args: [SD_V3_NFT_TOKEN_ID],
    chainId: 8453,
    query: {
      refetchInterval: 5_000,
    },
  });

  // 3. Check Approval for Timelock Contract
  const {
    data: approvedAddress,
    refetch: refetchApproval,
  } = useReadContract({
    address: V3_POSITION_MANAGER,
    abi: V3_POSITION_MANAGER_ABI,
    functionName: "getApproved",
    args: [SD_V3_NFT_TOKEN_ID],
    chainId: 8453,
    query: {
      refetchInterval: 5_000,
    },
  });

  const {
    data: isApprovedForAll,
    refetch: refetchApprovalAll,
  } = useReadContract({
    address: V3_POSITION_MANAGER,
    abi: V3_POSITION_MANAGER_ABI,
    functionName: "isApprovedForAll",
    args: [userAddress ?? "0x0000000000000000000000000000000000000000", SOVEREIGN_V3_TIMELOCK_ADDRESS],
    chainId: 8453,
    query: {
      refetchInterval: 10_000,
    },
  });

  // 4. Query Accrued Trading Fees from Position Manager
  const {
    data: positionInfo,
    refetch: refetchPositionInfo,
  } = useReadContract({
    address: V3_POSITION_MANAGER,
    abi: V3_POSITION_MANAGER_ABI,
    functionName: "positions",
    args: [SD_V3_NFT_TOKEN_ID],
    chainId: 8453,
    query: {
      refetchInterval: 10_000,
    },
  });

  // Parse lock status
  const lockInfo = useMemo(() => {
    if (!lockData) return null;
    const [owner, unlockTimestamp, lockedAt, isLockedActive] = lockData;
    return {
      owner,
      unlockTimestamp: Number(unlockTimestamp),
      lockedAt: Number(lockedAt),
      isLockedActive,
    };
  }, [lockData]);

  const isPositionInTimelock = useMemo(() => {
    if (lockInfo?.owner && !isAddressEqual(lockInfo.owner, "0x0000000000000000000000000000000000000000")) return true;
    if (nftOwner && isAddressEqual(nftOwner, SOVEREIGN_V3_TIMELOCK_ADDRESS)) return true;
    return false;
  }, [nftOwner, lockInfo]);

  const isApproved = useMemo(() => {
    if (isApprovedForAll) return true;
    if (approvedAddress && isAddressEqual(approvedAddress, SOVEREIGN_V3_TIMELOCK_ADDRESS)) return true;
    return false;
  }, [isApprovedForAll, approvedAddress]);

  // Compute unlock timestamp for initial lock
  const previewUnlock = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const days = selectedDuration === 3 ? 90 : 365;
    const unlockTimestamp = now + days * 86400;
    const unlockDate = new Date(unlockTimestamp * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return { days, unlockTimestamp, unlockDate };
  }, [selectedDuration]);

  // Live countdown timer for active lock
  useEffect(() => {
    if (!isPositionInTimelock || !lockInfo || !lockInfo.unlockTimestamp) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = lockInfo.unlockTimestamp - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isPositionInTimelock, lockInfo]);

  // Handlers
  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const refetchAll = useCallback(() => {
    refetchNftOwner();
    refetchLock();
    refetchApproval();
    refetchApprovalAll();
    refetchPositionInfo();
    toast.info("Refreshed on-chain lock status from Base");
  }, [refetchNftOwner, refetchLock, refetchApproval, refetchApprovalAll, refetchPositionInfo]);

  // 1. Approve Sovereign Timelock to take custody of NFT
  const handleApprove = async () => {
    if (!userAddress) return;
    setIsApproving(true);
    try {
      toast.info("Approving Sovereign Timelock contract...");
      const hash = await writeContractAsync({
        address: V3_POSITION_MANAGER,
        abi: V3_POSITION_MANAGER_ABI,
        functionName: "approve",
        args: [SOVEREIGN_V3_TIMELOCK_ADDRESS, SD_V3_NFT_TOKEN_ID],
        chainId: 8453,
      });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error("Approval transaction reverted on-chain");
        }
      }
      toast.success("Sovereign Locker approved successfully!");
      refetchAll();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  // 2. Lock NFT into Sovereign Timelock
  const handleLockPosition = async () => {
    if (!userAddress) return;
    setIsLocking(true);
    try {
      const unlockTimestamp = BigInt(previewUnlock.unlockTimestamp);
      toast.info(`Locking NFT #${SD_V3_NFT_TOKEN_ID} for ${selectedDuration} Months...`);

      const hash = await writeContractAsync({
        address: SOVEREIGN_V3_TIMELOCK_ADDRESS,
        abi: SOVEREIGN_V3_TIMELOCK_ABI,
        functionName: "lockPosition",
        args: [SD_V3_NFT_TOKEN_ID, unlockTimestamp],
        chainId: 8453,
      });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error("Locking transaction reverted on-chain");
        }
      }
      toast.success(`Position locked cryptographically until ${previewUnlock.unlockDate}!`);
      refetchAll();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Locking transaction failed");
    } finally {
      setIsLocking(false);
    }
  };

  // 3. Harvest 100% of Accrued Trading Fees
  const handleHarvestFees = async () => {
    if (!userAddress) return;
    setIsHarvesting(true);
    try {
      toast.info("Harvesting 100% of accumulated trading fees...");

      const hash = await writeContractAsync({
        address: SOVEREIGN_V3_TIMELOCK_ADDRESS,
        abi: SOVEREIGN_V3_TIMELOCK_ABI,
        functionName: "harvestTradingFees",
        args: [SD_V3_NFT_TOKEN_ID],
        chainId: 8453,
      });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error("Fee harvest transaction reverted on-chain");
        }
      }
      toast.success("Trading fees harvested directly into your wallet!");
      refetchAll();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Fee harvest failed");
    } finally {
      setIsHarvesting(false);
    }
  };

  // 4. Withdraw Position after Lock expires
  const handleWithdraw = async () => {
    if (!userAddress) return;
    setIsWithdrawing(true);
    try {
      toast.info("Withdrawing unlocked Position NFT...");

      const hash = await writeContractAsync({
        address: SOVEREIGN_V3_TIMELOCK_ADDRESS,
        abi: SOVEREIGN_V3_TIMELOCK_ABI,
        functionName: "withdraw",
        args: [SD_V3_NFT_TOKEN_ID],
        chainId: 8453,
      });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error("Withdrawal transaction reverted on-chain");
        }
      }
      toast.success("Position NFT withdrawn back to your wallet!");
      refetchAll();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Unclaimed fees display
  const tokensOwed0 = positionInfo ? formatUnits(positionInfo[10] ?? 0n, 18) : "0.00";
  const tokensOwed1 = positionInfo ? formatUnits(positionInfo[11] ?? 0n, 18) : "0.00";

  const formattedUnlockDate = lockInfo?.unlockTimestamp
    ? new Date(lockInfo.unlockTimestamp * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : previewUnlock.unlockDate;

  return (
    <Card className="overflow-hidden border-indigo-200/80 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/30 shadow-md">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <CardHeader className="border-b border-indigo-100 bg-white/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 text-white shadow-sm">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-bold text-gray-900">
                  Sovereign V3 Liquidity Locker
                </CardTitle>
                <Badge className="border-indigo-300 bg-indigo-100 font-semibold text-indigo-900">
                  Base Mainnet
                </Badge>
                {isPositionInTimelock ? (
                  <Badge className="border-emerald-300 bg-emerald-500 text-white">
                    🔒 100% Locked Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    In Wallet (Ready to Lock)
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-gray-500">
                Cryptographically verified, non-custodial timelock. $0 middleman fees, 100% trading fee harvesting, and zero owner backdoors.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refetchAll}
              className="h-8 gap-1 text-xs text-gray-500 hover:text-indigo-600"
            >
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <a
              href={`https://base.blockscout.com/address/${SOVEREIGN_V3_TIMELOCK_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              <span>Verified Contract</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5">
        {/* ── Active Lock Dashboard (If Position is Locked in Contract) ─────── */}
        {isPositionInTimelock ? (
          <div className="space-y-5">
            {/* Lock Status Banner */}
            <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/40 p-5 shadow-xs">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span>Active Cryptographic Timelock</span>
                  </div>
                  <h3 className="mt-1 text-xl font-black text-gray-900">
                    NFT #{SD_V3_NFT_TOKEN_ID.toString()} (SD / WETH 1.0%)
                  </h3>
                  <p className="mt-1 text-xs text-gray-600">
                    Position is safely locked in your sovereign smart contract. Unlocks on{" "}
                    <span className="font-bold text-gray-900">
                      {lockInfo
                        ? new Date(lockInfo.unlockTimestamp * 1000).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "..."}
                    </span>
                    .
                  </p>
                </div>

                {/* Countdown Display */}
                {timeLeft && !timeLeft.isExpired ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white/90 p-3 text-center shadow-xs">
                    <div className="px-2">
                      <div className="text-xl font-black text-emerald-700">{timeLeft.days}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Days</div>
                    </div>
                    <div className="text-gray-300">:</div>
                    <div className="px-2">
                      <div className="text-xl font-black text-emerald-700">{timeLeft.hours}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Hours</div>
                    </div>
                    <div className="text-gray-300">:</div>
                    <div className="px-2">
                      <div className="text-xl font-black text-emerald-700">{timeLeft.minutes}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Mins</div>
                    </div>
                    <div className="text-gray-300">:</div>
                    <div className="px-2">
                      <div className="text-xl font-black text-emerald-700">{timeLeft.seconds}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Secs</div>
                    </div>
                  </div>
                ) : (
                  <Badge className="bg-emerald-600 px-3 py-1.5 text-xs text-white">
                    🔓 Timelock Elapsed (Ready to Withdraw)
                  </Badge>
                )}
              </div>
            </div>

            {/* Trading Fee Harvesting Station */}
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Coins className="size-4 text-purple-600" />
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Trading Fees Accrued While Locked
                    </span>
                    <Badge variant="outline" className="border-purple-300 bg-white text-[10px] text-purple-700">
                      100% Retained by You
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Whenever swaps occur on your pool, trading fees accumulate. Harvest 100% of accumulated fees anytime without touching your locked principal.
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500 italic">
                    Note: Uncollected fee growth is computed and settled on-chain upon harvest.
                  </p>

                  <div className="mt-3 flex items-center gap-6">
                    <div>
                      <span className="text-[11px] text-gray-500">Unclaimed SD:</span>
                      <div className="font-mono text-base font-bold text-gray-900">{tokensOwed0} SD</div>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500">Unclaimed WETH:</span>
                      <div className="font-mono text-base font-bold text-gray-900">{tokensOwed1} WETH</div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleHarvestFees}
                  disabled={isHarvesting || !isConnected}
                  className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm hover:from-indigo-700 hover:to-purple-700"
                >
                  <Coins className="size-4" />
                  {isHarvesting ? "Harvesting..." : "Harvest 100% Fees to Wallet"}
                </Button>
              </div>
            </div>

            {/* Withdrawal & Management */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <span className="block text-xs font-bold text-gray-900">Principal Withdrawal</span>
                <span className="text-xs text-gray-500">
                  {timeLeft && !timeLeft.isExpired
                    ? "Withdrawal button activates automatically once the lock timer reaches zero."
                    : "Lock duration has completed! You can now withdraw your NFT position back to your wallet."}
                </span>
              </div>

              <Button
                variant="outline"
                onClick={handleWithdraw}
                disabled={Boolean(timeLeft && !timeLeft.isExpired) || isWithdrawing || !isConnected}
                className={`gap-2 ${
                  timeLeft && !timeLeft.isExpired
                    ? "cursor-not-allowed opacity-60 text-gray-400"
                    : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {timeLeft && !timeLeft.isExpired ? (
                  <>
                    <Lock className="size-4" /> Locked Until {formattedUnlockDate}
                  </>
                ) : (
                  <>
                    <Unlock className="size-4" /> Withdraw Position NFT
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Deposit & Lock Flow (When NFT is Still in Wallet) ─────────────── */
          <div className="space-y-6">
            {/* Step 1: Duration Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                  Step 1: Choose Your Lock Duration
                </span>
                <span className="text-[11px] text-gray-500">Manual choice: 3 Months vs 12 Months</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 3 Months Option */}
                <div
                  onClick={() => setSelectedDuration(3)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    selectedDuration === 3
                      ? "border-indigo-600 bg-indigo-50/60 shadow-sm ring-2 ring-indigo-500/20"
                      : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className={`size-4 ${selectedDuration === 3 ? "text-indigo-600" : "text-gray-400"}`} />
                      <span className="text-sm font-bold text-gray-900">3 Month Lock (Quarterly)</span>
                    </div>
                    {selectedDuration === 3 ? (
                      <Badge className="bg-indigo-600 text-white">Active Choice</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">Select</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    90-day time lock. Offers agility while establishing proof of liquidity locking on Base.
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-indigo-100/60 pt-2 text-[11px] text-gray-500">
                    <span>Unlock Target:</span>
                    <span className="font-semibold text-indigo-900">~90 Days</span>
                  </div>
                </div>

                {/* 12 Months Option */}
                <div
                  onClick={() => setSelectedDuration(12)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    selectedDuration === 12
                      ? "border-purple-600 bg-purple-50/60 shadow-sm ring-2 ring-purple-500/20"
                      : "border-gray-200 bg-white hover:border-purple-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className={`size-4 ${selectedDuration === 12 ? "text-purple-600" : "text-gray-400"}`} />
                      <span className="text-sm font-bold text-gray-900">12 Month Lock (Annual Standard)</span>
                    </div>
                    {selectedDuration === 12 ? (
                      <Badge className="bg-purple-600 text-white">Active Choice</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">Select</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    365-day time lock. The gold standard for community trust. Proves mathematical security to investors.
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-purple-100/60 pt-2 text-[11px] text-gray-500">
                    <span>Unlock Target:</span>
                    <span className="font-semibold text-purple-900">~365 Days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Position NFT Summary Card */}
            <div className="rounded-xl border border-indigo-200/90 bg-white p-4 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-950">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span>Target Uniswap V3 Position NFT</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-gray-900">#{SD_V3_NFT_TOKEN_ID.toString()}</span>
                    <Badge variant="outline" className="text-[10px] text-slate-600">SD / WETH (1.0%)</Badge>
                    <span className="text-xs text-slate-500">Unlocks: <strong className="text-slate-900">{previewUnlock.unlockDate}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`https://base.blockscout.com/token/${V3_POSITION_MANAGER}/instance/${SD_V3_NFT_TOKEN_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:text-indigo-600"
                  >
                    <span>View NFT</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Step 2: Action Buttons */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between pb-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 2: Deposit into Sovereign Locker
                </span>
                <span className="text-[11px] text-slate-500">Total cost: ~$0.01 Base network gas (0% middleman fees)</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* 1. Approve Step */}
                <Button
                  onClick={handleApprove}
                  disabled={isApproved || isApproving || !isConnected}
                  className={`h-11 gap-2 font-semibold ${
                    isApproved
                      ? "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {isApproved ? (
                    <>
                      <Check className="size-4 text-emerald-600" /> 1. Locker Approved
                    </>
                  ) : isApproving ? (
                    "Approving Locker..."
                  ) : (
                    <>
                      <KeyRound className="size-4" /> 1. Approve Sovereign Locker
                    </>
                  )}
                </Button>

                {/* 2. Lock Step */}
                <Button
                  onClick={handleLockPosition}
                  disabled={!isApproved || isLocking || !isConnected}
                  className="h-11 gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 font-bold text-white shadow-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
                >
                  <Lock className="size-4" />
                  {isLocking ? "Locking Position..." : `2. Lock NFT (${selectedDuration} Months)`}
                </Button>
              </div>

              {!isConnected && (
                <p className="mt-2 text-center text-xs text-amber-700">
                  Connect your MetaMask wallet on Base to lock this liquidity position.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Key Contract Addresses Grid ─────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              On-Chain Contract Addresses (Base Mainnet)
            </span>
            <span className="text-[11px] text-slate-500">Verified cryptographic references</span>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {/* Sovereign Timelock */}
            <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50/30 px-3 py-2 text-xs">
              <div>
                <span className="block font-semibold text-purple-950">Sovereign Timelock</span>
                <span className="font-mono text-[11px] text-purple-700">
                  {SOVEREIGN_V3_TIMELOCK_ADDRESS.slice(0, 8)}...{SOVEREIGN_V3_TIMELOCK_ADDRESS.slice(-6)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 bg-white text-[11px]"
                onClick={() => handleCopy(SOVEREIGN_V3_TIMELOCK_ADDRESS, "timelock", "Timelock Address")}
              >
                {copiedKey === "timelock" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              </Button>
            </div>

            {/* SD / WETH V3 Pool */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs">
              <div>
                <span className="block font-semibold text-slate-700">SD / WETH V3 Pool (1.0%)</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {SD_V3_POOL.slice(0, 8)}...{SD_V3_POOL.slice(-6)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 bg-white text-[11px]"
                onClick={() => handleCopy(SD_V3_POOL, "pool", "V3 Pool Address")}
              >
                {copiedKey === "pool" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              </Button>
            </div>

            {/* Uniswap V3 Position Manager */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs">
              <div>
                <span className="block font-semibold text-slate-700">Position Manager</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {V3_POSITION_MANAGER.slice(0, 8)}...{V3_POSITION_MANAGER.slice(-6)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 bg-white text-[11px]"
                onClick={() => handleCopy(V3_POSITION_MANAGER, "mgr", "Position Manager Address")}
              >
                {copiedKey === "mgr" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Expandable Alternative External Lockers Drawer ─────────────── */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">
              Commercial Third-Party Lockers (UNCX, FlokiFi, Team Finance)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-indigo-600"
              onClick={() => setShowExternalLockers(!showExternalLockers)}
            >
              {showExternalLockers ? "Hide Commercial Lockers ▲" : "View Commercial Lockers ▼"}
            </Button>
          </div>

          {showExternalLockers && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {LOCKER_PLATFORMS.map((locker) => (
                <a
                  key={locker.name}
                  href={locker.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 transition-all hover:border-indigo-300 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 group-hover:text-indigo-600">{locker.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{locker.fee}</Badge>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{locker.description}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-indigo-600 group-hover:underline">
                    <span>Open External Locker</span>
                    <ExternalLink className="size-3" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Warning & Sovereign Policy ───────────────────────────────────── */}
        <Alert className="border-indigo-200 bg-indigo-50/60 text-indigo-950">
          <ShieldCheck className="size-4 text-indigo-700" />
          <AlertDescription className="text-xs leading-relaxed text-indigo-900">
            <strong>Sovereign Guarantee:</strong> Your liquidity is secured by smart contract logic on Base Mainnet. You retain 100% of trading fees generated by trades on your pool, you never surrender protocol authority, and only your wallet address can claim fees or withdraw the NFT when the lock timer expires.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
