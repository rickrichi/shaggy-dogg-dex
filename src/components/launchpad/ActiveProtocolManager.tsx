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
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { type Address, parseEther, parseUnits } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { calculateMinimumAmountOut, INITIAL_SWAP_SLIPPAGE_BPS } from "@/lib/amm/swap-protection";
import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";

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

  // Initial Market Swap State
  const [swapEthAmount, setSwapEthAmount] = useState<string>("0.00005");
  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [swapTxHash, setSwapTxHash] = useState<string | null>(null);

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
        args: [AMUTT_DEPLOYMENT.tokenAddress, parsedTokens, minTokens, minEth, address, deadline],
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

  // ────────────────────────────────────────────────────────────────────────────
  // Action 3: One-Click Import Token into MetaMask (EIP-747)
  // ────────────────────────────────────────────────────────────────────────────
  const handleWatchToken = async () => {
    try {
      if (walletClient) {
        await walletClient.watchAsset({
          type: "ERC20",
          options: {
            address: AMUTT_DEPLOYMENT.tokenAddress,
            symbol: "AMUTT",
            decimals: 18,
          },
        });
        toast.success("Astro Mutt (AMUTT) added to MetaMask!");
        return;
      }

      const ethereum = (
        window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }
      ).ethereum;
      if (!ethereum) {
        toast.error("MetaMask provider not found.");
        return;
      }
      await ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: AMUTT_DEPLOYMENT.tokenAddress,
            symbol: "AMUTT",
            decimals: 18,
          },
        },
      });
      toast.success("Astro Mutt (AMUTT) added to MetaMask!");
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to add token to MetaMask.");
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Action 4: Execute Initial Market Trade (First Buy on Base Mainnet)
  // ────────────────────────────────────────────────────────────────────────────
  const handleExecuteInitialSwap = async () => {
    if (!isConnected || !address || !walletClient || !publicClient) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (chainId !== 8453) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }

    try {
      setIsSwapping(true);
      setSwapTxHash(null);

      const parsedEth = parseEther(swapEthAmount);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
      const path = [CANONICAL_BASE_CONTRACTS.WETH, AMUTT_DEPLOYMENT.tokenAddress];
      const quotedAmounts = await publicClient.readContract({
        address: AMUTT_DEPLOYMENT.uniswapRouterAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [parsedEth, path],
      });
      const quotedAmountOut = quotedAmounts[quotedAmounts.length - 1];
      if (quotedAmountOut === undefined) {
        throw new Error("Router returned an incomplete swap quote.");
      }
      const amountOutMin = calculateMinimumAmountOut(quotedAmountOut, INITIAL_SWAP_SLIPPAGE_BPS);

      toast.info("Quote secured with 0.5% slippage protection. Sending swap to MetaMask...");

      const hash = await walletClient.writeContract({
        address: AMUTT_DEPLOYMENT.uniswapRouterAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [amountOutMin, path, address, deadline],
        value: parsedEth,
        account: address,
        chain: null,
      });

      toast.info("Swap submitted! Awaiting Base confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setSwapTxHash(hash);
        toast.success(
          "Initial swap successful! Trading data is now live on DexScreener!"
        );
      } else {
        throw new Error("Swap transaction reverted.");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Swap failed.");
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <Card className="border-indigo-200 bg-gradient-to-b from-indigo-50/40 via-white to-purple-50/30 shadow-md">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Badge className="flex items-center gap-1 bg-indigo-600 font-semibold text-white">
              <Sparkles className="size-3" /> Live Ecosystem Operations
            </Badge>
            <Badge variant="outline" className="border-indigo-300 text-indigo-800">
              Astro Mutt (AMUTT)
            </Badge>
          </div>
          <span className="font-mono text-xs text-gray-500">
            Token: {AMUTT_DEPLOYMENT.tokenAddress.slice(0, 6)}...
            {AMUTT_DEPLOYMENT.tokenAddress.slice(-4)}
          </span>
        </div>
        <CardTitle className="mt-2 text-xl font-bold text-gray-900">
          Protocol Management & Liquidity Console
        </CardTitle>
        <CardDescription>
          Complete the live ecosystem setup for your deployed Astro Mutt contracts on Base Mainnet.
        </CardDescription>

        {/* 1-Click MetaMask Token Importer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-100/70 p-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🦊</span>
            <div>
              <p className="text-xs font-bold text-purple-950">1-Click MetaMask Token Importer</p>
              <p className="text-[11px] text-purple-800">
                Can't find the import button in MetaMask? Click below to prompt MetaMask directly.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleWatchToken}
            className="bg-purple-700 text-xs font-bold text-white shadow-sm hover:bg-purple-800"
          >
            Add AMUTT to MetaMask
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Deployed Suite Registry Grid */}
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-purple-200 bg-white p-3 shadow-sm">
            <p className="font-medium text-gray-500">1. Astro Mutt Token</p>
            <p className="mt-1 font-bold text-gray-900">100M Genesis Supply</p>
            <a
              href={`https://basescan.org/token/${AMUTT_DEPLOYMENT.tokenAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1 font-mono text-[11px] text-purple-600 hover:underline"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-sm">
            <p className="font-medium text-gray-500">2. VIP Staking Vault</p>
            <p className="mt-1 font-bold text-gray-900">Single-Sided AMUTT</p>
            <a
              href={`https://basescan.org/address/${AMUTT_DEPLOYMENT.stakingAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1 font-mono text-[11px] text-indigo-600 hover:underline"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>

          <div className="rounded-lg border border-blue-200 bg-white p-3 shadow-sm">
            <p className="font-medium text-gray-500">3. Aave v3 Yield Vault</p>
            <p className="mt-1 font-bold text-gray-900">USDC Lending Yield</p>
            <a
              href={`https://basescan.org/address/${AMUTT_DEPLOYMENT.yieldVaultAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1 font-mono text-[11px] text-blue-600 hover:underline"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-white p-3 shadow-sm">
            <p className="font-medium text-gray-500">4. Flash Loan Borrower</p>
            <p className="mt-1 font-bold text-gray-900">Aave v3 Arbitrage</p>
            <a
              href={`https://basescan.org/address/${AMUTT_DEPLOYMENT.flashBorrowerAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1 font-mono text-[11px] text-emerald-600 hover:underline"
            >
              BaseScan <ExternalLink className="size-2.5" />
            </a>
          </div>
        </div>

        {/* ── OPERATION A: SEED LIQUIDITY ── */}
        <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="size-5 text-blue-600" />
              <h3 className="text-base font-bold text-gray-900">
                Step 1: Initialize Uniswap V2 Pool
              </h3>
            </div>
            <Badge className="border-blue-200 bg-blue-100 text-blue-800">
              50M AMUTT Pre-Approved
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-gray-600">
            Your 50,000,000 AMUTT allowance is already approved to the Uniswap V2 Router. Enter an
            initial ETH amount within your balance (e.g. 0.0005 ETH) to pair with AMUTT and launch
            the trading market.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ethAmount" className="text-xs font-semibold text-gray-700">
                ETH Liquidity Amount
              </Label>
              <Input
                id="ethAmount"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0005"
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tokenAmount" className="text-xs font-semibold text-gray-700">
                AMUTT Amount
              </Label>
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
            className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700 sm:w-auto"
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
                  className="font-mono text-blue-700 underline"
                >
                  {seedTxHash}
                </a>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ── OPERATION B: CONFIGURE VIP STAKING TIERS ── */}
        <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-indigo-600" />
              <h3 className="text-base font-bold text-gray-900">
                Step 3: Activate VIP Staking Tiers
              </h3>
            </div>
            <Badge className="border-indigo-200 bg-indigo-100 text-indigo-800">
              Fee Discount Loyalty
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-gray-600">
            Configure the 4 VIP loyalty tiers on your FeeDiscountStaking contract to grant fee
            discounts to AMUTT stakers.
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
              <span className="font-semibold text-gray-700">Tier 1: Bronze</span>
              <p className="mt-0.5 font-bold text-gray-900">10,000 AMUTT</p>
              <p className="text-[11px] font-medium text-indigo-600">5% Fee Discount</p>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
              <span className="font-semibold text-gray-700">Tier 2: Silver</span>
              <p className="mt-0.5 font-bold text-gray-900">50,000 AMUTT</p>
              <p className="text-[11px] font-medium text-indigo-600">10% Fee Discount</p>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
              <span className="font-semibold text-gray-700">Tier 3: Gold</span>
              <p className="mt-0.5 font-bold text-gray-900">200,000 AMUTT</p>
              <p className="text-[11px] font-medium text-indigo-600">20% Fee Discount</p>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
              <span className="font-semibold text-gray-700">Tier 4: Diamond</span>
              <p className="mt-0.5 font-bold text-gray-900">1,000,000 AMUTT</p>
              <p className="text-[11px] font-medium text-indigo-600">30% Fee Discount</p>
            </div>
          </div>

          <Button
            onClick={handleConfigureTiers}
            disabled={isSettingTiers || !isConnected || chainId !== 8453}
            className="w-full bg-indigo-600 font-bold text-white hover:bg-indigo-700 sm:w-auto"
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
                  className="font-mono text-indigo-700 underline"
                >
                  {tiersTxHash}
                </a>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ── OPERATION: INITIAL MARKET TRADE ── */}
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-emerald-600" />
              <h3 className="text-base font-bold text-gray-900">
                Step 4: Execute Initial Market Trade (First Buy)
              </h3>
            </div>
            <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
              Live DEX Market Starter
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-gray-600">
            Execute the very first trade on your Uniswap V2 AMUTT/WETH pool. Swapping a tiny
            fraction of ETH (e.g. 0.00005 ETH ≈ $0.13) creates the first on-chain buy, establishes
            the initial USD price, draws the first candlestick on DexScreener, and activates 24h
            volume and price on DexScreener! The swap uses a fresh router quote, a 0.5%
            minimum-output floor, and a two-minute expiry so it cannot execute at an arbitrary
            price.
          </p>

          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="swapEthAmount" className="text-xs font-semibold text-gray-700">
              ETH Amount to Swap for AMUTT
            </Label>
            <Input
              id="swapEthAmount"
              value={swapEthAmount}
              onChange={(e) => setSwapEthAmount(e.target.value)}
              placeholder="0.00005"
              className="bg-white"
            />
          </div>

          <Button
            onClick={handleExecuteInitialSwap}
            disabled={isSwapping || !isConnected || chainId !== 8453}
            className="w-full bg-emerald-600 font-bold text-white hover:bg-emerald-700 sm:w-auto"
          >
            {isSwapping ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Executing Swap on Base...
              </>
            ) : (
              <>
                <TrendingUp className="mr-2 size-4" />
                Execute First Buy via MetaMask ({swapEthAmount} ETH)
              </>
            )}
          </Button>

          {swapTxHash && (
            <Alert className="border-emerald-300 bg-white text-emerald-950">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <AlertTitle className="text-sm font-bold">First Market Swap Confirmed!</AlertTitle>
              <AlertDescription className="mt-1 space-y-2 text-xs">
                <div>
                  Transaction hash:{" "}
                  <a
                    href={`https://basescan.org/tx/${swapTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-emerald-700 underline"
                  >
                    {swapTxHash}
                  </a>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="https://dexscreener.com/base/0x581B294FeC1A4332f17cf18B49D68087c09b6784"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-purple-700 hover:underline"
                  >
                    View on DexScreener <ExternalLink className="ml-1 size-3" />
                  </a>
                  <span className="text-gray-300">•</span>
                  <a
                    href="https://dexscreener.com/base/0x581B294FeC1A4332f17cf18B49D68087c09b6784"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    View on DexScreener <ExternalLink className="ml-1 size-3" />
                  </a>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Quick Navigation Links */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link to={`/swap?input=ETH&output=${AMUTT_DEPLOYMENT.tokenAddress}`}>
            <Button
              size="sm"
              variant="outline"
              className="border-purple-300 text-purple-900 hover:bg-purple-50"
            >
              Test AMUTT Swap on DEX <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
          <Link to="/liquidity">
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-900 hover:bg-blue-50"
            >
              Go to Liquidity Manager <Droplets className="ml-1 size-3.5" />
            </Button>
          </Link>
          <Link to="/stake">
            <Button
              size="sm"
              variant="outline"
              className="border-indigo-300 text-indigo-900 hover:bg-indigo-50"
            >
              Go to Staking Portal <Layers className="ml-1 size-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
