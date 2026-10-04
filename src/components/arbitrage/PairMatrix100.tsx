import thresholds from "@/config/market-pair-thresholds.json";
import MARKET_PAIRS from "@/config/market-pairs.json";
import { ARB_API_URL } from "@/config/crypto-arb";
import { useEffect, useMemo, useState } from "react";

import { ArrowUpRight, Coins, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMatrixDexQuotes } from "@/hooks/useMatrixDexQuotes";
import { MATRIX_QUOTE_MAX_AGE_MS, matrixRoute } from "@/lib/amm/matrix-quotes";
import type { Snapshot } from "@/types/crypto-arb";

export interface MatrixPair {
  id: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  binance: string;
  bybit: string;
  okx: string;
  coinbase: string;
  kraken: string;
  minNetEdgePct: string;
  tier: string;
}

export const PAIR_MATRIX_DATA: MatrixPair[] = MARKET_PAIRS.map((symbol, index) => {
  const [baseAsset = "", quoteAsset = ""] = symbol.split("/");
  return { id: index + 1, symbol, baseAsset, quoteAsset,
    binance: "Unverified", bybit: "Unverified", okx: "Unverified", coinbase: "Unverified", kraken: "Unverified",
    minNetEdgePct: (thresholds as Record<string, { minNetEdgePct: string }>)[symbol]?.minNetEdgePct ?? "0.40%", tier: (thresholds as Record<string, { tier: string }>)[symbol]?.tier ?? "Requested market" };
});

interface PairMatrix100Props {
  snapshot?: Snapshot | null;
  onSelectPair?: (symbol: string) => void;
  krakenBalances?: {
    free?: Record<string, number>;
  };
}

export function PairMatrix100({ onSelectPair, krakenBalances, snapshot }: PairMatrix100Props) {
  const { quotes, now } = useMatrixDexQuotes(MARKET_PAIRS);
  const [dexOnly, setDexOnly] = useState(false);
  const venueIndex = useMemo(() => new Map(snapshot?.venues.map(v => [`${v.exchange}:${v.symbol}`, v]) ?? []), [snapshot]);
  const [search, setSearch] = useState("");
  const [filterFundedOnly, setFilterFundedOnly] = useState(false);
  const [internalBalances, setInternalBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    if (!krakenBalances?.free) {
      const load = async () => {
        try {
          if (typeof fetch === "function") {
            const res = await fetch(`${ARB_API_URL}/api/kraken/account`, {
              signal: AbortSignal.timeout(2500),
            });
            if (res && res.ok && active) {
              const data = await res.json();
              if (data && data.free && active) {
                setInternalBalances(data.free);
              }
            }
          }
        } catch {
          // Ignore fetch errors
        }
      };
      load();
    }
    return () => {
      active = false;
    };
  }, [krakenBalances]);

  const freeAssets: Record<string, number> = useMemo(() => {
    return (krakenBalances?.free || internalBalances) || {};
  }, [krakenBalances, internalBalances]);

  // Check if user holds the asset in Kraken
  const getHoldingStatus = (p: MatrixPair) => {
    const assets = freeAssets || {};
    const baseHolding = Number(assets[p.baseAsset] || 0);
    const quoteHolding = Number(assets[p.quoteAsset] || 0);
    if (baseHolding > 0 && quoteHolding > 0) {
      return {
        isFunded: true,
        summary: `Base and quote held: ${baseHolding < 1 ? baseHolding.toFixed(4) : baseHolding.toFixed(2)} ${p.baseAsset} + ${quoteHolding.toFixed(6)} ${p.quoteAsset}`,
        color: "bg-emerald-100 text-emerald-900 border-emerald-300",
      };
    }
    if (baseHolding > 0) {
      return {
        isFunded: true,
        summary: `${baseHolding < 1 ? baseHolding.toFixed(4) : baseHolding.toFixed(2)} ${p.baseAsset} Ready to Sell`,
        color: "bg-purple-100 text-purple-900 border-purple-300",
      };
    }
    if (quoteHolding > 0) {
      return { isFunded: true, summary: `${quoteHolding.toFixed(6)} ${p.quoteAsset} Available`, color: "bg-blue-100 text-blue-900 border-blue-300" };
    }
    return { isFunded: false, summary: "No Kraken Balance", color: "bg-slate-100 text-slate-500 border-slate-200" };
  };

  const filteredPairs = useMemo(() => {
    return PAIR_MATRIX_DATA.filter((p) => {
      const matchesSearch =
        p.symbol.toLowerCase().includes(search.toLowerCase()) ||
        p.baseAsset.toLowerCase().includes(search.toLowerCase()) ||
        p.tier.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;
      if (dexOnly && !matrixRoute(p.symbol)) return false;
      if (filterFundedOnly) {
        return getHoldingStatus(p).isFunded;
      }
      return true;
    });
  }, [search, filterFundedOnly, freeAssets, dexOnly]);

  const cexQuote = (exchange: string, symbol: string) => {
    const venue = venueIndex.get(`${exchange}:${symbol}`);
    if (!venue) return "Unverified";
    if (venue.status !== "live") return venue.status;
    const age = (venue.ageMs ?? Infinity) + Math.max(0, now - (snapshot?.ts ?? 0));
    if (age > 5000) return "Stale";
    if (venue.bid == null || venue.ask == null) return "Awaiting book";
    return `Bid ${venue.bid.toLocaleString(undefined, { maximumSignificantDigits: 8 })} / Ask ${venue.ask.toLocaleString(undefined, { maximumSignificantDigits: 8 })}`;
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/60 pb-4">
        <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-purple-600" />
              <CardTitle className="text-base font-bold text-slate-900">
                {PAIR_MATRIX_DATA.length}-Pair Spot Arbitrage Matrix
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              CeDeFi comparison: Shaggy-Dogg-Dex routed sell quotes on Base alongside centralized exchange bid/ask prices.
              Prices use each pair’s quote asset. DEX quotes sell 1 base token, include pool fees and exclude gas; CEX prices are top-of-book before fees.
              ETH routes use WETH. Kraken capital is separate from your wallet.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={filterFundedOnly ? "default" : "outline"}
              onClick={() => setFilterFundedOnly(!filterFundedOnly)}
              className={
                filterFundedOnly
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border-slate-300 text-slate-700"
              }
            >
              <Coins className="mr-1.5 size-3.5" />
              {filterFundedOnly ? "Showing Funded Only" : `Show All (${PAIR_MATRIX_DATA.length} Pairs)`}
            </Button>
          </div>
        </div>

        {/* Search & Quick Filter Pills */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
              <Input
                placeholder="Filter by symbol (e.g. SEI, ETH, BTC, SOL)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 font-mono text-xs font-semibold"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Showing {filteredPairs.length} of {PAIR_MATRIX_DATA.length} pairs
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Quick Filters:</span>
            <Button size="sm" variant={dexOnly ? "default" : "outline"}
              onClick={() => { setDexOnly(!dexOnly); setSearch(""); setFilterFundedOnly(false); }}
              className="h-6 px-2 text-[10px] font-bold">
              Shaggy-Dogg-Dex · Base mappings
            </Button>
            {[
              { label: "🟢 My Funded Pairs", query: "", fundedOnly: true },
              { label: "ETH Pairs", query: "ETH", fundedOnly: false },
              { label: "SEI Pairs", query: "SEI", fundedOnly: false },
              { label: "USDC Pairs", query: "USDC", fundedOnly: false },
              { label: "BTC Pairs", query: "BTC", fundedOnly: false },
              { label: `Show All (${PAIR_MATRIX_DATA.length})`, query: "", fundedOnly: false },
            ].map((pill, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={!dexOnly && search === pill.query && filterFundedOnly === pill.fundedOnly ? "default" : "outline"}
                onClick={() => {
                  setDexOnly(false);
                  setSearch(pill.query);
                  setFilterFundedOnly(pill.fundedOnly);
                }}
                className={`h-6 px-2 text-[10px] font-bold ${
                  !dexOnly && search === pill.query && filterFundedOnly === pill.fundedOnly
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {pill.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-bold">#</th>
                <th className="px-3 py-2 font-bold">Pair Symbol</th>
                <th className="px-3 py-2 font-bold text-purple-700">Shaggy-Dogg-Dex</th>
                <th className="px-3 py-2 font-bold">Binance</th>
                <th className="px-3 py-2 font-bold">Bybit</th>
                <th className="px-3 py-2 font-bold">OKX</th>
                <th className="px-3 py-2 font-bold">Coinbase</th>
                <th className="px-3 py-2 font-bold">Kraken</th>
                <th className="px-3 py-2 font-bold">Min Net Edge</th>
                <th className="px-3 py-2 font-bold">Your Kraken Capital Status</th>
                <th className="px-3 py-2 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredPairs.map((pair) => {
                const holding = getHoldingStatus(pair);
                return (
                  <tr
                    key={pair.id}
                    className={`hover:bg-slate-50/80 ${
                      holding.isFunded ? "bg-emerald-50/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-400 font-bold">{pair.id}</td>
                    <td className="px-3 py-2 font-bold text-slate-900">
                      {pair.symbol}
                      <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-normal text-slate-500">
                        {pair.tier}
                      </span>
                    </td>
                    <td className="min-w-48 px-3 py-2 text-purple-700">
                      {!matrixRoute(pair.symbol) ? "No Base token mapping" : <>
                        <div>{(() => {
                          const quote = quotes[pair.symbol];
                          if (!quote) return "Checking route…";
                          if (now - quote.checkedAt > MATRIX_QUOTE_MAX_AGE_MS) return "Stale quote";
                          if (quote.status === "rpc-error") return "RPC unavailable";
                          if (quote.status === "unavailable") return "Quote unavailable";
                          return `1 ${quote.inputSymbol} → ${quote.output} ${quote.outputSymbol}`;
                        })()}</div>
                        <span className="text-[10px] text-slate-500">{quotes[pair.symbol]?.venueLabel ?? "Base route"}</span>
                      </>}
                    </td>
                    {(["binance", "bybit", "okx", "coinbase", "kraken"] as const).map(venue => (
                      <td key={venue} className="px-3 py-2 text-center text-slate-600">{cexQuote(venue, pair.symbol)}</td>
                    ))}
                    <td className="px-3 py-2 font-bold text-emerald-600">{pair.minNetEdgePct}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${holding.color}`}
                      >
                        {holding.summary}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant={holding.isFunded ? "default" : "outline"}
                        onClick={() => onSelectPair?.(pair.symbol)}
                        className={`h-6 px-2 text-[10px] font-bold ${
                          holding.isFunded
                            ? "bg-purple-600 text-white hover:bg-purple-700"
                            : "border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        Load Pair <ArrowUpRight className="ml-1 size-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
