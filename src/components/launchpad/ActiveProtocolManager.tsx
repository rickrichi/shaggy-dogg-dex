// src/components/launchpad/ActiveProtocolManager.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Droplets,
  ExternalLink,
  Layers,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Address,
  formatEther,
  parseEther,
  parseUnits,
} from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";
import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";

export const AMUTT_DEPLOYMENT = {
  tokenAddress: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7" as Address,
  stakingAddress: "0x055BB4eD8d5464C25D71391E940ce53CA30845fC" as Address,
  yieldVaultAddress: "0x16a1E9c10B913912b7B7df4649D9596D95ce33E6" as Address,
  flashBorrowerAddress: "0x936a3D52c3037848879F3641dfBc9132aAe51bDF" as Address,
  uniswapRouterAddress: CANONICAL_BASE_CONTRACTS.UniswapV2Router,
};

export function ActiveProtocolManager() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Liquidity Seeding State
  const [ethAmount, setEthAmount] = useState<string>("0.0005");
  const [tokenAmount, setTokenAmount] = useState<string>("50000000");
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [seedTxHash, setSeedTxHash] = useState<string | null>(null);

  // Staking Tiers State
  const [isSettingTiers, setIsSettingTiers] = useState<boolean>(false);
  const [tiersTxHash, setTiersTxHash] = useState<string | null>(null);

  // ────────────────────────────────────────────────────────────────────────────
  // Action 1: Add Liquidity ETH to Uniswap V2
  // ────────────────────────────────────────────────────────────────────────────
  const handleAddLiquidity = async () => {
    if (!isConnected || !address || !walletClient || !publicClient) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (chainId !== 8453) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }

    try {
      setIsSeeding(true);
      setSeedTxHash(null);

      const parsedEth = parseEther(ethAmount);
      const parsedTokens = parseUnits(tokenAmount, 18);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins

      // 5% slippage tolerance for pool genesis
      const minTokens = (parsedTokens * 95n) / 100n;
      const minEth = (parsedEth * 95n) / 100n;

      toast.info("Sending addLiquidityETH transaction to MetaMask...");

      const hash = await walletClient.writeContract({
        address: AMUTT_DEPLOYMENT.uniswapRouterAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "addLiquidityETH",
        args: [
          AMUTT_DEPLOYMENT.tokenAddress,
          parsedTokens,
          minTokens,
          minEth,
          address,
          deadline,
        ],
        value: parsedEth,
        account: address,
        chain: null,
      });

      toast.info("Transaction submitted! Waiting for Base confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setSeedTxHash(hash);
        toast.success("Uniswap V2 Pool successfully initialized on Base!");
      } else {
        throw new Error("Liquidity transaction reverted on-chain.");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to add liquidity.");
    } finally {
      setIsSeeding(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Action 2: Configure VIP Staking Tiers
  // ────────────────────────────────────────────────────────────────────────────
  const handleConfigureTiers = async () => {
    if (!isConnected || !address || !walletClient || !publicClient) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (chainId !== 8453) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }

    try {
      setIsSettingTiers(true);
      setTiersTxHash(null);

      const tiers = [
        { stakeRequired: parseUnits("10000", 18), discountBps: 500 }, // 10k AMUTT -> 5%
        { stakeRequired: parseUnits("50000", 18), discountBps: 1000 }, // 50k AMUTT -> 10%
        { stakeRequired: parseUnits("200000", 18), discountBps: 2000 }, // 200k AMUTT -> 20%
        { stakeRequired: parseUnits("1000000", 18), discountBps: 3000 }, // 1M AMUTT -> 30%
      ];

      toast.info("Submitting setTiers to FeeDiscountStaking via MetaMask...");

      const hash = await walletClient.writeContract({
        address: AMUTT_DEPLOYMENT.stakingAddress,
        abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
        functionName: "setTiers",
        args: [tiers],
        account: address,
        chain: null,
      });

      toast.info("Configuring tiers on Base Mainnet...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setTiersTxHash(hash);
        toast.success("VIP Staking Tiers successfully activated!");
      } else {
        throw new Error("Tier configuration transaction reverted.");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to set tiers.");
    } finally {
      setIsSettingTiers(false);
    }
  };

  return (
    <Card className="border-indigo-200 bg-gradient-to-b from-indigo-50/40 via-white to-purple-50/30 shadow-md">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Badge className="bg-indigo-600 text-white font-semibold flex items-center gap-1">
              <Sparkles className="size-3" /> Live Ecosystem Operations
            </Badge>
            <Badge variant="outline" className="border-indigo-300 text-indigo-800">
              Astro Mutt (AMUTT)
            </Badge>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            Token: {AMUTT_DEPLOYMENT.tokenAddress.slice(0, 6)}...{AMUTT_DEPLOYMENT.tokenAddress.slice(-4)}
          </span>
        </div>
        <CardTitle className="text-xl font-bold text-gray-900 mt-2">
          Protocol Management & Liquidity Console
        </CardTitle>
        <CardDescription>
          Complete the live ecosystem setup for your deployed Astro Mutt contracts on Base Mainnet.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Deployed Suite Registry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-purple-200 bg-white p-3 shadow-sm">
            <p className="text-gray-500 font-medium">1. Astro Mutt Token</p>
            <p className="font-bold text-gray-900 mt-1">100M Genesis Supply</p>
            <a
              href={`https://basescan.org/token/${AMUTT_DEPLOYMENT.tokenAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-purple-600 hover:underline flex items-center gap-1 mt-2 font-mono text-[11px]"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-sm">
            <p className="text-gray-500 font-medium">2. VIP Staking Vault</p>
            <p className="font-bold text-gray-900 mt-1">Single-Sided AMUTT</p>
            <a
              href={`https://basescan.org/address/${AMUTT_DEPLOYMENT.stakingAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline flex items-center gap-1 mt-2 font-mono text-[11px]"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>

          <div className="rounded-lg border border-blue-200 bg-white p-3 shadow-sm">
            <p className="text-gray-500 font-medium">3. Aave v3 Yield Vault</p>
            <p className="font-bold text-gray-900 mt-1">USDC Lending Yield</p>
            <a
              href={`https://basescan.org/address/${AMUTT_DEPLOYMENT.yieldVaultAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1 mt-2 font-mono text-[11px]"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-white p-3 shadow-sm">
            <p className="text-gray-500 font-medium">4. Flash Loan Borrower</p>
            <p className="font-bold text-gray-900 mt-1">Aave v3 Arbitrage</p>
            <a
              href={`https://basescan.org/address/${AMUTT_DEPLOYMENT.flashBorrowerAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-600 hover:underline flex items-center gap-1 mt-2 font-mono text-[11px]"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>
        </div>

        {/* ── OPERATION A: SEED LIQUIDITY ── */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="size-5 text-blue-600" />
              <h3 className="font-bold text-gray-900 text-base">Step 1: Initialize Uniswap V2 Pool</h3>
            </div>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200">50M AMUTT Pre-Approved</Badge>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Your 50,000,000 AMUTT allowance is already approved to the Uniswap V2 Router. Enter an initial ETH
            amount within your balance (e.g. 0.0005 ETH) to pair with AMUTT and launch the trading market.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ethAmount" className="text-xs font-semibold text-gray-700">ETH Liquidity Amount</Label>
              <Input
                id="ethAmount"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0005"
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tokenAmount" className="text-xs font-semibold text-gray-700">AMUTT Amount</Label>
              <Input
                id="tokenAmount"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="50000000"
                className="bg-white"
              />
            </div>
          </div>

          <Button
            onClick={handleAddLiquidity}
            disabled={isSeeding || !isConnected || chainId !== 8453}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold"
          >
            {isSeeding ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Seeding Uniswap V2 Pool...
              </>
            ) : (
              <>
                <Droplets className="mr-2 size-4" />
                Initialize Liquidity with MetaMask
              </>
            )}
          </Button>

          {seedTxHash && (
            <Alert className="border-blue-300 bg-white text-blue-950">
              <CheckCircle2 className="size-4 text-blue-600" />
              <AlertTitle className="text-sm font-bold">Uniswap V2 Pair Live!</AlertTitle>
              <AlertDescription className="text-xs">
                Transaction confirmed:{" "}
                <a
                  href={`https://basescan.org/tx/${seedTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline text-blue-700"
                >
                  {seedTxHash}
                </a>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ── OPERATION B: CONFIGURE VIP STAKING TIERS ── */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-indigo-600" />
              <h3 className="font-bold text-gray-900 text-base">Step 3: Activate VIP Staking Tiers</h3>
            </div>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Fee Discount Loyalty</Badge>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Configure the 4 VIP loyalty tiers on your FeeDiscountStaking contract to grant fee discounts to AMUTT stakers.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
              <span className="font-semibold text-gray-700">Tier 1: Bronze</span>
              <p className="text-gray-900 font-bold mt-0.5">10,000 AMUTT</p>
              <p className="text-indigo-600 text-[11px] font-medium">5% Fee Discount</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
              <span className="font-semibold text-gray-700">Tier 2: Silver</span>
              <p className="text-gray-900 font-bold mt-0.5">50,000 AMUTT</p>
              <p className="text-indigo-600 text-[11px] font-medium">10% Fee Discount</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
              <span className="font-semibold text-gray-700">Tier 3: Gold</span>
              <p className="text-gray-900 font-bold mt-0.5">200,000 AMUTT</p>
              <p className="text-indigo-600 text-[11px] font-medium">20% Fee Discount</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
              <span className="font-semibold text-gray-700">Tier 4: Diamond</span>
              <p className="text-gray-900 font-bold mt-0.5">1,000,000 AMUTT</p>
              <p className="text-indigo-600 text-[11px] font-medium">30% Fee Discount</p>
            </div>
          </div>

          <Button
            onClick={handleConfigureTiers}
            disabled={isSettingTiers || !isConnected || chainId !== 8453}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            {isSettingTiers ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Configuring Staking Tiers...
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 size-4" />
                Activate 4 VIP Tiers with MetaMask
              </>
            )}
          </Button>

          {tiersTxHash && (
            <Alert className="border-indigo-300 bg-white text-indigo-950">
              <CheckCircle2 className="size-4 text-indigo-600" />
              <AlertTitle className="text-sm font-bold">Staking Tiers Activated!</AlertTitle>
              <AlertDescription className="text-xs">
                Transaction confirmed:{" "}
                <a
                  href={`https://basescan.org/tx/${tiersTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline text-indigo-700"
                >
                  {tiersTxHash}
                </a>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Quick Navigation Links */}
        <div className="pt-2 flex flex-wrap gap-3">
          <Link to={`/swap?input=ETH&output=${AMUTT_DEPLOYMENT.tokenAddress}`}>
            <Button size="sm" variant="outline" className="border-purple-300 text-purple-900 hover:bg-purple-50">
              Test AMUTT Swap on DEX <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
          <Link to="/liquidity">
            <Button size="sm" variant="outline" className="border-blue-300 text-blue-900 hover:bg-blue-50">
              Go to Liquidity Manager <Droplets className="ml-1 size-3.5" />
            </Button>
          </Link>
          <Link to="/stake">
            <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-900 hover:bg-indigo-50">
              Go to Staking Portal <Layers className="ml-1 size-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
