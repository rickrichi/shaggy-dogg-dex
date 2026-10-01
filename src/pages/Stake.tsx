// src/pages/Stake.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { type Address, formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ERC20_ABI } from "@/config/abis";
import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";
import { signAndDepositWithPermit } from "@/lib/permit";

interface NetworkStakingConfig {
  name: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: Address;
  stakingAddress: Address;
  explorerUrl: string;
}

const NETWORK_CONFIGS: Record<number, NetworkStakingConfig> = {
  // Base Mainnet
  8453: {
    name: "Base Mainnet",
    tokenName: "Astro Mutt",
    tokenSymbol: "AMUTT",
    tokenAddress: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7",
    stakingAddress: "0x055BB4eD8d5464C25D71391E940ce53CA30845fC",
    explorerUrl: "https://basescan.org",
  },
  // Base Sepolia
  84532: {
    name: "Base Sepolia",
    tokenName: "Shaggy Dogg Token",
    tokenSymbol: "SDT",
    tokenAddress: "0x051c758521971f5c5a84edaf18eea12854375469",
    stakingAddress: "0x42134ccc6c41149cf71c7b4994e33ee66758af20",
    explorerUrl: "https://sepolia.basescan.org",
  },
};

const DEFAULT_CONFIG: NetworkStakingConfig = NETWORK_CONFIGS[8453]!;

interface TierInfo {
  name: string;
  required: number;
  discountBps: number;
  icon: string;
  color: string;
}

const VIP_TIERS: TierInfo[] = [
  {
    name: "Bronze VIP",
    required: 10_000,
    discountBps: 500,
    icon: "🥉",
    color: "from-amber-700 to-amber-900 text-amber-900 border-amber-300",
  },
  {
    name: "Silver VIP",
    required: 50_000,
    discountBps: 1000,
    icon: "🥈",
    color: "from-slate-400 to-slate-600 text-slate-800 border-slate-300",
  },
  {
    name: "Gold VIP",
    required: 200_000,
    discountBps: 2000,
    icon: "🥇",
    color: "from-yellow-400 to-amber-500 text-yellow-900 border-yellow-300",
  },
  {
    name: "Diamond VIP",
    required: 1_000_000,
    discountBps: 3000,
    icon: "💎",
    color: "from-cyan-400 to-blue-600 text-blue-950 border-cyan-300",
  },
];

export default function Stake() {
  const { address, isConnected, chainId, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const activeConfig = useMemo<NetworkStakingConfig>(() => {
    if (chainId && NETWORK_CONFIGS[chainId]) {
      return NETWORK_CONFIGS[chainId]!;
    }
    return DEFAULT_CONFIG;
  }, [chainId]);

  // Form states
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [unstakeAmount, setUnstakeAmount] = useState<string>("");
  const deadlineMins = 20;
  const [usePermit, setUsePermit] = useState<boolean>(true);

  // Loading states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [recentTxHash, setRecentTxHash] = useState<string | null>(null);

  // On-chain values
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [stakedBalance, setStakedBalance] = useState<bigint>(0n);
  const [discountBps, setDiscountBps] = useState<number>(0);
  const [totalProtocolStaked, setTotalProtocolStaked] = useState<bigint>(0n);

  // Refresh balances
  const refreshOnChainData = useCallback(async () => {
    if (!publicClient) return;

    try {
      setIsRefreshing(true);

      // Total protocol staked
      try {
        const total = await publicClient.readContract({
          address: activeConfig.stakingAddress,
          abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
          functionName: "totalStaked",
        });
        setTotalProtocolStaked(total as bigint);
      } catch {
        // contract might be uninitialized on testnets
      }

      if (!address) {
        setTokenBalance(0n);
        setAllowance(0n);
        setStakedBalance(0n);
        setDiscountBps(0);
        return;
      }

      // User token balance
      const [bal, userAllowance, staked, disc] = await Promise.all([
        publicClient
          .readContract({
            address: activeConfig.tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: activeConfig.tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, activeConfig.stakingAddress],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: activeConfig.stakingAddress,
            abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
            functionName: "stakedOf",
            args: [address],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: activeConfig.stakingAddress,
            abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
            functionName: "discountBpsOf",
            args: [address],
          })
          .catch(() => 0),
      ]);

      setTokenBalance(bal as bigint);
      setAllowance(userAllowance as bigint);
      setStakedBalance(staked as bigint);
      setDiscountBps(Number(disc));
    } catch (err) {
      console.error("Failed to load staking balances:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [publicClient, address, activeConfig]);

  useEffect(() => {
    void refreshOnChainData();
  }, [refreshOnChainData]);

  // Derived metrics
  const humanStaked = Number(formatUnits(stakedBalance, 18));
  const humanTokenBalance = Number(formatUnits(tokenBalance, 18));
  const currentDiscountPercent = (discountBps / 100).toFixed(1);

  const currentTier = useMemo(() => {
    if (humanStaked >= 1_000_000) return VIP_TIERS[3]!;
    if (humanStaked >= 200_000) return VIP_TIERS[2]!;
    if (humanStaked >= 50_000) return VIP_TIERS[1]!;
    if (humanStaked >= 10_000) return VIP_TIERS[0]!;
    return null;
  }, [humanStaked]);

  const nextTier = useMemo(() => {
    if (humanStaked >= 1_000_000) return null;
    if (humanStaked >= 200_000) return VIP_TIERS[3]!;
    if (humanStaked >= 50_000) return VIP_TIERS[2]!;
    if (humanStaked >= 10_000) return VIP_TIERS[1]!;
    return VIP_TIERS[0]!;
  }, [humanStaked]);

  // Handle Stake
  const handleStake = async () => {
    if (!isConnected || !address || !walletClient || !publicClient) {
      toast.error("Please connect your wallet first.");
      return;
    }

    const trimmed = stakeAmount.trim();
    if (!trimmed || Number(trimmed) <= 0) {
      toast.error("Please enter a valid positive staking amount.");
      return;
    }

    try {
      setIsSubmitting(true);
      setRecentTxHash(null);
      const parsedAmount = parseUnits(trimmed, 18);

      if (parsedAmount > tokenBalance) {
        toast.error(`Insufficient ${activeConfig.tokenSymbol} balance.`);
        return;
      }

      if (usePermit) {
        toast.info("Requesting EIP-2612 Permit signature in your wallet...");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMins * 60);

        const txHash = await signAndDepositWithPermit({
          publicClient,
          walletClient,
          token: activeConfig.tokenAddress,
          staking: activeConfig.stakingAddress,
          owner: address,
          value: parsedAmount,
          deadline,
          tokenName: activeConfig.tokenName,
        });

        toast.info("Transaction broadcast! Awaiting on-chain confirmation...");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === "success") {
          setRecentTxHash(txHash);
          toast.success(`Successfully staked ${trimmed} ${activeConfig.tokenSymbol}!`);
          setStakeAmount("");
          await refreshOnChainData();
        } else {
          throw new Error("Staking transaction reverted.");
        }
      } else {
        // Standard ERC20 Approve + Deposit
        if (allowance < parsedAmount) {
          toast.info(`Approving ${trimmed} ${activeConfig.tokenSymbol}...`);
          const approveHash = await walletClient.writeContract({
            address: activeConfig.tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [activeConfig.stakingAddress, parsedAmount],
            account: address,
            chain: null,
          });

          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          toast.success("Approval confirmed!");
        }

        toast.info("Depositing to FeeDiscountStaking...");
        const depositHash = await walletClient.writeContract({
          address: activeConfig.stakingAddress,
          abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
          functionName: "deposit",
          args: [parsedAmount],
          account: address,
          chain: null,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
        if (receipt.status === "success") {
          setRecentTxHash(depositHash);
          toast.success(`Successfully staked ${trimmed} ${activeConfig.tokenSymbol}!`);
          setStakeAmount("");
          await refreshOnChainData();
        } else {
          throw new Error("Deposit transaction reverted.");
        }
      }
    } catch (err) {
      console.error("Stake failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to stake tokens.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Unstake
  const handleUnstake = async () => {
    if (!isConnected || !address || !walletClient || !publicClient) {
      toast.error("Please connect your wallet first.");
      return;
    }

    const trimmed = unstakeAmount.trim();
    if (!trimmed || Number(trimmed) <= 0) {
      toast.error("Please enter a valid positive unstake amount.");
      return;
    }

    try {
      setIsSubmitting(true);
      setRecentTxHash(null);
      const parsedAmount = parseUnits(trimmed, 18);

      if (parsedAmount > stakedBalance) {
        toast.error("Amount exceeds your currently staked balance.");
        return;
      }

      toast.info("Submitting unstake withdrawal via wallet...");
      const withdrawHash = await walletClient.writeContract({
        address: activeConfig.stakingAddress,
        abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
        functionName: "withdraw",
        args: [parsedAmount],
        account: address,
        chain: null,
      });

      toast.info("Transaction submitted! Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

      if (receipt.status === "success") {
        setRecentTxHash(withdrawHash);
        toast.success(`Successfully withdrawn ${trimmed} ${activeConfig.tokenSymbol}!`);
        setUnstakeAmount("");
        await refreshOnChainData();
      } else {
        throw new Error("Withdraw transaction reverted.");
      }
    } catch (err) {
      console.error("Unstake failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to unstake tokens.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            Stake {activeConfig.tokenSymbol} in single-sided vaults to unlock 5% to 30% trading fee
            discounts across the Shaggy Mutt DEX.
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="mt-1 text-xs text-slate-500">Applied automatically to all DEX swaps</p>
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
                : "Maximum VIP tier achieved! 🎉"}
            </p>
          </CardContent>
        </Card>

        {/* Protocol Total Staked */}
        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Total Staked (Ecosystem)
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
            <p className="mt-1 text-xs text-slate-500">Locked across all VIP participants</p>
          </CardContent>
        </Card>
      </div>

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
                Deposit {activeConfig.tokenSymbol} using gas-optimized EIP-2612 permits with zero
                prior allowance transactions, or withdraw whenever needed.
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

                  {/* Permit Options */}
                  <div className="flex items-center justify-between rounded-lg border border-purple-100 bg-purple-50/40 p-3 text-xs text-purple-900">
                    <div className="space-y-0.5">
                      <p className="font-semibold">EIP-2612 Gasless Permit</p>
                      <p className="text-purple-700">
                        Sign with wallet to approve and deposit in 1 step
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={usePermit ? "default" : "outline"}
                      onClick={() => setUsePermit(!usePermit)}
                      className={usePermit ? "bg-purple-600 text-white" : "border-purple-200"}
                    >
                      {usePermit ? "Permit Active" : "Standard Approve"}
                    </Button>
                  </div>

                  <Button
                    onClick={() => void handleStake()}
                    disabled={isSubmitting || !isConnected}
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
                      Withdrawing tokens immediately recalculates your VIP tier and fee discount.
                    </AlertDescription>
                  </Alert>

                  <Button
                    onClick={() => void handleUnstake()}
                    disabled={isSubmitting || !isConnected || stakedBalance === 0n}
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
                Tier discounts apply in real-time to every token swap on the Shaggy Mutt AMM router.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {VIP_TIERS.map((tier) => {
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
                💡 <span className="font-semibold text-slate-700">Non-Custodial Guarantee:</span>{" "}
                Your staked tokens remain fully owned by your wallet. You can withdraw your position
                anytime without penalty.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
