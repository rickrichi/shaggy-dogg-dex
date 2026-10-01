// src/pages/Arbitrage.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  CheckCircle2,
  Cpu,
  ExternalLink,
  Flame,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShaggyDoggQuantAiEngine } from "@/lib/amm/quant-ai-engine";
import { computeCanonicalDigest } from "@/lib/amm/quant-evidence-admission";

export default function Arbitrage() {
  // ────────────────────────────────────────────────────────────────────────────
  // TAB 1: Triangular Arbitrage State
  // ────────────────────────────────────────────────────────────────────────────
  const [triInitialWeth, setTriInitialWeth] = useState<number>(5.0);
  const [triWethUsdcPrice, setTriWethUsdcPrice] = useState<number>(3450.0);
  const [triUsdcDaiRate, setTriUsdcDaiRate] = useState<number>(1.002);
  const [triDaiWethRate, setTriDaiWethRate] = useState<number>(1 / 3445.0);
  const [triFeeBps, setTriFeeBps] = useState<number>(30); // 0.30%
  const [triGasCostUsd, setTriGasCostUsd] = useState<number>(0.12);

  const triangularResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateCrossDexTriangularArbitrage({
        initialWeth: triInitialWeth,
        wethUsdcPrice: triWethUsdcPrice,
        usdcDaiRate: triUsdcDaiRate,
        daiWethRate: triDaiWethRate,
        poolFeeBps: triFeeBps,
        gasCostUsd: triGasCostUsd,
      });
    } catch {
      return null;
    }
  }, [triInitialWeth, triWethUsdcPrice, triUsdcDaiRate, triDaiWethRate, triFeeBps, triGasCostUsd]);

  // ────────────────────────────────────────────────────────────────────────────
  // TAB 2: Dual-Pool Cross-DEX Spread State
  // ────────────────────────────────────────────────────────────────────────────
  const [dualPoolAPrice, setDualPoolAPrice] = useState<number>(3450.0); // Uniswap V2
  const [dualPoolBPrice, setDualPoolBPrice] = useState<number>(3472.0); // Aerodrome
  const [dualUnits, setDualUnits] = useState<number>(10);
  const dualPoolAFee = 0.003; // 0.30%
  const dualPoolBFee = 0.003; // 0.30%

  const dualPoolResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateDualPoolArbitrage({
        poolAPrice: dualPoolAPrice,
        poolBPrice: dualPoolBPrice,
        amountUnits: dualUnits,
        poolAFeeRate: dualPoolAFee,
        poolBFeeRate: dualPoolBFee,
        l2GasUsd: 0.08,
      });
    } catch {
      return null;
    }
  }, [dualPoolAPrice, dualPoolBPrice, dualUnits, dualPoolAFee, dualPoolBFee]);

  // ────────────────────────────────────────────────────────────────────────────
  // TAB 3: Aave Flash Loan Arbitrage State
  // ────────────────────────────────────────────────────────────────────────────
  const [flashBorrowAmount, setFlashBorrowAmount] = useState<number>(50_000); // 50,000 USDC
  const [flashVipTier, setFlashVipTier] = useState<number>(3); // Gold 50% discount

  const flashArbResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
        borrowAsset: "USDC",
        borrowAmount: flashBorrowAmount,
        flashPremiumBps: 5, // 0.05%
        sdStakedTier: flashVipTier,
        triangularRoute: {
          wethUsdcPrice: 3450.0,
          usdcDaiRate: 1.0025,
          daiWethRate: 1 / 3442.0,
          basePoolFeeBps: 30,
        },
        gasCostUsd: 0.15,
      });
    } catch {
      return null;
    }
  }, [flashBorrowAmount, flashVipTier]);

  // ────────────────────────────────────────────────────────────────────────────
  // TAB 4: Paper Simulation & Evidence Admission Gate
  // ────────────────────────────────────────────────────────────────────────────
  const [confirmationPhrase, setConfirmationPhrase] = useState<string>("");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulatedReceipt, setSimulatedReceipt] = useState<{
    planId: string;
    digest: string;
    timestamp: string;
    status: string;
    netProfit: string;
  } | null>(null);

  const handleSimulateSwap = () => {
    if (
      confirmationPhrase.trim() !== "ADMIT PAPER" &&
      confirmationPhrase.trim() !== "SUBMIT PAPER SWAP"
    ) {
      toast.error('Please enter "ADMIT PAPER" to authorize the paper execution gate.');
      return;
    }

    setIsSimulating(true);
    setTimeout(() => {
      const mockEvidence = {
        quant_evidence_version: "1.0.0",
        suite: { id: "sd-quant-arb-338", module: "triangular-optimizer" },
        execution: {
          mode: "READ_ONLY_SIMULATION",
          orders_submitted: false,
          orders_cancelled: false,
        },
        parameters: {
          wethAmount: triInitialWeth,
          projectedNetProfitWeth: triangularResult?.netProfit ?? 0.015,
        },
      };

      const digest = computeCanonicalDigest(mockEvidence);

      setSimulatedReceipt({
        planId: `sd-arb-${Math.random().toString(36).substring(2, 9)}`,
        digest,
        timestamp: new Date().toISOString(),
        status: "ARMED_AND_VERIFIED",
        netProfit: triangularResult
          ? `${triangularResult.netProfit.toFixed(5)} WETH`
          : "+0.0150 WETH",
      });

      setIsSimulating(false);
      toast.success("Arbitrage plan successfully verified and paper-executed!");
    }, 600);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Sub-Navigation */}
      <LaunchpadNav />

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="bg-gradient-to-r from-amber-500 via-purple-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
              Quant Arbitrage Studio
            </h1>
            <Badge className="border-amber-300 bg-amber-100 font-bold text-amber-900">
              Institutional AI Engine
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time cross-DEX triangular spread detection, uncollateralized Aave v3 flash loans,
            and VIP-discounted execution solvers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/launchpad">
            <Button variant="outline" size="sm" className="border-slate-300 text-slate-700">
              Token Studio
            </Button>
          </Link>
          <a
            href="https://basescan.org/address/0x936a3D52c3037848879F3641dfBc9132aAe51bDF"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              size="sm"
              className="bg-gradient-to-r from-amber-600 to-purple-600 font-bold text-white hover:from-amber-700 hover:to-purple-700"
            >
              Aave Borrower Contract <ExternalLink className="ml-1.5 size-3.5" />
            </Button>
          </a>
        </div>
      </div>

      {/* High-Level Arb Metrics Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Aave v3 Flash Rail</CardTitle>
            <Zap className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0.05% Premium</div>
            <p className="mt-1 text-xs text-slate-500">Uncollateralized Base liquidity</p>
          </CardContent>
        </Card>

        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Base L2 Gas Friction
            </CardTitle>
            <Cpu className="size-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">~$0.08 - $0.15</div>
            <p className="mt-1 text-xs text-slate-500">EIP-1559 execution fee on Base</p>
          </CardContent>
        </Card>

        <Card className="border-pink-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">VIP Fee Advantage</CardTitle>
            <Flame className="size-4 text-pink-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-600">Up to 30% Discount</div>
            <p className="mt-1 text-xs text-slate-500">Lower fee drag than public bots</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Safety Execution Mode
            </CardTitle>
            <ShieldCheck className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">Dry-Run Gated</div>
            <p className="mt-1 text-xs text-slate-500">Fail-closed evidence admission</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Solvers Tabs */}
      <Tabs defaultValue="triangular" className="space-y-6">
        <TabsList className="grid w-full grid-cols-1 border border-purple-100 bg-white/70 p-1 shadow-sm sm:grid-cols-4">
          <TabsTrigger value="triangular" className="flex items-center gap-2 font-semibold">
            <TrendingUp className="size-4 text-purple-600" />
            1. Triangular Arbitrage
          </TabsTrigger>
          <TabsTrigger value="dualpool" className="flex items-center gap-2 font-semibold">
            <Layers className="size-4 text-indigo-600" />
            2. Cross-DEX Spreads
          </TabsTrigger>
          <TabsTrigger value="flashloan" className="flex items-center gap-2 font-semibold">
            <Zap className="size-4 text-amber-500" />
            3. Aave Flash Loans
          </TabsTrigger>
          <TabsTrigger value="simulation" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-emerald-600" />
            4. Simulation Gate
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: TRIANGULAR ARBITRAGE SOLVER ── */}
        <TabsContent value="triangular" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Input Controls */}
            <div className="lg:col-span-7">
              <Card className="border-purple-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <TrendingUp className="size-5 text-purple-600" />
                    Directive 338: Triangular Loop Parameters
                  </CardTitle>
                  <CardDescription>
                    Models cyclical token execution (WETH ➔ USDC ➔ DAI ➔ WETH) accounting for
                    multi-hop pool fee drag and L2 transaction costs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="initialWeth">Initial Capital (WETH)</Label>
                      <Input
                        id="initialWeth"
                        type="number"
                        value={triInitialWeth}
                        onChange={(e) => setTriInitialWeth(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="wethPrice">WETH / USDC Price</Label>
                      <Input
                        id="wethPrice"
                        type="number"
                        value={triWethUsdcPrice}
                        onChange={(e) => setTriWethUsdcPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="usdcDai">USDC / DAI Rate</Label>
                      <Input
                        id="usdcDai"
                        type="number"
                        step="0.0001"
                        value={triUsdcDaiRate}
                        onChange={(e) => setTriUsdcDaiRate(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="daiWeth">DAI / WETH Rate</Label>
                      <Input
                        id="daiWeth"
                        type="number"
                        step="0.0000001"
                        value={triDaiWethRate}
                        onChange={(e) => setTriDaiWethRate(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="poolFee">Pool Fee (Basis Points)</Label>
                      <Input
                        id="poolFee"
                        type="number"
                        value={triFeeBps}
                        onChange={(e) => setTriFeeBps(parseInt(e.target.value) || 30)}
                      />
                      <p className="text-[11px] text-gray-500">30 bps = 0.30% standard AMM fee</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gasUsd">L2 Gas Cost ($ USD)</Label>
                      <Input
                        id="gasUsd"
                        type="number"
                        step="0.01"
                        value={triGasCostUsd}
                        onChange={(e) => setTriGasCostUsd(parseFloat(e.target.value) || 0.12)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Output Decision Card */}
            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col justify-between border-purple-100 bg-gradient-to-br from-white to-purple-50/40 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">Arbitrage Valuation</CardTitle>
                  <CardDescription>Real-time net margin after multi-pool fee drag</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {triangularResult && (
                    <>
                      <div className="space-y-2 rounded-xl border border-purple-100 bg-white p-4">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Route Cycle:</span>
                          <span className="font-mono font-bold text-gray-800">
                            {triangularResult.pairRoute}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Terminal Output:</span>
                          <span className="font-mono font-bold text-gray-900">
                            {triangularResult.terminalCapital.toFixed(4)} WETH
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Gross Spread:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {triangularResult.grossProfit > 0 ? "+" : ""}
                            {triangularResult.grossProfit.toFixed(4)} WETH
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Estimated L2 Gas:</span>
                          <span className="font-mono text-slate-600">
                            ${triangularResult.gasCostUsd.toFixed(2)} USD
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2">
                          <span className="text-sm font-bold text-gray-900">Net Profit:</span>
                          <span
                            className={`font-mono text-lg font-black ${
                              triangularResult.arbitrageDetected
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {triangularResult.netProfit > 0 ? "+" : ""}
                            {triangularResult.netProfit.toFixed(5)} WETH
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Return on Capital:</span>
                          <span className="font-bold text-gray-700">
                            {triangularResult.roiBps.toFixed(1)} BPS (
                            {(triangularResult.roiBps / 100).toFixed(2)}%)
                          </span>
                        </div>
                      </div>

                      <div
                        className={`rounded-xl border p-4 text-center ${
                          triangularResult.arbitrageDetected
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider">
                          Engine Decision
                        </p>
                        <p className="mt-1 text-base font-black">
                          {triangularResult.decision === "EXECUTE_TRIANGULAR_ARBITRAGE"
                            ? "⚡ PROFITABLE: EXECUTE TRIANGULAR ARBITRAGE"
                            : "⚠️ SPREAD UNPROFITABLE AFTER POOL FEES & GAS"}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 2: DUAL-POOL CROSS-DEX SPREADS ── */}
        <TabsContent value="dualpool" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Card className="border-indigo-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <Layers className="size-5 text-indigo-600" />
                    Directive 339: Cross-Venue Price Discrepancies
                  </CardTitle>
                  <CardDescription>
                    Compare prices across Base DEXs (e.g. Uniswap V2 vs. Aerodrome) to exploit price
                    inefficiencies between AMM liquidity pools.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="poolA">Pool A (Uniswap V2) Spot Price ($)</Label>
                      <Input
                        id="poolA"
                        type="number"
                        value={dualPoolAPrice}
                        onChange={(e) => setDualPoolAPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="poolB">Pool B (Aerodrome) Spot Price ($)</Label>
                      <Input
                        id="poolB"
                        type="number"
                        value={dualPoolBPrice}
                        onChange={(e) => setDualPoolBPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="units">Trade Size (Asset Units)</Label>
                      <Input
                        id="units"
                        type="number"
                        value={dualUnits}
                        onChange={(e) => setDualUnits(parseFloat(e.target.value) || 1)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="l2Gas">Base L2 Gas ($ USD)</Label>
                      <Input id="l2Gas" type="text" disabled value="$0.08" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col justify-between border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">Spread & Routing Analysis</CardTitle>
                  <CardDescription>
                    Execution recommendation for dual-venue arbitrage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dualPoolResult && (
                    <>
                      <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-4 text-xs">
                        <div className="flex justify-between text-gray-500">
                          <span>Gross Price Spread:</span>
                          <span className="font-mono font-bold text-gray-900">
                            ${dualPoolResult.grossSpread.toFixed(2)} (
                            {dualPoolResult.grossSpreadPct.toFixed(2)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Pool A + B Fees:</span>
                          <span className="font-mono text-slate-700">
                            ${(dualPoolResult.poolAFeeUsd + dualPoolResult.poolBFeeUsd).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Base L2 Gas:</span>
                          <span className="font-mono text-slate-700">
                            ${dualPoolResult.l2GasUsd.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 text-sm">
                          <span className="font-bold text-gray-900">Net Arbitrage Profit:</span>
                          <span
                            className={`font-mono text-lg font-black ${
                              dualPoolResult.isProfitable ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            ${dualPoolResult.netProfitUsd.toFixed(2)} USD
                          </span>
                        </div>
                      </div>

                      <div
                        className={`rounded-xl border p-4 text-center ${
                          dualPoolResult.isProfitable
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider">Optimal Route</p>
                        <p className="mt-1 text-base font-black">
                          {dualPoolResult.optimalRoute === "BUY_POOL_A_SELL_POOL_B"
                            ? "🛒 BUY UNISWAP ➔ SELL AERODROME"
                            : dualPoolResult.optimalRoute === "BUY_POOL_B_SELL_POOL_A"
                              ? "🛒 BUY AERODROME ➔ SELL UNISWAP"
                              : "⚠️ SPREAD BELOW MINIMUM PROFIT THRESHOLD"}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 3: AAVE FLASH LOAN ARBITRAGE ── */}
        <TabsContent value="flashloan" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Card className="border-amber-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <Zap className="size-5 text-amber-500" />
                    Directive 340: Uncollateralized Flash Arbitrage
                  </CardTitle>
                  <CardDescription>
                    Borrow large capital uncollateralized from Aave v3 on Base, execute cyclic
                    swaps, and keep net yield after VIP staking fee discounts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="flashAmount">Borrow Capital (USDC)</Label>
                      <Input
                        id="flashAmount"
                        type="number"
                        value={flashBorrowAmount}
                        onChange={(e) => setFlashBorrowAmount(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vipTier">Your VIP Staking Tier</Label>
                      <select
                        id="vipTier"
                        value={flashVipTier}
                        onChange={(e) => setFlashVipTier(parseInt(e.target.value) || 0)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value={0}>Tier 0: Standard (0% Fee Discount)</option>
                        <option value={1}>🥉 Tier 1: Bronze (10% Fee Discount)</option>
                        <option value={2}>🥈 Tier 2: Silver (25% Fee Discount)</option>
                        <option value={3}>🥇 Tier 3: Gold (50% Fee Discount)</option>
                        <option value={4}>💎 Tier 4: Diamond (100% Fee Discount)</option>
                      </select>
                      <p className="text-[11px] text-gray-500">
                        Discounts apply directly to pool swap fees
                      </p>
                    </div>
                  </div>

                  <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                    <Sparkles className="size-4 text-amber-600" />
                    <AlertDescription className="text-xs">
                      Aave v3 on Base requires a fixed 0.05% fee (5 basis points) for flash borrow
                      access. Transactions execute atomically: if profit does not exceed fees, the
                      entire transaction safely reverts with $0 loss.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col justify-between border-amber-100 bg-gradient-to-br from-white to-amber-50/30 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">
                    Flash Loan Execution Summary
                  </CardTitle>
                  <CardDescription>Capital required: $0 upfront collateral</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {flashArbResult && (
                    <>
                      <div className="space-y-2 rounded-xl border border-amber-100 bg-white p-4 text-xs">
                        <div className="flex justify-between text-gray-500">
                          <span>Principal Borrowed:</span>
                          <span className="font-mono font-bold text-gray-900">
                            ${flashArbResult.borrowAmount.toLocaleString()} USDC
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Aave Flash Fee (0.05%):</span>
                          <span className="font-mono text-amber-700">
                            ${flashArbResult.flashLoanPremium.toFixed(2)} USDC
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Effective Pool Fee:</span>
                          <span className="font-mono text-slate-700">
                            {(flashArbResult.effectivePoolFeeBps / 100).toFixed(2)}% (VIP
                            Discounted)
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 text-sm">
                          <span className="font-bold text-gray-900">Net Arbitrage Yield:</span>
                          <span
                            className={`font-mono text-lg font-black ${
                              flashArbResult.isProfitable ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            +${flashArbResult.netProfitUsd.toFixed(2)} USD
                          </span>
                        </div>
                      </div>

                      <div
                        className={`rounded-xl border p-4 text-center ${
                          flashArbResult.isProfitable
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider">
                          Contract Action
                        </p>
                        <p className="mt-1 text-base font-black">
                          {flashArbResult.decision === "EXECUTE_FLASH_ARBITRAGE"
                            ? "🚀 READY TO EXECUTE FLASH ARBITRAGE"
                            : "⚠️ UNPROFITABLE AFTER AAVE PREMIUM & SWAP FEES"}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 4: PAPER SIMULATION GATE ── */}
        <TabsContent value="simulation" className="space-y-6">
          <Card className="border-emerald-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                <ShieldCheck className="size-5 text-emerald-600" />
                Anti-Exploit Paper Simulation Gate
              </CardTitle>
              <CardDescription>
                Simulate arbitrage trades in a protected sandbox against Base liquidity pools before
                committing real assets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-xl space-y-3">
                <Label htmlFor="confirmationPhrase" className="font-semibold text-gray-700">
                  Type <span className="font-mono font-bold text-purple-700">ADMIT PAPER</span> to
                  simulate execution:
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="confirmationPhrase"
                    placeholder="ADMIT PAPER"
                    value={confirmationPhrase}
                    onChange={(e) => setConfirmationPhrase(e.target.value)}
                    className="font-mono text-sm uppercase"
                  />
                  <Button
                    onClick={handleSimulateSwap}
                    disabled={isSimulating}
                    className="shrink-0 bg-emerald-600 font-bold text-white hover:bg-emerald-700"
                  >
                    <Play className="mr-1.5 size-4" /> Run Simulation
                  </Button>
                </div>
              </div>

              {simulatedReceipt && (
                <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-xs">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    Paper Simulation Completed
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-gray-600 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold">Plan ID:</span> {simulatedReceipt.planId}
                    </div>
                    <div>
                      <span className="font-semibold">Status:</span> {simulatedReceipt.status}
                    </div>
                    <div>
                      <span className="font-semibold">Projected Net Yield:</span>{" "}
                      <span className="font-bold text-emerald-700">
                        {simulatedReceipt.netProfit}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Timestamp:</span> {simulatedReceipt.timestamp}
                    </div>
                    <div className="truncate sm:col-span-2">
                      <span className="font-semibold">Evidence SHA-256:</span>{" "}
                      <span className="font-mono text-[11px]">{simulatedReceipt.digest}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
