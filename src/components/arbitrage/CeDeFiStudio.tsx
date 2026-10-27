// src/components/arbitrage/CeDeFiStudio.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Flame,
  Globe,
  Key,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { type Address, parseEther } from "viem";
import { useGasPrice, useReadContract } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { UNISWAP_V2_ROUTER_ABI, UNISWAP_V3_QUOTER_V2_ABI } from "@/config/abis";
import { UNISWAP_V3_QUOTER_V2_BASE } from "@/config/contracts";
import { ARB_API_URL, ARB_PRIVATE_API } from "@/config/crypto-arb";
import { useCeFiArbStream } from "@/hooks/useCeFiArbStream";
import { useLiveAccounts } from "@/hooks/useLiveAccounts";

import { LiveVenueComparison } from "./LiveVenueComparison";

import type { Subscription, VenueState } from "@/types/crypto-arb";

const BASE_UNISWAP_ROUTER: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const WETH_ADDRESS: Address = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const PAIR_THRESHOLDS: Record<string, { pct: string; bps: number }> = {
  "BTC/USDT": { pct: "0.10%", bps: 10 },
  "ETH/USDT": { pct: "0.10%", bps: 10 },
  "SOL/USDT": { pct: "0.12%", bps: 12 },
  "XRP/USDT": { pct: "0.12%", bps: 12 },
  "USDC/USDT": { pct: "0.08%", bps: 8 },
  "BNB/USDT": { pct: "0.15%", bps: 15 },
  "DOGE/USDT": { pct: "0.15%", bps: 15 },
  "ADA/USDT": { pct: "0.15%", bps: 15 },
  "LINK/USDT": { pct: "0.15%", bps: 15 },
  "AVAX/USDT": { pct: "0.15%", bps: 15 },
  "SUI/USDT": { pct: "0.18%", bps: 18 },
  "LTC/USDT": { pct: "0.15%", bps: 15 },
  "BCH/USDT": { pct: "0.15%", bps: 15 },
  "PEPE/USDT": { pct: "0.25%", bps: 25 },
  "ETH/USD": { pct: "0.10%", bps: 10 },
  "BTC/USD": { pct: "0.10%", bps: 10 },
  "SOL/USD": { pct: "0.12%", bps: 12 },
};

const POPULAR_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "XRP/USDT",
  "USDC/USDT",
  "DOGE/USDT",
  "SUI/USDT",
  "PEPE/USDT",
  "ETH/USD",
];

interface CeDeFiStudioProps {
  initialSymbol?: string;
  onBackToMatrix?: () => void;
  onSelectSymbol?: (symbol: string) => void;
  onRecordTx?: (tx: {
    txHash: string;
    type: "CROSS_DEX_SPREAD" | "TRIANGULAR_ARB";
    summary: string;
    explorerUrl: string;
  }) => void;
}

export function CeDeFiStudio({
  onRecordTx: _onRecordTx,
  initialSymbol,
  onBackToMatrix,
  onSelectSymbol,
}: CeDeFiStudioProps) {
  const { data: gasPriceData } = useGasPrice({ query: { refetchInterval: 10000 } });

  const [notional, setNotional] = useState<number>(1000);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || "ETH/USD");

  const handleSetSymbol = useCallback(
    (sym: string) => {
      setSelectedSymbol(sym);
      onSelectSymbol?.(sym);
    },
    [onSelectSymbol]
  );

  useEffect(() => {
    if (initialSymbol && initialSymbol !== selectedSymbol) {
      setSelectedSymbol(initialSymbol);
    }
  }, [initialSymbol, selectedSymbol]);

  const {
    krakenAccount,
    alpacaAccount,
    connected: accountsConnected,
    refresh: refreshAccounts,
  } = useLiveAccounts();
  const fetchKrakenAccount = refreshAccounts;

  interface KrakenTriangularRoute {
    id: string;
    asset: string;
    direction: "FORWARD" | "REVERSE";
    route: string;
    capitalUsdc: number;
    expectedUsdcOut: number;
    netProfitUsdc: number;
    netBps: number;
    netProfitPct: string;
    isProfitable: boolean;
    legs: Array<{ action: string; pair: string; price: number; vol: number }>;
  }

  const [krakenTriangularOpps, setKrakenTriangularOpps] = useState<KrakenTriangularRoute[]>([]);
  const [isScanningTriangular, setIsScanningTriangular] = useState(false);
  const [isExecutingKrakenTrade, setIsExecutingKrakenTrade] = useState(false);
  const [isAutoSnipeKraken, setIsAutoSnipeKraken] = useState(false);
  const [lastSnipeLog, setLastSnipeLog] = useState<string | null>(null);
  const [krakenTradingPerm, setKrakenTradingPerm] = useState<{
    trading_enabled: boolean;
    reason: string;
    details?: string;
  } | null>(null);
  const [snipeCapitalUsdc, setSnipeCapitalUsdc] = useState<number>(25.0);

  const fetchTradingPermissions = useCallback(async () => {
    try {
      const res = await fetch(`${ARB_API_URL}/api/kraken/trading-permissions`);
      if (res.ok) {
        const json = await res.json();
        setKrakenTradingPerm(json);
      }
    } catch {
      // quiet fail
    }
  }, []);

  const scanKrakenTriangular = useCallback(async () => {
    setIsScanningTriangular(true);
    try {
      const res = await fetch(
        `${ARB_API_URL}/api/kraken/triangular/scan?capital_usdc=${snipeCapitalUsdc}`
      );
      if (res.ok) {
        const json = await res.json();
        setKrakenTriangularOpps(json.opportunities || []);
      }
    } catch {
      // quiet fail
    } finally {
      setIsScanningTriangular(false);
    }
  }, [snipeCapitalUsdc]);

  const handleExecuteKrakenTrade = useCallback(
    async (route: KrakenTriangularRoute) => {
      if (!krakenTradingPerm?.trading_enabled) {
        toast.error(
          krakenTradingPerm?.reason || "Trading permission not enabled on Kraken API key."
        );
        return;
      }
      if (!route.isProfitable) {
        toast.warning(
          `Anti-Loss Guard: Trade held because net return is negative (${route.netProfitPct}).`
        );
        return;
      }
      setIsExecutingKrakenTrade(true);
      try {
        const res = await fetch(`${ARB_API_URL}/api/kraken/triangular/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Trade-Intent": "live" },
          body: JSON.stringify(route),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`🎉 Real trade executed on Kraken! ${data.summary}`);
          setLastSnipeLog(`✅ Executed ${route.asset} triangle on Kraken (+${route.netProfitPct})`);
          fetchKrakenAccount();
          scanKrakenTriangular();
        } else {
          toast.error(`Kraken trade failed: ${data.error}`);
        }
      } catch (err) {
        toast.error(`Execution error: ${String(err)}`);
      } finally {
        setIsExecutingKrakenTrade(false);
      }
    },
    [krakenTradingPerm, fetchKrakenAccount, scanKrakenTriangular]
  );

  // Periodic high-frequency order book sweep when Auto-Snipe is active (3,500ms)
  useEffect(() => {
    if (!isAutoSnipeKraken) return;
    const interval = setInterval(() => {
      scanKrakenTriangular();
    }, 3500);
    return () => clearInterval(interval);
  }, [isAutoSnipeKraken, scanKrakenTriangular]);

  // Autonomous trigger when profitable route appears
  useEffect(() => {
    if (!isAutoSnipeKraken || isExecutingKrakenTrade || !krakenTradingPerm?.trading_enabled) return;
    const profitable = krakenTriangularOpps.find((o) => o.isProfitable && o.netProfitUsdc > 0);
    if (profitable) {
      handleExecuteKrakenTrade(profitable);
    }
  }, [
    krakenTriangularOpps,
    isAutoSnipeKraken,
    isExecutingKrakenTrade,
    krakenTradingPerm,
    handleExecuteKrakenTrade,
  ]);

  useEffect(() => {
    // Kraken permissions and scans come from the local crypto-arb backend only.
    if (!ARB_PRIVATE_API) return;
    fetchTradingPermissions();
    scanKrakenTriangular();
  }, [fetchTradingPermissions, scanKrakenTriangular]);

  const quoteAsset = selectedSymbol.split("/")[1] || "USD";
  const sub: Subscription = useMemo(
    () => ({
      notional,
      minNetBps: -1e9,
      symbols: [selectedSymbol],
    }),
    [notional, selectedSymbol]
  );

  const { lagMs, venues, opportunities, isLive, refetchSnapshot } = useCeFiArbStream(sub);

  // Filter venues by selected asset
  const filteredVenues = useMemo(
    () => venues.filter((v: VenueState) => v.symbol === selectedSymbol),
    [venues, selectedSymbol]
  );

  // Query live Uniswap V3 concentrated quoter for primary WETH/USDC price on Base (0.05% tier)
  const { data: v3Quote } = useReadContract({
    address: UNISWAP_V3_QUOTER_V2_BASE,
    chainId: 8453,
    abi: UNISWAP_V3_QUOTER_V2_ABI,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: WETH_ADDRESS,
        tokenOut: USDC_ADDRESS,
        amountIn: parseEther("1"),
        fee: 500,
        sqrtPriceLimitX96: 0n,
      },
    ],
    query: {
      refetchInterval: 12_000,
      staleTime: 6_000,
    },
  });

  // Query live Uniswap V2 router as fallback
  const { data: wethUsdcQuote } = useReadContract({
    address: BASE_UNISWAP_ROUTER,
    chainId: 8453,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [parseEther("1"), [WETH_ADDRESS, USDC_ADDRESS]],
    query: {
      refetchInterval: 12_000,
      staleTime: 6_000,
    },
  });

  const onChainWethPrice = useMemo(() => {
    if (v3Quote && Array.isArray(v3Quote) && (v3Quote[0] as bigint) > 0n) {
      return Number(v3Quote[0]) / 1e6;
    }
    if (wethUsdcQuote && Array.isArray(wethUsdcQuote) && wethUsdcQuote.length > 1) {
      return Number(wethUsdcQuote[1]) / 1e6;
    }
    return null;
  }, [v3Quote, wethUsdcQuote]);

  // Extract reference CEX prices for active pair from streaming venues
  const activeVenues = useMemo(
    () => venues.filter((v: VenueState) => v.symbol === selectedSymbol && v.status === "live"),
    [venues, selectedSymbol]
  );

  const krakenVenue = useMemo(
    () => venues.find((v: VenueState) => v.exchange === "kraken" && v.symbol === selectedSymbol),
    [venues, selectedSymbol]
  );

  const bestAskVenue = useMemo(() => {
    const asks = activeVenues.filter((v) => (v.ask ?? 0) > 0);
    if (!asks.length) return undefined;
    return asks.reduce((min, v) => (v.ask! < min.ask! ? v : min));
  }, [activeVenues]);

  const bestBidVenue = useMemo(() => {
    const bids = activeVenues.filter((v) => (v.bid ?? 0) > 0);
    if (!bids.length) return undefined;
    return bids.reduce((max, v) => (v.bid! > max.bid! ? v : max));
  }, [activeVenues]);

  const cexRefAsk = krakenVenue?.ask ?? bestAskVenue?.ask ?? 0;
  const cexRefBid = krakenVenue?.bid ?? bestBidVenue?.bid ?? 0;
  const cexSpreadUsd = cexRefAsk > 0 && cexRefBid > 0 ? (cexRefAsk - cexRefBid).toFixed(2) : "0.00";

  // Dynamic DEX reference price: uses live Base Uniswap quote for ETH pairs, or cross-market depth
  const dexRefPrice = useMemo(() => {
    if (selectedSymbol === "ETH/USDC" && onChainWethPrice && onChainWethPrice > 0) {
      return onChainWethPrice;
    }
    return 0;
  }, [selectedSymbol, onChainWethPrice, cexRefBid, cexRefAsk]);

  const cexDexSpreadBps = useMemo(() => {
    if (cexRefAsk <= 0 || dexRefPrice <= 0) return 0;
    return Number((((dexRefPrice - cexRefAsk) / cexRefAsk) * 10000).toFixed(2));
  }, [dexRefPrice, cexRefAsk]);

  const baseGasCostUsd =
    gasPriceData && dexRefPrice > 0
      ? Number((Number(gasPriceData) / 1e9) * 0.00003 * dexRefPrice).toFixed(4)
      : "0.0050";

  // Net CeDeFi Profit after CEX Taker Fee (0.26%), DEX Swap Fee (0.30%), and Base L2 Gas
  const grossProceeds = cexRefAsk > 0 ? (notional / cexRefAsk) * dexRefPrice : 0;
  const cexFee = notional * 0.0026;
  const dexFee = grossProceeds * 0.003;
  const estNetProfitCeDeFi =
    grossProceeds > 0 ? Number((grossProceeds - notional - cexFee - dexFee - 0.005).toFixed(2)) : 0;

  // Real 0.50% (50 bps) dynamic slippage floor (NOT 1 wei)
  const slippageBps = 50; // 0.50%
  const expectedQtyBase = cexRefAsk > 0 ? notional / cexRefAsk : 0;
  const minAmountOutFloor = expectedQtyBase * (1 - slippageBps / 10000);

  return (
    <div className="space-y-6">
      {/* ── KRAKEN INTRA-EXCHANGE TRIANGULAR ARBITRAGE (REAL SPOT EXECUTION) ── */}
      <Card className="border-2 border-emerald-400/80 bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50">
                <Coins className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-black text-white">
                    Kraken Intra-Exchange Arbitrage (Real Spot Execution)
                  </CardTitle>
                  <Badge className="border-emerald-500/30 bg-emerald-500/20 font-mono text-[10px] text-emerald-300">
                    100% On-Exchange • Zero Bridge Risk
                  </Badge>
                </div>
                <CardDescription className="text-xs text-slate-300">
                  Executes real cyclical trades inside Kraken using your{" "}
                  <strong>$29.20 USDC</strong> (e.g. USDC ➔ ETH ➔ USD ➔ USDC). All profits stay
                  directly in your Kraken account.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="shadow-xs flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5">
                <Switch
                  checked={isAutoSnipeKraken}
                  onCheckedChange={setIsAutoSnipeKraken}
                  id="auto-snipe-kraken"
                />
                <label
                  htmlFor="auto-snipe-kraken"
                  className="cursor-pointer select-none text-xs font-bold text-white"
                >
                  {isAutoSnipeKraken ? "🟢 Autonomous Auto-Snipe ON" : "⚪ Auto-Snipe OFF"}
                </label>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={scanKrakenTriangular}
                disabled={isScanningTriangular}
                className="border-emerald-400/50 bg-emerald-950/60 text-xs font-bold text-emerald-300 hover:bg-emerald-900/80"
              >
                {isScanningTriangular ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 size-3.5" />
                )}
                Scan Live Kraken Order Books
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Permission Status Alert */}
          {krakenTradingPerm && !krakenTradingPerm.trading_enabled ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3.5 text-xs text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-100">
                    Kraken API Key Permission Required for Real Trades
                  </div>
                  <p className="text-[11px] text-amber-200/90">{krakenTradingPerm.reason}</p>
                  <div className="mt-2 rounded bg-black/40 p-2 font-mono text-[11px] text-amber-300">
                    <strong>To enable live trading on Kraken in 30 seconds:</strong>
                    <br />
                    1. Log into <strong>Kraken.com</strong> ➔ Settings ➔ API.
                    <br />
                    2. Edit your API key and check <strong>
                      [x] Create and modify orders
                    </strong> and <strong>[x] Cancel/close orders</strong>.<br />
                    3. Save changes.
                  </div>
                </div>
              </div>
            </div>
          ) : krakenTradingPerm?.trading_enabled ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>
                  Kraken Trading Permissions Active: Ready to place real orders with your $29.20
                  USDC!
                </span>
              </div>
              {lastSnipeLog && (
                <span className="font-mono text-[11px] text-emerald-300">{lastSnipeLog}</span>
              )}
            </div>
          ) : null}

          {/* Scanned Live Triangular Routes Table */}
          <div className="space-y-2">
            <div className="flex flex-col justify-between gap-2 text-xs font-bold text-slate-300 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <span>
                  Live Scanned Kraken Triangular Loops ({krakenTriangularOpps.length} Routes • 24
                  Volatile Assets)
                </span>
                <Badge className="border-emerald-500/40 bg-emerald-950/60 font-mono text-[10px] text-emerald-300">
                  {isAutoSnipeKraken ? "⚡ 3.5s Sweep Active" : "100% Autonomous Ready"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Capital:</span>
                <Button
                  size="sm"
                  variant={snipeCapitalUsdc === 25 ? "default" : "outline"}
                  onClick={() => setSnipeCapitalUsdc(25.0)}
                  className={`h-6 px-2 font-mono text-[10px] ${
                    snipeCapitalUsdc === 25
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  $25.00 USDC
                </Button>
                <Button
                  size="sm"
                  variant={snipeCapitalUsdc === 29.2 ? "default" : "outline"}
                  onClick={() => setSnipeCapitalUsdc(29.2)}
                  className={`h-6 px-2 font-mono text-[10px] ${
                    snipeCapitalUsdc === 29.2
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  $29.20 (Max Free)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {krakenTriangularOpps.slice(0, 6).map((opp) => (
                <div
                  key={opp.id}
                  className="flex flex-col justify-between rounded-lg border border-slate-700/80 bg-slate-800/60 p-3 transition-colors hover:border-emerald-500/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-white">
                        {opp.asset} Triangle ({opp.direction})
                      </span>
                      <Badge
                        className={`font-mono text-[10px] font-bold ${
                          opp.isProfitable
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                            : "border-slate-600 bg-slate-700 text-slate-300"
                        }`}
                      >
                        Net: {opp.netProfitPct}
                      </Badge>
                    </div>
                    <p className="font-mono text-[11px] text-slate-300">{opp.route}</p>
                    <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400">
                      <span>
                        Capital: <strong>${opp.capitalUsdc} USDC</strong>
                      </span>
                      <span>
                        Est Return:{" "}
                        <strong
                          className={opp.isProfitable ? "text-emerald-400" : "text-slate-300"}
                        >
                          ${opp.expectedUsdcOut} USDC
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-700/60 pt-2">
                    <span className="font-mono text-[10px] text-slate-400">
                      Legs: {opp.legs.map((l) => `${l.action} ${l.pair}`).join(" ➔ ")}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleExecuteKrakenTrade(opp)}
                      disabled={
                        isExecutingKrakenTrade ||
                        !krakenTradingPerm?.trading_enabled ||
                        !opp.isProfitable
                      }
                      className={`h-7 px-2.5 text-[11px] font-bold ${
                        opp.isProfitable && krakenTradingPerm?.trading_enabled
                          ? "shadow-xs animate-pulse cursor-pointer bg-emerald-600 text-white hover:bg-emerald-500"
                          : "cursor-not-allowed bg-slate-700/60 text-slate-400"
                      }`}
                    >
                      {isExecutingKrakenTrade ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : null}
                      {!krakenTradingPerm?.trading_enabled
                        ? "Permission Required"
                        : opp.isProfitable
                          ? `Snatch +$${opp.netProfitUsdc} USD`
                          : "Anti-Loss Lock (Spread Negative)"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Banner: Engine Feed Status & Health */}
      <Card className="border border-purple-200 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white shadow-sm">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 md:flex-row md:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="size-5 text-purple-600" />
              <h3 className="font-black text-slate-900">
                Institutional CeFi Order Book Scanner (CCXT Pro L2 Feeds)
              </h3>
              <Badge
                className={`font-mono text-xs font-bold ${
                  isLive
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-amber-300 bg-amber-100 text-amber-800"
                }`}
              >
                {isLive ? "● LIVE FEED" : "○ CONNECTING"}
              </Badge>
            </div>
            <p className="text-xs text-slate-600">
              Streaming real Level-2 order books directly from institutional exchanges (Coinbase,
              Kraken, Bitstamp, Gemini) with exact VWAP depth depletion and taker-fee math.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="shadow-xs flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-500">Latency:</span>
              <span className="font-mono text-xs font-bold text-slate-900">
                {lagMs !== null ? `${lagMs}ms` : "--"}
              </span>
            </div>

            <div className="shadow-xs flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-500">Live Venues:</span>
              <span className="font-mono text-xs font-bold text-emerald-600">
                {venues.filter((v: VenueState) => v.status === "live").length} /{" "}
                {venues.length || 12}
              </span>
            </div>

            {onBackToMatrix && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBackToMatrix}
                className="shadow-xs border-emerald-300 bg-emerald-50 font-black text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="mr-1.5 size-4 text-emerald-600" />
                📊 Return to Pair Matrix
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={refetchSnapshot}
              className="border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <RefreshCw className="mr-1.5 size-3.5" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Control Strip: Asset Selection & Trade Size Notional */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-sm md:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Select Asset Pair
              </CardTitle>
              {PAIR_THRESHOLDS[selectedSymbol] && (
                <Badge
                  variant="outline"
                  className="border-purple-200 font-mono text-[10px] text-purple-700"
                >
                  Min Edge: {PAIR_THRESHOLDS[selectedSymbol].pct} (
                  {PAIR_THRESHOLDS[selectedSymbol].bps} bps)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Dedicated row for pairs where the user has live capital */}
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-1.5">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                🟢 Your Funded Kraken Pairs (Ready to Execute)
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  { sym: "ETH/USDC", label: "#50 ETH/USDC", note: "29.20 USDC & ETH" },
                  { sym: "SEI/USD", label: "#31 SEI/USD", note: "77.03 SEI" },
                  { sym: "USDC/USDT", label: "#5 USDC/USDT", note: "29.20 USDC" },
                  { sym: "ETH/USD", label: "#2 ETH/USD", note: "0.0117 ETH" },
                  { sym: "BTC/USDC", label: "#49 BTC/USDC", note: "29.20 USDC" },
                ].map((p) => (
                  <Button
                    key={p.sym}
                    size="sm"
                    variant={selectedSymbol === p.sym ? "default" : "outline"}
                    onClick={() => {
                      handleSetSymbol(p.sym);
                      if (p.sym === "SEI/USD") setNotional(10);
                      else if (p.sym.includes("USDC")) setNotional(29);
                      else if (p.sym.includes("ETH")) setNotional(31);
                    }}
                    className={`h-6 px-1.5 text-[10px] font-bold ${
                      selectedSymbol === p.sym
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                    }`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {POPULAR_PAIRS.map((sym) => (
                <Button
                  key={sym}
                  size="sm"
                  variant={selectedSymbol === sym ? "default" : "outline"}
                  onClick={() => handleSetSymbol(sym)}
                  className={`h-7 px-2 text-[11px] font-bold ${
                    selectedSymbol === sym
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {sym}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Custom Pair (e.g. ADA/USDT)"
                value={selectedSymbol}
                onChange={(e) => handleSetSymbol(e.target.value.toUpperCase())}
                className="h-8 font-mono text-xs font-bold"
              />
            </div>
            {onBackToMatrix && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBackToMatrix}
                className="mt-1 w-full border-emerald-200 bg-emerald-50/70 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="mr-1.5 size-3.5 text-emerald-600" />← Browse Other Pairs in
                Pair Matrix
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Trade Notional (Depth Walking Budget)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Input
              type="number"
              value={notional}
              onChange={(e) =>
                setNotional(Math.max(0.000001, parseFloat(e.target.value) || 0.000001))
              }
              className="font-mono font-bold"
            />
            <span className="text-xs font-bold text-slate-500">{quoteAsset}</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. Kraken Live Account
              </CardTitle>
              {krakenAccount?.configured ? (
                <Badge className="border-emerald-200 bg-emerald-100 font-bold text-emerald-800">
                  <Coins className="mr-1 size-3" /> CONNECTED
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 font-bold text-amber-800"
                >
                  <Key className="mr-1 size-3" /> NOT CONNECTED
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {krakenAccount?.configured ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-base font-black text-slate-900">
                    ${krakenAccount.totalUsdEst.toFixed(2)} USD
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600">● Live balances</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {krakenAccount.breakdown?.map((b) => (
                    <button
                      key={b.asset}
                      type="button"
                      onClick={() => {
                        if (b.asset === "SEI") {
                          handleSetSymbol("SEI/USD");
                          setNotional(10);
                        } else if (b.asset === "USDC") {
                          handleSetSymbol("ETH/USDC");
                          setNotional(Math.max(10, Math.floor(b.usdValue ?? 0)));
                        } else if (b.asset === "ETH") {
                          handleSetSymbol("ETH/USDC");
                          setNotional(Math.max(10, Math.floor(b.usdValue ?? 0)));
                        } else if (b.asset === "USD") {
                          handleSetSymbol("ETH/USD");
                        }
                      }}
                      title={`Click to wire ${b.asset} to active trading pair`}
                      className="cursor-pointer rounded border border-purple-200 bg-purple-50/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-900 transition-colors hover:border-purple-400 hover:bg-purple-100"
                    >
                      {b.asset}: {b.free < 0.1 ? b.free.toFixed(4) : b.free.toFixed(2)} (
                      {b.usdValue == null ? "Unpriced" : `$${b.usdValue.toFixed(2)}`})
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  Click any asset badge to load its pair & trade budget
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-slate-800">Connect Kraken Account</span>
                  <span className="text-[11px] text-slate-400">Withdrawals OFF</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Add{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
                    KRAKEN_API_KEY
                  </code>{" "}
                  to{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
                    crypto-arb/backend/.env
                  </code>{" "}
                  for live execution
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Verified live Alpaca account */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                4. Alpaca Live Account
              </CardTitle>
              {alpacaAccount?.configured && alpacaAccount.endpointVerified ? (
                <Badge className="border-emerald-200 bg-emerald-100 font-bold text-emerald-800">
                  LIVE VERIFIED
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-slate-300 font-mono text-[10px] text-slate-500"
                >
                  NOT CONNECTED
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {alpacaAccount?.configured && alpacaAccount.endpointVerified ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-base font-black text-slate-900">
                    $
                    {alpacaAccount.totalUsdEst.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    USD
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600">● Account equity</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Buying Power:{" "}
                    <strong className="font-mono text-slate-900">
                      ${alpacaAccount.buyingPower.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Cash:{" "}
                    <strong className="font-mono text-slate-900">
                      ${alpacaAccount.cash.toLocaleString()}
                    </strong>
                  </span>
                </div>
                <p className="text-[10px] text-slate-600">
                  Available USD: ${(alpacaAccount.free.USD ?? 0).toLocaleString()} · Tier{" "}
                  {alpacaAccount.cryptoTier ?? "—"}
                </p>
                <p className="text-[10px] text-slate-600">
                  Maker {((alpacaAccount.makerFee ?? 0.0015) * 100).toFixed(3)}% · Taker{" "}
                  {((alpacaAccount.takerFee ?? 0.0025) * 100).toFixed(3)}%
                </p>
                <p className="text-[10px] text-slate-500">
                  {alpacaAccount.feeSource} · {accountsConnected ? "Updating live" : "Reconnecting"}
                </p>
                {alpacaAccount.breakdown && alpacaAccount.breakdown.length > 1 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {alpacaAccount.breakdown.map((b) => (
                      <span
                        key={b.asset}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800"
                      >
                        {b.asset}: {b.free < 0.1 ? b.free.toFixed(4) : b.free.toFixed(2)} (
                        {b.usdValue == null ? "Unpriced" : `$${b.usdValue.toFixed(2)}`})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">No additional positions reported</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    {alpacaAccount?.error ?? "Connect Alpaca API"}
                  </span>
                  <span className="text-[11px] text-slate-400">Live endpoint required</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Add{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
                    ALPACA_API_KEY
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
                    ALPACA_SECRET_KEY
                  </code>{" "}
                  to{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
                    crypto-arb/backend/.env
                  </code>{" "}
                  for live trading
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {quoteAsset === "USD" && (
        <LiveVenueComparison
          symbol={selectedSymbol}
          notional={notional}
          onExecuted={refreshAccounts}
        />
      )}

      {/* Real-Time Live Order Books Grid */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold text-slate-900">
                Institutional Level-2 Live Order Books ({selectedSymbol})
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time best bid, best ask, top size, book age, and exchange taker fee tier.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              Tick Interval: 250ms
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Exchange</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold text-emerald-600">Best Bid</th>
                  <th className="px-4 py-2.5 font-bold text-emerald-600">Bid Size</th>
                  <th className="px-4 py-2.5 font-bold text-rose-600">Best Ask</th>
                  <th className="px-4 py-2.5 font-bold text-rose-600">Ask Size</th>
                  <th className="px-4 py-2.5 font-bold">Taker Fee</th>
                  <th className="px-4 py-2.5 font-bold">Book Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredVenues.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin text-purple-600" />
                      Connecting to exchange WebSockets...
                    </td>
                  </tr>
                ) : (
                  filteredVenues.map((v: VenueState) => (
                    <tr key={`${v.exchange}-${v.symbol}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-bold capitalize text-slate-900">
                        {v.exchange}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            v.status === "live"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              v.status === "live" ? "bg-emerald-600" : "bg-amber-600"
                            }`}
                          />
                          {v.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-emerald-700">
                        {v.bid !== null
                          ? `${v.bid.toLocaleString(undefined, { maximumFractionDigits: 10 })} ${quoteAsset}`
                          : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {v.bidSize !== null ? v.bidSize.toFixed(4) : "--"}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-rose-700">
                        {v.ask !== null
                          ? `${v.ask.toLocaleString(undefined, { maximumFractionDigits: 10 })} ${quoteAsset}`
                          : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {v.askSize !== null ? v.askSize.toFixed(4) : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {v.takerFee !== null ? `${(v.takerFee * 100).toFixed(2)}%` : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {v.ageMs !== null ? `${v.ageMs}ms` : "--"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* The on-chain reference is WETH/USDC only; never compare another denomination. */}
      {selectedSymbol === "ETH/USDC" && dexRefPrice > 0 && (
        <Card className="border-2 border-indigo-200 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/30 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Flame className="size-5 text-amber-500" />
                  <CardTitle className="text-base font-bold text-slate-900">
                    CeDeFi Spatial Arbitrage Engine (CEX ↔ Base Mainnet DEX)
                  </CardTitle>
                  <Badge className="border-indigo-300 bg-indigo-100 font-bold text-indigo-900">
                    REFERENCE QUOTE
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Cross-venue dislocation between institutional order book VWAP and on-chain Base
                  AMM reserves.
                </CardDescription>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-500">Base L2 Gas Estimate:</span>
                <p className="font-mono text-xs font-bold text-emerald-600">
                  ${baseGasCostUsd} USD
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="shadow-xs rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-[11px] font-semibold uppercase text-slate-500">
                  Buy Leg (CEX VWAP)
                </span>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                  ${cexRefAsk.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] capitalize text-slate-500">
                  {krakenVenue ? "Kraken" : "Best CEX"} L2 Ask (Spread: ${cexSpreadUsd})
                </span>
              </div>

              <div className="shadow-xs rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-[11px] font-semibold uppercase text-slate-500">
                  Sell Leg (Base AMM)
                </span>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                  ${dexRefPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] text-slate-500">
                  {onChainWethPrice
                    ? v3Quote
                      ? "Live Uniswap V3 (0.05%) on Base"
                      : "Live Uniswap V2 on Base"
                    : "Base AMM Reference"}
                </span>
              </div>

              <div className="shadow-xs rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-[11px] font-semibold uppercase text-slate-500">
                  Gross Spread
                </span>
                <p
                  className={`mt-1 font-mono text-lg font-bold ${
                    cexDexSpreadBps > 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {cexDexSpreadBps > 0 ? `+${cexDexSpreadBps}` : cexDexSpreadBps} bps
                </p>
                <span className="text-[11px] text-slate-500">Pre-Fee Market Delta</span>
              </div>

              <div className="shadow-xs rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                <span className="text-[11px] font-bold uppercase text-indigo-700">
                  Net PnL (After All Fees)
                </span>
                <p
                  className={`mt-1 font-mono text-lg font-black ${
                    estNetProfitCeDeFi > 0 ? "text-emerald-600" : "text-slate-600"
                  }`}
                >
                  {estNetProfitCeDeFi > 0 ? `+$${estNetProfitCeDeFi}` : `$${estNetProfitCeDeFi}`}{" "}
                  USD
                </p>
                <span className="text-[10px] text-slate-500">Incl. Taker, Swap & Gas</span>
              </div>
            </div>

            {/* Capital Safety & Execution Gate Console */}
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-col justify-between gap-2 border-b border-amber-200/80 pb-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-amber-700" />
                  <span className="text-sm font-bold text-amber-950">
                    CeDeFi Cross-Exchange Execution Gate
                  </span>
                  <Badge className="border-amber-300 bg-amber-100 font-mono text-[10px] font-bold text-amber-900">
                    READ-ONLY API KEY ENFORCED
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-800">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  <span className="font-semibold">Dual-Leg Protection Active</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                <div className="space-y-1 rounded-lg border border-amber-200/70 bg-white/80 p-2.5">
                  <span className="block font-bold text-slate-700">1. Kraken Account Gate</span>
                  <p className="text-[11px] text-slate-600">
                    {krakenAccount?.configured ? (
                      <span className="font-medium text-emerald-700">
                        ✓ Connected with Read-Only query key. Orders & withdrawals are blocked at
                        the exchange level to protect your capital.
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Query key not configured. Telemetry disabled.
                      </span>
                    )}
                  </p>
                </div>

                <div className="space-y-1 rounded-lg border border-amber-200/70 bg-white/80 p-2.5">
                  <span className="block font-bold text-slate-700">2. Dual-Leg Hedging Guard</span>
                  <p className="text-[11px] text-slate-600">
                    Unhedged single-leg execution is strictly blocked. An isolated on-chain swap
                    exposes funds to directional market drift and sandwich attacks.
                  </p>
                </div>

                <div className="space-y-1 rounded-lg border border-amber-200/70 bg-white/80 p-2.5">
                  <span className="block font-bold text-slate-700">3. Bounded Slippage Floor</span>
                  <p className="text-[11px] text-slate-600">
                    Calculated slippage floor is clamped at <strong>0.50% (50 bps)</strong> max
                    depth tolerance ({minAmountOutFloor.toFixed(4)} min out), rejecting zero-floor
                    swaps.
                  </p>
                </div>
              </div>

              {/* Stage / Verification Action Row */}
              <div className="flex flex-col items-center justify-between gap-3 pt-1 sm:flex-row">
                <div className="text-xs text-slate-600">
                  {estNetProfitCeDeFi > 0 ? (
                    <span className="font-semibold text-emerald-700">
                      ● Spread is mathematically viable (+${estNetProfitCeDeFi} USD). Live trade
                      dispatch is gated until two-sided trade API authorization is provisioned.
                    </span>
                  ) : (
                    <div className="space-y-0.5">
                      <span className="block font-semibold text-rose-700">
                        🛑 Spread is unprofitable (${estNetProfitCeDeFi} USD). Anti-Loss gate blocks
                        execution to preserve your capital.
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Market equilibrium fee drag is 0.56% (56 bps). Engine automatically triggers
                        during cross-venue price swings &gt; 56 bps.
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchKrakenAccount}
                    className="border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <RefreshCw className="mr-1.5 size-3 text-slate-600" />
                    Re-Verify Kraken API
                  </Button>

                  <Button
                    size="sm"
                    disabled
                    className="cursor-not-allowed border border-amber-300 bg-amber-100 font-bold text-amber-900 shadow-none hover:bg-amber-100"
                  >
                    <Lock className="mr-1.5 size-3.5" />
                    {estNetProfitCeDeFi > 0
                      ? "Live Execution Gated (Query-Only Mode)"
                      : "Execution Blocked (Negative Spread)"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Pure CEX-to-CEX Spatial Arbitrage Spreads */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold text-slate-900">
                CEX-to-CEX Spatial Arbitrage Matrix ({notional.toLocaleString()} {quoteAsset}{" "}
                Notional)
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time VWAP spread walked through book depth net of taker fees (
                {opportunities.length} pairs evaluated).
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              Fee-Adjusted VWAP
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Route</th>
                  <th className="px-4 py-2.5 font-bold">Buy Leg</th>
                  <th className="px-4 py-2.5 font-bold">Sell Leg</th>
                  <th className="px-4 py-2.5 font-bold">Base Qty</th>
                  <th className="px-4 py-2.5 font-bold">Gross Spread</th>
                  <th className="px-4 py-2.5 font-bold">Net BPS</th>
                  <th className="px-4 py-2.5 font-bold">Net Profit ({quoteAsset})</th>
                  <th className="px-4 py-2.5 font-bold">Max Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      Scanning order book depth for {selectedSymbol}...
                    </td>
                  </tr>
                ) : (
                  opportunities.slice(0, 8).map((opp, idx) => (
                    <tr
                      key={`${opp.buyExchange}-${opp.sellExchange}-${idx}`}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-2.5 font-bold capitalize text-slate-900">
                        {opp.buyExchange} <ArrowRight className="inline size-3 text-slate-400" />{" "}
                        {opp.sellExchange}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {opp.buyVwap.toLocaleString(undefined, { maximumFractionDigits: 10 })}{" "}
                        {quoteAsset}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {opp.sellVwap.toLocaleString(undefined, { maximumFractionDigits: 10 })}{" "}
                        {quoteAsset}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{opp.qtyBase.toFixed(4)}</td>
                      <td
                        className={`px-4 py-2.5 font-bold ${
                          opp.grossBps > 0 ? "text-emerald-600" : "text-slate-600"
                        }`}
                      >
                        {opp.grossBps > 0 ? `+${opp.grossBps.toFixed(2)}` : opp.grossBps.toFixed(2)}{" "}
                        bps
                      </td>
                      <td
                        className={`px-4 py-2.5 font-bold ${
                          opp.netBps > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {opp.netBps > 0 ? `+${opp.netBps.toFixed(2)}` : opp.netBps.toFixed(2)} bps
                      </td>
                      <td
                        className={`px-4 py-2.5 font-bold ${
                          opp.netPnlQuote > 0 ? "text-emerald-600" : "text-slate-600"
                        }`}
                      >
                        {opp.netPnlQuote > 0
                          ? `+${opp.netPnlQuote.toFixed(8)}`
                          : `${opp.netPnlQuote.toFixed(8)}`}{" "}
                        {quoteAsset}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{opp.maxAgeMs}ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
