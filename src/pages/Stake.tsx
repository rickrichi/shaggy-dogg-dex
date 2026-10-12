// src/pages/Stake.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlock,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { erc20Abi, formatUnits, parseUnits, zeroAddress } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { RouterOperatorPanel } from "@/components/RouterOperatorPanel";
import { StakerRewardPoolPanel } from "@/components/StakerRewardPoolPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YieldVaultPanel } from "@/components/YieldVaultPanel";
import { positiveAmount } from "@/lib/amm/own-dex";
import { BASE_STAKING, STAKING_ABI } from "@/lib/staking";

interface TierInfo {
  name: string;
  required: number;
  discountBps: number;
  icon: string;
}

const activeConfig = BASE_STAKING;

export default function Stake() {
  const { address, isConnected, chainId, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: base.id });
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressSeconds, setProgressSeconds] = useState(0);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [recentTxHash, setRecentTxHash] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0n);
  const [stakedBalance, setStakedBalance] = useState(0n);
  const [discountBps, setDiscountBps] = useState(0);
  const [totalProtocolStaked, setTotalProtocolStaked] = useState(0n);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [lockSeconds, setLockSeconds] = useState(0n);
  const [unlockAt, setUnlockAt] = useState(0n);
  const [withdrawalFeeBps, setWithdrawalFeeBps] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const generation = useRef(0);
  const walletScope = useRef({ address, chainId });
  walletScope.current = { address, chainId };
  const dataReady = loadedFor === (address ?? "disconnected") && !dataError;

  useEffect(() => {
    setProgressSeconds(0);
    if (!isSubmitting) return;
    const started = Date.now();
    const timer = setInterval(
      () => setProgressSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [isSubmitting, progress]);

  const refreshOnChainData = useCallback(async () => {
    if (!publicClient) {
      setDataError("Base connection is unavailable. Refresh the page to reconnect.");
      return;
    }
    const request = ++generation.current;
    setIsRefreshing(true);
    const timeout = setTimeout(() => {
      if (request !== generation.current) return;
      generation.current++;
      setLoadedFor(null);
      setDataError("Base staking data took more than 30 seconds to load. Click Refresh to retry.");
      setIsRefreshing(false);
    }, 30_000);
    try {
      const staking = { address: activeConfig.stakingAddress, abi: STAKING_ABI } as const;
      const [token, decimals, held, balance, staked, discount, period, fee, timestamp, count] =
        await publicClient.multicall({
          allowFailure: false,
          contracts: [
            { ...staking, functionName: "token" },
            { address: activeConfig.tokenAddress, abi: erc20Abi, functionName: "decimals" },
            {
              address: activeConfig.tokenAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [activeConfig.stakingAddress],
            },
            {
              address: activeConfig.tokenAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address ?? zeroAddress],
            },
            { ...staking, functionName: "stakedBalance", args: [address ?? zeroAddress] },
            { ...staking, functionName: "getTier", args: [address ?? zeroAddress] },
            { ...staking, functionName: "minimumStakePeriod" },
            { ...staking, functionName: "withdrawalFeeBps" },
            { ...staking, functionName: "stakeTimestamp", args: [address ?? zeroAddress] },
            { ...staking, functionName: "tiersLength" },
          ],
        });
      if (request !== generation.current) return;
      if (token.toLowerCase() !== activeConfig.tokenAddress.toLowerCase() || decimals !== 18) {
        throw new Error("Staking token configuration does not match the deployed contract.");
      }
      if (count > 100n) throw new Error("Staking tier count exceeds the supported limit.");
      const tierValues =
        count === 0n
          ? []
          : await publicClient.multicall({
              allowFailure: false,
              contracts: Array.from({ length: Number(count) }, (_, index) => ({
                ...staking,
                functionName: "tiers" as const,
                args: [BigInt(index)] as const,
              })),
            });
      if (request !== generation.current) return;
      setTokenBalance(balance);
      setStakedBalance(staked);
      setDiscountBps(discount);
      setTotalProtocolStaked(held);
      setLockSeconds(period);
      setUnlockAt(timestamp + period);
      setWithdrawalFeeBps(fee);
      setTiers(
        tierValues.map(([required, bps], index) => ({
          name: `Tier ${index + 1}`,
          required: Number(formatUnits(required, 18)),
          discountBps: bps,
          icon: ["🥉", "🥈", "🥇", "💎"][index] ?? "★",
        }))
      );
      setDataError(null);
      setLoadedFor(address ?? "disconnected");
    } catch (err) {
      if (request !== generation.current) return;
      setLoadedFor(null);
      setDataError(err instanceof Error ? err.message : "Could not load Base staking data.");
    } finally {
      clearTimeout(timeout);
      if (request === generation.current) setIsRefreshing(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    setLoadedFor(null);
    setRecentTxHash(null);
    setSubmittedTxHash(null);
    void refreshOnChainData();
    return () => {
      generation.current++;
    };
  }, [refreshOnChainData]);

  const humanStaked = Number(formatUnits(stakedBalance, 18));
  const humanTokenBalance = Number(formatUnits(tokenBalance, 18));
  const currentDiscountPercent = (discountBps / 100).toFixed(1);
  const currentTier = useMemo(
    () => tiers.filter((t) => humanStaked >= t.required).at(-1),
    [tiers, humanStaked]
  );
  const nextTier = useMemo(
    () => [...tiers].sort((a, b) => a.required - b.required).find((t) => t.required > humanStaked),
    [tiers, humanStaked]
  );

  const transact = async (action: "stake" | "unstake") => {
    if (!address || !walletClient || !publicClient || !dataReady) {
      toast.error("Connect your wallet and refresh staking data first.");
      return;
    }
    const account = address;
    const assertWallet = async () => {
      if (
        walletScope.current.address !== account ||
        walletScope.current.chainId !== base.id ||
        (await walletClient.getChainId()) !== base.id ||
        (await walletClient.getAddresses())[0]?.toLowerCase() !== account.toLowerCase()
      ) {
        throw new Error("Connect the same wallet on Base Mainnet before continuing.");
      }
    };
    try {
      setIsSubmitting(true);
      setProgress("Checking your wallet and Base network");
      setRecentTxHash(null);
      await assertWallet();
      const trimmed = (action === "stake" ? stakeAmount : unstakeAmount).trim();
      if (!positiveAmount(trimmed, 18))
        throw new Error("Enter a positive token amount with at most 18 decimals.");
      const amount = parseUnits(trimmed, 18);
      if (action === "stake" && amount > tokenBalance)
        throw new Error("Amount exceeds your token balance.");
      if (action === "unstake" && amount > stakedBalance)
        throw new Error("Amount exceeds your staked balance.");
      if (action === "stake") {
        setProgress("Reading your token allowance from Base");
        // Read allowance again: approvals can change outside this page.
        const allowance = await publicClient.readContract({
          address: activeConfig.tokenAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, activeConfig.stakingAddress],
        });
        if (allowance < amount) {
          setProgress("Simulating token approval on Base");
          toast.info("Approve the staking amount in your wallet.");
          const { request } = await publicClient.simulateContract({
            address: activeConfig.tokenAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [activeConfig.stakingAddress, amount],
            account,
          });
          await assertWallet();
          setProgress("Waiting for you to confirm token approval in your wallet");
          const hash = await walletClient.writeContract({ ...request, chain: base });
          setSubmittedTxHash(hash);
          setProgress("Token approval submitted — waiting for Base confirmation");
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("Approval transaction reverted.");
          setSubmittedTxHash(null);
        }
      }
      setProgress(`Simulating ${action === "stake" ? "stake" : "withdrawal"} on Base`);
      const { request } = await publicClient.simulateContract({
        address: activeConfig.stakingAddress,
        abi: STAKING_ABI,
        functionName: action,
        args: [amount],
        account,
      });
      await assertWallet();
      setProgress(
        `Waiting for you to confirm ${action === "stake" ? "staking" : "withdrawal"} in your wallet`
      );
      const hash = await walletClient.writeContract({ ...request, chain: base });
      setSubmittedTxHash(hash);
      setProgress("Transaction submitted — waiting for Base confirmation");
      toast.info("Waiting for Base confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Staking transaction reverted.");
      if (walletScope.current.address === account) {
        setSubmittedTxHash(null);
        setRecentTxHash(hash);
        if (action === "stake") setStakeAmount("");
        else setUnstakeAmount("");
        setProgress("Transaction confirmed — refreshing your balance");
        await refreshOnChainData();
      }
      toast.success(action === "stake" ? "Stake confirmed." : "Withdrawal confirmed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Staking transaction failed.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleStake = () => transact("stake");
  const handleUnstake = () => transact("unstake");

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Sub-Navigation Bar */}
      <LaunchpadNav />

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
              Staking & VIP Loyalty
            </h1>
            <Badge className="border-purple-200 bg-purple-100 text-purple-800">
              {activeConfig.name}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Stake {activeConfig.tokenSymbol} to qualify for the fee tiers configured on Base
            Mainnet.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshOnChainData()}
            disabled={isRefreshing}
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className={`mr-2 size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <a
            href={`${activeConfig.explorerUrl}/address/${activeConfig.stakingAddress}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="border-slate-300 text-slate-700">
              Contract <ExternalLink className="ml-1.5 size-3.5" />
            </Button>
          </a>
        </div>
      </div>

      {/* Network Warning if not on Base */}
      {isConnected && chainId !== 8453 && (
        <Alert className="border-blue-300 bg-blue-50 text-blue-950">
          <AlertTriangle className="size-5 text-blue-600" />
          <AlertTitle className="font-semibold">Switch to Base Mainnet</AlertTitle>
          <AlertDescription className="mt-2 flex items-center justify-between">
            <span>
              You are connected to {chain?.name || `Chain ${chainId}`}. The canonical AMUTT VIP
              Staking contracts live on Base Mainnet.
            </span>
            <Button
              size="sm"
              onClick={() => switchChain({ chainId: 8453 })}
              disabled={isSwitchingChain}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSwitchingChain ? "Switching..." : "Switch to Base"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {dataError && (
        <Alert variant="destructive">
          <AlertTitle>Staking data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      )}
      {!dataReady && !dataError && <p role="status">Loading Base staking data…</p>}

      {(isSubmitting || submittedTxHash) && (
        <Alert>
          <AlertTitle>Staking progress</AlertTitle>
          <AlertDescription>
            <p role="status">
              {isSubmitting
                ? `${progress} · ${progressSeconds}s`
                : "A transaction was submitted. Check its status before retrying."}
            </p>
            {isSubmitting && progress.includes("in your wallet") && (
              <p>Open your wallet extension to review or reject the pending request.</p>
            )}
            {submittedTxHash && (
              <a
                className="underline"
                href={`${activeConfig.explorerUrl}/tx/${submittedTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View submitted transaction on BaseScan
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Cross-Link Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Need to create or seed new tokens?</p>
            <p className="text-xs text-gray-600">
              Launch new tokens or manage protocol parameters in the Token Studio & Protocol Hub.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/launchpad">
            <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-700">
              Launchpad Studio
            </Button>
          </Link>
          <Link to="/protocol">
            <Button
              size="sm"
              className="bg-indigo-600 font-semibold text-white hover:bg-indigo-700"
            >
              Protocol Hub <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Overview Grid */}
      <div
        style={{ display: dataReady ? undefined : "none" }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Your Staked Position */}
        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Your Staked Balance
            </CardTitle>
            <Lock className="size-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {humanStaked.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              <span className="text-sm font-medium text-purple-600">
                {activeConfig.tokenSymbol}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Wallet Balance:{" "}
              {humanTokenBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        {/* Current Fee Discount */}
        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Active Fee Discount
            </CardTitle>
            <Flame className="size-4 text-pink-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-600">{currentDiscountPercent}%</div>
            <p className="mt-1 text-xs text-slate-500">
              Applies only to contracts that integrate these tiers
            </p>
          </CardContent>
        </Card>

        {/* Current Tier */}
        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">VIP Loyalty Tier</CardTitle>
            <Award className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{currentTier ? currentTier.icon : "🌱"}</span>
              <span className="text-xl font-bold text-slate-900">
                {currentTier ? currentTier.name : "Standard Trader"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {nextTier
                ? `Stake ${(nextTier.required - humanStaked).toLocaleString()} more for ${nextTier.name}`
                : tiers.length
                  ? "Highest configured tier reached"
                  : "No tiers configured"}
            </p>
          </CardContent>
        </Card>

        {/* Protocol Total Staked */}
        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Tokens Held by Staking
            </CardTitle>
            <Layers className="size-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {Number(formatUnits(totalProtocolStaked, 18)).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}{" "}
              <span className="text-sm font-medium text-indigo-600">
                {activeConfig.tokenSymbol}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Contract balance, including any direct transfers
            </p>
          </CardContent>
        </Card>
      </div>

      <StakerRewardPoolPanel
        stakedBalance={stakedBalance}
        totalProtocolStaked={totalProtocolStaked}
        dataReady={dataReady}
      />

      <YieldVaultPanel />
      <RouterOperatorPanel />
      {/* Main Interactive Interface & Tiers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Staking / Unstaking Form */}
        <div className="lg:col-span-7">
          <Card className="border-purple-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                <ShieldCheck className="size-5 text-purple-600" />
                Manage Staked Position
              </CardTitle>
              <CardDescription>
                Approve {activeConfig.tokenSymbol}, then confirm your stake. Withdrawals follow the
                current contract settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="stake" className="space-y-5">
                <TabsList className="grid w-full grid-cols-2 border border-purple-100 bg-purple-50/50 p-1">
                  <TabsTrigger value="stake" className="flex items-center gap-2 font-semibold">
                    <Lock className="size-4" /> Stake Tokens
                  </TabsTrigger>
                  <TabsTrigger value="unstake" className="flex items-center gap-2 font-semibold">
                    <Unlock className="size-4" /> Withdraw
                  </TabsTrigger>
                </TabsList>

                {/* STAKE TAB */}
                <TabsContent value="stake" className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="stake-amount" className="font-semibold text-gray-700">
                        Amount to Stake
                      </Label>
                      <button
                        type="button"
                        onClick={() => setStakeAmount(formatUnits(tokenBalance, 18))}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-800"
                      >
                        Balance:{" "}
                        {humanTokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                        {activeConfig.tokenSymbol} (MAX)
                      </button>
                    </div>

                    <div className="relative">
                      <Input
                        id="stake-amount"
                        type="number"
                        placeholder="e.g. 50000"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        className="pr-20 text-lg font-medium"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">
                        {activeConfig.tokenSymbol}
                      </span>
                    </div>

                    {/* Percentage Quick Fill */}
                    <div className="flex gap-2 pt-1">
                      {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                        <Button
                          key={pct}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 border-purple-100 text-xs hover:bg-purple-50"
                          onClick={() => {
                            const val = (tokenBalance * BigInt(Math.floor(pct * 100))) / 100n;
                            setStakeAmount(formatUnits(val, 18));
                          }}
                        >
                          {pct === 1.0 ? "100%" : `${pct * 100}%`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600">
                    Approval is needed when your token allowance is insufficient. Staking again
                    resets the lock for your entire position.
                  </p>

                  <Button
                    onClick={() => void handleStake()}
                    disabled={
                      isSubmitting ||
                      !isConnected ||
                      chainId !== base.id ||
                      !dataReady ||
                      isRefreshing
                    }
                    className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 py-6 text-base font-bold text-white shadow-md hover:from-purple-700 hover:to-pink-700"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-5 animate-spin" />
                        Processing Staking...
                      </span>
                    ) : !isConnected ? (
                      <span className="flex items-center gap-2">
                        <Wallet className="size-5" /> Connect Wallet to Stake
                      </span>
                    ) : (
                      `Stake ${activeConfig.tokenSymbol}`
                    )}
                  </Button>
                </TabsContent>

                {/* UNSTAKE TAB */}
                <TabsContent value="unstake" className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="unstake-amount" className="font-semibold text-gray-700">
                        Amount to Withdraw
                      </Label>
                      <button
                        type="button"
                        onClick={() => setUnstakeAmount(formatUnits(stakedBalance, 18))}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-800"
                      >
                        Staked:{" "}
                        {humanStaked.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                        {activeConfig.tokenSymbol} (MAX)
                      </button>
                    </div>

                    <div className="relative">
                      <Input
                        id="unstake-amount"
                        type="number"
                        placeholder="e.g. 10000"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        className="pr-20 text-lg font-medium"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">
                        {activeConfig.tokenSymbol}
                      </span>
                    </div>

                    {/* Percentage Quick Fill */}
                    <div className="flex gap-2 pt-1">
                      {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                        <Button
                          key={pct}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 border-purple-100 text-xs hover:bg-purple-50"
                          onClick={() => {
                            const val = (stakedBalance * BigInt(Math.floor(pct * 100))) / 100n;
                            setUnstakeAmount(formatUnits(val, 18));
                          }}
                        >
                          {pct === 1.0 ? "100%" : `${pct * 100}%`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                    <AlertTriangle className="size-4 text-amber-600" />
                    <AlertDescription className="text-xs">
                      Withdrawing tokens recalculates your tier. Current withdrawal fee:{" "}
                      {dataReady ? `${withdrawalFeeBps / 100}%` : "unavailable"}. Minimum stake
                      period: {dataReady ? `${Number(lockSeconds)} seconds` : "unavailable"}.
                      {dataReady &&
                        stakedBalance > 0n &&
                        lockSeconds > 0n &&
                        ` Unlocks ${new Date(Number(unlockAt) * 1000).toLocaleString()}.`}
                    </AlertDescription>
                  </Alert>

                  <Button
                    onClick={() => void handleUnstake()}
                    disabled={
                      isSubmitting ||
                      !isConnected ||
                      chainId !== base.id ||
                      !dataReady ||
                      isRefreshing ||
                      stakedBalance === 0n
                    }
                    variant="outline"
                    className="w-full border-purple-300 py-6 text-base font-bold text-purple-700 hover:bg-purple-50"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-5 animate-spin" />
                        Processing Withdrawal...
                      </span>
                    ) : (
                      `Withdraw ${activeConfig.tokenSymbol}`
                    )}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Recent Tx Alert */}
              {recentTxHash && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    <span className="truncate">Transaction confirmed on {activeConfig.name}!</span>
                  </div>
                  <a
                    href={`${activeConfig.explorerUrl}/tx/${recentTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                  >
                    View <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* VIP Tiers Overview */}
        <div className="space-y-4 lg:col-span-5">
          <Card className="border-purple-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
                <Award className="size-5 text-amber-500" />
                VIP Staking Tiers
              </CardTitle>
              <CardDescription>
                Live contract tiers. Standard Uniswap V2 & V3 external pools charge their fixed fees; VIP discounts apply across integrated protocol vaults and DEX routers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(dataReady ? tiers : []).map((tier) => {
                const isCurrent = currentTier?.name === tier.name;
                const isUnlocked = humanStaked >= tier.required;

                return (
                  <div
                    key={tier.name}
                    className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                      isCurrent
                        ? "border-purple-500 bg-purple-50/80 shadow-sm ring-1 ring-purple-500"
                        : isUnlocked
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{tier.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900">{tier.name}</p>
                          {isCurrent && (
                            <Badge className="bg-purple-600 px-1.5 py-0 text-[10px] text-white">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          Requires {tier.required.toLocaleString()} {activeConfig.tokenSymbol}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-black text-pink-600">
                        {tier.discountBps / 100}%
                      </span>
                      <p className="text-[10px] font-semibold text-gray-400">DISCOUNT</p>
                    </div>
                  </div>
                );
              })}

              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                💡 <span className="font-semibold text-slate-700">Contract terms:</span> Staked
                tokens are held by the staking contract. Its administrators can change tiers, lock
                periods, and withdrawal fees.
              </div>

              <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5 text-xs text-indigo-900">
                <span>Looking to supply concentrated liquidity?</span>
                <Link to="/liquidity?version=v3" className="font-semibold text-indigo-700 underline hover:text-indigo-900">
                  Uniswap V3 Portal ↗
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
