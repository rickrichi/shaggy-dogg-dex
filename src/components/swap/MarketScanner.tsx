// src/components/swap/MarketScanner.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Activity,
  AlertCircle,
  Play,
  Radar,
  RefreshCw,
  Square,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { type Address, formatUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { IndicativeBadge } from "@/components/IndicativeBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getTokensForChain, isErc20Token, type Token } from "@/config/tokens";
import { fetchPrices } from "@/lib/api/prices";

import type { AddressHex } from "@/types/token";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

type ScannerView = "movers" | "holdings";

interface ScannerRow {
  readonly key: string; // lowercase address; the native coin uses the zero address
  readonly symbol: string;
  readonly name: string;
  readonly priceUsd: number;
  readonly change24hPercent: number;
  /** Priced from a pool below Market-Data's liquidity floor: cheap to move. */
  readonly indicative: boolean;
  readonly liquidityUsd?: number;
}

interface ScannerCoverage {
  readonly priced: number;
  readonly total: number;
  /** Symbols priced only from thin pools. */
  readonly indicative: readonly string[];
  /** Symbols Market-Data answered it cannot price at all (no pool). */
  readonly unpriced: readonly string[];
  /** Tokens with no answer in time; the next scan retries them. */
  readonly failed: number;
}

interface Holding {
  readonly token: Token;
  readonly amount: number;
  readonly row?: ScannerRow;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

// The backend returns the native coin's price under the zero address.
const NATIVE_PRICE_ADDRESS = "0x0000000000000000000000000000000000000000";

const SCANNER_INTERVAL_MS = 15_000;

const ERC20_BALANCEOF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const smallUsdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 4,
});
const amountFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Pure, no side effects)
// ══════════════════════════════════════════════════════════════════════════════

const tokenKey = (token: Token): string =>
  token.kind === "native" ? NATIVE_PRICE_ADDRESS : token.address.toLowerCase();

/** Prices below $1 keep four significant digits so sub-cent tokens do not show as $0.00. */
function formatUsd(value: number): string {
  return Math.abs(value) >= 1 || value === 0
    ? usdFormat.format(value)
    : smallUsdFormat.format(value);
}

/**
 * Turn a fetchPrices failure into a message that says prices are unavailable
 */
function describeScannerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "unsupported_chain") return "Market data is not available on this network.";
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Feed offline — the price service did not answer in time. Retrying every 15 seconds.";
  }
  if (message === "HTTP 429") return "Feed offline — too many requests. Retrying shortly.";
  if (message === "market_data_unavailable") {
    return "Feed offline — the price service is not responding. Retrying every 15 seconds.";
  }
  return `Feed offline${message ? ` (${message})` : ""}. Retrying every 15 seconds.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export function MarketScanner() {
  const { address, chain, isConnected } = useAccount();
  // The swap dropdown mixes in Ethereum tokens; the scanner prices only the connected chain's own list.
  const scannerChainId = chain?.id ?? 8453;
  const publicClient = usePublicClient({ chainId: scannerChainId });
  const scannerTokens = useMemo(() => getTokensForChain(scannerChainId), [scannerChainId]);

  const [enabled, setEnabled] = useState(false);
  const [view, setView] = useState<ScannerView>("movers");
  const [rows, setRows] = useState<readonly ScannerRow[]>([]);
  const [balances, setBalances] = useState<ReadonlyMap<string, number> | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [coverage, setCoverage] = useState<ScannerCoverage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scannerRequest = useRef<AbortController | null>(null);

  /** Wallet balances for the scanned list, keyed like price rows. Failure must not block prices. */
  const readBalances = useCallback(async (): Promise<Map<string, number> | null> => {
    if (!address || !publicClient) return null;
    const erc20Tokens = scannerTokens.filter(isErc20Token);
    const [nativeBalance, results] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.multicall({
        contracts: erc20Tokens.map((token) => ({
          address: token.address as Address,
          abi: ERC20_BALANCEOF,
          functionName: "balanceOf" as const,
          args: [address] as const,
        })),
        allowFailure: true,
      }),
    ]);
    const amounts = new Map<string, number>();
    const nativeToken = scannerTokens.find((token) => token.kind === "native");
    if (nativeToken) {
      amounts.set(NATIVE_PRICE_ADDRESS, Number(formatUnits(nativeBalance, nativeToken.decimals)));
    }
    for (const [i, token] of erc20Tokens.entries()) {
      const result = results[i];
      if (result?.status === "success") {
        amounts.set(tokenKey(token), Number(formatUnits(result.result as bigint, token.decimals)));
      }
    }
    return amounts;
  }, [address, publicClient, scannerTokens]);

  const runScanner = useCallback(async () => {
    if (scannerRequest.current) return; // previous scan still running
    const request = new AbortController();
    scannerRequest.current = request;

    const erc20Tokens = scannerTokens.filter(isErc20Token);
    const tokensByKey = new Map<string, Token>(
      scannerTokens.map((token) => [tokenKey(token), token])
    );

    setIsLoading(true);

    const balancesRead = readBalances().then(
      (amounts) => ({ amounts, failed: false }),
      () => ({ amounts: null, failed: true })
    );

    try {
      const result = await fetchPrices({
        chainId: scannerChainId,
        addresses: erc20Tokens.map((token) => token.address as AddressHex),
        includeThin: true,
        signal: request.signal,
      });

      const nextRows = result.data.prices
        .map((price): ScannerRow | null => {
          const token = tokensByKey.get(price.address.toLowerCase());
          if (!token) return null;

          return {
            key: price.address.toLowerCase(),
            symbol: price.symbol ?? token.symbol,
            name: token.name,
            priceUsd: price.priceUsd,
            change24hPercent: price.change24hPercent,
            indicative: price.indicative === true,
            ...(price.liquidityUsd !== undefined ? { liquidityUsd: price.liquidityUsd } : {}),
          };
        })
        .filter((row): row is ScannerRow => row !== null)
        .sort((a, b) => Math.abs(b.change24hPercent) - Math.abs(a.change24hPercent));

      const symbolsOf = (addresses: readonly string[]) =>
        addresses
          .map((a) => tokensByKey.get(a.toLowerCase())?.symbol)
          .filter((symbol): symbol is string => symbol !== undefined);

      const wallet = await balancesRead;
      if (request.signal.aborted) return;

      setRows(nextRows);
      setBalances(wallet.amounts);
      setBalanceError(wallet.failed);
      setCoverage({
        priced: nextRows.filter((row) => !row.indicative).length,
        total: tokensByKey.size,
        indicative: nextRows.filter((row) => row.indicative).map((row) => row.symbol),
        unpriced: symbolsOf(result.data.unpriced),
        failed: result.data.failed.length,
      });
      setError(
        nextRows.length === 0 ? describeScannerError(new Error("market_data_unavailable")) : null
      );
      if (nextRows.length > 0) setLastRun(new Date());
    } catch (err) {
      if (request.signal.aborted) return; // scanner stopped, chain or wallet changed
      setRows([]);
      setCoverage(null);
      setError(describeScannerError(err));
    } finally {
      if (scannerRequest.current === request) {
        scannerRequest.current = null;
        setIsLoading(false);
      }
    }
  }, [readBalances, scannerTokens, scannerChainId]);

  useEffect(() => {
    if (!enabled) return;

    runScanner();
    const timer = window.setInterval(() => {
      runScanner();
    }, SCANNER_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      scannerRequest.current?.abort();
      scannerRequest.current = null;
      setIsLoading(false);
      setRows([]);
      setBalances(null);
      setBalanceError(false);
      setCoverage(null);
      setError(null);
      setLastRun(null);
    };
  }, [runScanner, enabled]);

  const holdings = useMemo((): readonly Holding[] => {
    if (!balances) return [];
    const rowsByKey = new Map(rows.map((row) => [row.key, row]));
    return scannerTokens
      .map((token): Holding | null => {
        const amount = balances.get(tokenKey(token)) ?? 0;
        if (!(amount > 0)) return null;
        const row = rowsByKey.get(tokenKey(token));
        return row ? { token, amount, row } : { token, amount };
      })
      .filter((holding): holding is Holding => holding !== null)
      .sort(
        (a, b) =>
          (b.row && !b.row.indicative ? b.amount * b.row.priceUsd : 0) -
          (a.row && !a.row.indicative ? a.amount * a.row.priceUsd : 0)
      );
  }, [balances, rows, scannerTokens]);

  const holdingsValue = useMemo(() => {
    let firm = 0;
    let indicative = 0;
    for (const { amount, row } of holdings) {
      if (!row) continue;
      if (row.indicative) indicative += amount * row.priceUsd;
      else firm += amount * row.priceUsd;
    }
    return { firm, indicative };
  }, [holdings]);

  const movers = rows.filter((row) => !row.indicative).slice(0, 5);

  const status = !enabled
    ? "Idle"
    : error
      ? `Price data unavailable${lastRun ? ` - last update ${lastRun.toLocaleTimeString()}` : ""}`
      : lastRun && coverage
        ? `Updated ${lastRun.toLocaleTimeString()} - ${coverage.priced} of ${coverage.total} tokens priced${
            coverage.indicative.length > 0 ? `, ${coverage.indicative.length} indicative` : ""
          }`
        : "Scanning...";

  const emptyMessage = (
    <div className="flex items-center justify-center gap-2 bg-slate-50/70 p-6 text-xs font-medium text-slate-500">
      <Radar className={`size-4 text-purple-500 ${isLoading ? "animate-spin" : ""}`} />
      <span>{isLoading ? "Scanning markets..." : "Scanner results will appear here."}</span>
    </div>
  );

  return (
    <Card className="overflow-hidden rounded-3xl border border-purple-200/80 bg-white/95 shadow-lg ring-1 ring-purple-500/5 backdrop-blur-xl">
      <CardHeader className="border-b border-slate-100/90 bg-gradient-to-r from-purple-50/40 via-white to-pink-50/40 px-4 pb-3.5 pt-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 text-purple-700">
              <Activity className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold leading-none tracking-tight text-slate-900">
                  Market Scanner
                </h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                    enabled
                      ? error
                        ? "bg-red-100 text-red-800"
                        : "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      enabled
                        ? error
                          ? "bg-red-500"
                          : "animate-pulse bg-emerald-500"
                        : "bg-slate-400"
                    }`}
                  />
                  {enabled ? (error ? "Retry 15s" : "Live 15s") : "Standby"}
                </span>
              </div>
              <p
                className={`mt-1 font-mono text-xs ${error ? "font-semibold text-red-600" : "text-slate-500"}`}
                aria-live="polite"
              >
                {status}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {enabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runScanner}
                disabled={isLoading}
                className="gap-1.5 rounded-xl border-slate-200/90 text-xs font-semibold"
              >
                <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Sync
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => setEnabled((on) => !on)}
              className={`gap-1.5 rounded-xl text-xs font-bold shadow-sm transition ${
                enabled
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
              }`}
            >
              {enabled ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              {enabled ? "Stop Scanner" : "Start Scanner"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4 pt-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <div
            className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1"
            role="group"
            aria-label="Scanner view"
          >
            {(
              [
                ["movers", "Top movers"],
                ["holdings", "My holdings"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`rounded-lg px-3.5 py-1 text-xs font-bold transition ${
                  view === value
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">
            {view === "movers" ? "24h firm liquidity movers" : "On-chain multicall balances"}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          {error ? (
            <div className="flex items-center gap-2 bg-red-50/90 p-3.5 text-xs font-medium text-red-700">
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          ) : view === "movers" ? (
            movers.length > 0 ? (
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-slate-50/80 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>Asset</span>
                  <span>Spot USD</span>
                  <span className="text-right">24h Delta</span>
                </div>
                {movers.map((row) => {
                  const isUp = row.change24hPercent >= 0;
                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-white px-4 py-2.5 text-sm transition hover:bg-purple-50/30"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-purple-100/80 font-mono text-[10px] font-semibold text-purple-800">
                          {row.symbol.slice(0, 3)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900">{row.symbol}</p>
                          <p className="truncate text-xs text-slate-500">{row.name}</p>
                        </div>
                      </div>
                      <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                        {formatUsd(row.priceUsd)}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${
                          isUp
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {isUp ? (
                          <TrendingUp className="size-3" />
                        ) : (
                          <TrendingDown className="size-3" />
                        )}
                        {isUp ? "+" : ""}
                        {row.change24hPercent.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              emptyMessage
            )
          ) : !isConnected || !address ? (
            <div className="flex items-center justify-center gap-2 bg-slate-50/80 p-5 text-xs font-medium text-slate-500">
              <Wallet className="size-4 text-slate-400" />
              <span>Connect a wallet to see your holdings.</span>
            </div>
          ) : balanceError ? (
            <div className="bg-amber-50 p-3.5 text-xs font-medium text-amber-800">
              Could not read your wallet balances. Retrying with the next scan.
            </div>
          ) : !balances ? (
            emptyMessage
          ) : holdings.length === 0 ? (
            <div className="bg-slate-50/80 p-5 text-center text-xs font-medium text-slate-500">
              No balances in this network&apos;s token list.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {holdings.map(({ token, amount, row }) => (
                <div
                  key={tokenKey(token)}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-white px-4 py-2.5 text-sm transition hover:bg-purple-50/30"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{token.symbol}</p>
                    <p className="truncate font-mono text-xs text-slate-500">
                      {amountFormat.format(amount)} {token.symbol}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <p className="font-mono text-xs font-medium tabular-nums text-slate-700">
                      {row ? formatUsd(row.priceUsd) : "No price"}
                    </p>
                    {row?.indicative && <IndicativeBadge liquidityUsd={row.liquidityUsd} />}
                  </div>
                  <p className="min-w-20 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {row ? `${row.indicative ? "≈ " : ""}${formatUsd(amount * row.priceUsd)}` : "—"}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between bg-slate-50/90 px-4 py-2.5 text-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total
                </span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {formatUsd(holdingsValue.firm)}
                  {holdingsValue.indicative > 0 && (
                    <span className="ml-2 text-xs font-normal text-amber-700">
                      + ≈ {formatUsd(holdingsValue.indicative)} indicative
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {coverage && !error && (
          <div className="space-y-1 rounded-xl bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
            {coverage.indicative.length > 0 && (
              <p>
                Indicative only (pool under the price service&apos;s liquidity floor, easy to
                move): {coverage.indicative.join(", ")}
              </p>
            )}
            {coverage.unpriced.length > 0 && (
              <p>
                No pool to price: {coverage.unpriced.slice(0, 8).join(", ")}
                {coverage.unpriced.length > 8 ? ` and ${coverage.unpriced.length - 8} more` : ""}
              </p>
            )}
            {coverage.failed > 0 && (
              <p>
                {coverage.failed} {coverage.failed === 1 ? "token" : "tokens"} did not answer in
                time; the next scan retries them.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
