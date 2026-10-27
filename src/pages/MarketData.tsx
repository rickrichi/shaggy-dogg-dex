import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BarChart3, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MARKET_DATA_URL } from "@/config/market-data";
import { MRWD } from "@/lib/mrwd-pro";

// ───────────────────────────── wire types (shaggy-dogg-market-data/app/market_data.py) ─────────────────

interface Source {
  venue: string;
  exchange: string;
  pair: string;
  midUsd: number;
  ageMs: number;
  spreadBps: number;
}

interface AssetPrice {
  symbol: string;
  priceUsd: number;
  change24hPercent: number | null;
  change24hSource: string | null;
  volume24hUsd: number | null;
  sourceCount: number;
  sources: Source[];
  rejected: Source[];
  maxAgeMs: number | null;
  method: string;
}

interface Status {
  name: string;
  version: string;
  assetsPriced: number;
  venues: string[];
  onchain: { minPoolLiquidityUsd: number; dexes: string[]; trackedTokens: number };
  coverage: Coverage | null;
}

interface Coverage {
  requestedPairs: number;
  listedPairs: number;
  streamingPairs: number;
  exchangesLoaded: number;
  exchangesTotal: number;
  unlisted: string[] | null;
  pairs: Record<string, string[]>;
}

interface TokenPrice {
  address: string;
  symbol: string | null;
  priceUsd: number;
  change24hPercent: number | null;
  fdvUsd?: number | null;
  method: string;
  /** Priced from a pool below the service's liquidity floor: cheap to move, never recorded in history. */
  indicative?: boolean;
  pool?: { dex: string; pool: string; quoteToken: string; liquidityUsd: number };
}

interface History {
  asset: string;
  points: Array<{ ts: number; priceUsd: number }>;
}

class MarketDataError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${MARKET_DATA_URL}${path}`, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new MarketDataError(
      `Market-Data service unreachable at ${MARKET_DATA_URL || window.location.origin}`
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new MarketDataError(typeof detail === "string" ? detail : `HTTP ${response.status}`);
  }
  return body as T;
}

// ───────────────────────────── formatting ─────────────────────────────

const usd = (v: number) => {
  // Sub-cent prices (e.g. a trillion-supply token) keep four significant digits instead of rounding to $0.
  if (v > 0 && v < 0.01) return `$${v.toLocaleString("en-US", { maximumSignificantDigits: 4 })}`;
  const digits = v >= 1_000 ? 2 : v >= 1 ? 4 : 5;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })}`;
};
const compactUsd = (v: number | null | undefined) =>
  v == null
    ? "—"
    : `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v)}`;
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
const pctTone = (v: number | null) =>
  v == null
    ? "text-slate-400"
    : v > 0
      ? "text-emerald-600"
      : v < 0
        ? "text-rose-600"
        : "text-slate-600";
const age = (ms: number | null) =>
  ms == null ? "—" : ms < 1_000 ? `${ms}ms` : `${(ms / 1_000).toFixed(1)}s`;

// ───────────────────────────── page ─────────────────────────────

export default function MarketData() {
  const status = useQuery({
    queryKey: ["md-status"],
    queryFn: () => getJson<Status>("/api/market-data"),
    refetchInterval: 10_000,
  });
  const prices = useQuery({
    queryKey: ["md-prices"],
    queryFn: () => getJson<{ prices: AssetPrice[]; updatedAt: number }>("/api/market-data/prices"),
    refetchInterval: 5_000,
  });
  const [selected, setSelected] = useState("ETH");
  const [search, setSearch] = useState("");
  const allRows = useMemo(
    () =>
      [...(prices.data?.prices ?? [])].sort(
        (a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0)
      ),
    [prices.data]
  );
  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return q
      ? allRows.filter((r) => r.symbol.includes(q) || r.sources.some((src) => src.pair.includes(q)))
      : allRows;
  }, [allRows, search]);
  const selectedRow = allRows.find((r) => r.symbol === selected);
  const coverage = status.data?.coverage ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="text-center">
        <h1 className="mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-bold text-transparent">
          Shaggy Dogg Crypto Market-Data
        </h1>
        <p className="text-gray-600">
          Self-hosted prices from live exchange order books and Base on-chain pools — no third-party
          price API.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          {status.data ? (
            <>
              <Badge variant="secondary">{status.data.assetsPriced} assets priced</Badge>
              {coverage && (
                <Badge variant="secondary">
                  {coverage.streamingPairs} of {coverage.requestedPairs} of your pairs streaming
                  {coverage.exchangesLoaded < coverage.exchangesTotal &&
                    ` · ${coverage.exchangesLoaded}/${coverage.exchangesTotal} exchanges connected`}
                </Badge>
              )}
              <Badge variant="secondary">
                {status.data.venues.length} exchanges: {status.data.venues.join(", ")}
              </Badge>
              <Badge variant="secondary">
                Base pools ≥ {compactUsd(status.data.onchain.minPoolLiquidityUsd)} liquidity
              </Badge>
            </>
          ) : status.error ? (
            <Badge variant="destructive">{(status.error as Error).message}</Badge>
          ) : (
            <Badge variant="secondary">connecting…</Badge>
          )}
        </div>
      </div>

      <Card className="bg-white/80 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" /> Live prices
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              {prices.isFetching && <Loader2 className="size-3 animate-spin" />}
              {prices.data
                ? `updated ${new Date(prices.data.updatedAt).toLocaleTimeString()} · every 5 s`
                : ""}
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search BTC, SOL/USDT…"
              className="h-8 w-48 text-xs"
              aria-label="Search assets"
            />
          </div>
        </CardHeader>
        <CardContent>
          {prices.error ? (
            <ServiceDown message={(prices.error as Error).message} />
          ) : !prices.data ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading live prices…</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Asset</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3 text-right">24h</th>
                    <th className="py-2 pr-3 text-right">24h volume</th>
                    <th className="py-2 pr-3">Sources</th>
                    <th className="py-2 text-right">Oldest quote</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.symbol}
                      onClick={() => setSelected(r.symbol)}
                      className={`cursor-pointer border-t border-gray-100 hover:bg-purple-50 ${
                        r.symbol === selected ? "bg-purple-50" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 font-semibold">{r.symbol}</td>
                      <td className="py-2 pr-3 text-right font-mono">{usd(r.priceUsd)}</td>
                      <td
                        className={`py-2 pr-3 text-right font-mono ${pctTone(r.change24hPercent)}`}
                        title={r.change24hSource ?? "no 24h data yet"}
                      >
                        {pct(r.change24hPercent)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {compactUsd(r.volume24hUsd)}
                      </td>
                      <td
                        className="py-2 pr-3"
                        title={r.sources
                          .map((s) => `${s.exchange} ${s.pair} ${usd(s.midUsd)}`)
                          .join("\n")}
                      >
                        {r.sourceCount} venue{r.sourceCount === 1 ? "" : "s"}
                        {r.rejected.length > 0 && (
                          <span className="ml-1 text-amber-600">
                            ({r.rejected.length} rejected)
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-gray-500">
                        {age(r.maxAgeMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HistoryCard asset={selected} row={selectedRow} />
        <TokenLookup />
      </div>

      {coverage && <PairCoverage coverage={coverage} rows={allRows} onSelect={setSelected} />}

      <p className="text-center text-xs text-gray-500">
        Price = median of fresh venue mid prices (books &lt; 10 s old, spread &lt; 2%), outliers
        beyond 1.5% rejected, USDT/USDC quotes converted at the live stablecoin rate. 24h change
        uses Market-Data&apos;s own history once it covers 24 hours, otherwise exchange 24h tickers.
        Service: {MARKET_DATA_URL || window.location.origin}
      </p>
    </div>
  );
}

function PairCoverage({
  coverage,
  rows,
  onSelect,
}: {
  coverage: Coverage;
  rows: AssetPrice[];
  onSelect: (asset: string) => void;
}) {
  const byAsset = new Map(rows.map((r) => [r.symbol, r]));
  const livePairs = new Set(
    rows.flatMap((r) => r.sources.map((src) => `${src.exchange}|${src.pair}`))
  );
  return (
    <Card className="bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2">
          Your pairs
          <span className="text-sm font-normal text-gray-500">
            {coverage.streamingPairs} streaming · {coverage.listedPairs} listed on at least one
            exchange · {coverage.requestedPairs} requested
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="py-2 pr-3">Pair</th>
                <th className="py-2 pr-3 text-right">Asset price (USD)</th>
                <th className="py-2 pr-3">Exchanges listing it</th>
                <th className="py-2">Live now</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(coverage.pairs).map(([pair, exchanges]) => {
                const base = pair.split("/")[0] ?? pair;
                const asset = byAsset.get(base);
                const liveOn = exchanges.filter((ex) => livePairs.has(`${ex}|${pair}`));
                return (
                  <tr
                    key={pair}
                    onClick={() => asset && onSelect(base)}
                    className={`border-t border-gray-100 ${asset ? "cursor-pointer hover:bg-purple-50" : ""}`}
                  >
                    <td className="py-1.5 pr-3 font-semibold">{pair}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {asset ? usd(asset.priceUsd) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-gray-600">
                      {exchanges.length ? (
                        exchanges.join(", ")
                      ) : (
                        <span className="text-amber-600">none</span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs">
                      {liveOn.length ? (
                        <span className="text-emerald-600">{liveOn.join(", ")}</span>
                      ) : (
                        <span className="text-gray-400">
                          {exchanges.length ? "connecting / no fresh book" : "not available"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {coverage.unlisted && coverage.unlisted.length > 0 && (
          <p className="text-xs text-gray-500">
            Not listed on any connected exchange (no price shown, nothing estimated):{" "}
            {coverage.unlisted.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceDown({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{message}</p>
        <p className="mt-1 font-mono text-xs">
          cd C:\Users\fbada\source\repos\shaggy-dogg-market-data; uv run uvicorn app.main:app --port
          8010
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────── history chart ─────────────────────────────

function HistoryCard({ asset, row }: { asset: string; row: AssetPrice | undefined }) {
  const history = useQuery({
    queryKey: ["md-history", asset],
    queryFn: () =>
      getJson<History>(`/api/market-data/history/${encodeURIComponent(asset)}?hours=24`),
    refetchInterval: 60_000,
  });
  const points = history.data?.points ?? [];

  return (
    <Card className="bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-5" /> {asset} · last 24 h
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {row && (
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold">{usd(row.priceUsd)}</span>
            <span className={`font-mono ${pctTone(row.change24hPercent)}`}>
              {pct(row.change24hPercent)}
            </span>
          </div>
        )}
        {points.length < 2 ? (
          <p className="rounded bg-gray-50 p-6 text-center text-sm text-gray-500">
            Collecting history — {points.length} minute sample{points.length === 1 ? "" : "s"} so
            far. The chart fills in as the service runs.
          </p>
        ) : (
          <Sparkline points={points} />
        )}
        {row && (
          <ul className="space-y-0.5 text-xs text-gray-600">
            {row.sources.map((s) => (
              <li key={`${s.exchange}-${s.pair}`} className="flex justify-between font-mono">
                <span>
                  {s.exchange} · {s.pair}
                </span>
                <span>
                  {usd(s.midUsd)} · {s.spreadBps.toFixed(1)} bps · {age(s.ageMs)}
                </span>
              </li>
            ))}
            {row.rejected.map((s) => (
              <li
                key={`rej-${s.exchange}-${s.pair}`}
                className="flex justify-between font-mono text-amber-600"
              >
                <span>
                  {s.exchange} · {s.pair} (rejected outlier)
                </span>
                <span>{usd(s.midUsd)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Sparkline({ points }: { points: Array<{ ts: number; priceUsd: number }> }) {
  const W = 480;
  const H = 140;
  const prices = points.map((p) => p.priceUsd);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || hi * 0.001 || 1;
  const t0 = points[0]?.ts ?? 0;
  const t1 = points.at(-1)?.ts ?? 1;
  const x = (ts: number) => ((ts - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * (H - 8) - 4;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.priceUsd).toFixed(1)}`)
    .join("");
  const up = (points.at(-1)?.priceUsd ?? 0) >= (points[0]?.priceUsd ?? 0);
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Price history"
      >
        <path
          d={d}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className={up ? "stroke-emerald-500" : "stroke-rose-500"}
        />
      </svg>
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{new Date(t0).toLocaleTimeString()}</span>
        <span>
          low {usd(lo)} · high {usd(hi)}
        </span>
        <span>{new Date(t1).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

// ───────────────────────────── Base token lookup ─────────────────────────────

function TokenLookup() {
  const [input, setInput] = useState("0x940181a94A35A4569E4529A3CDfB74e38FD98631");
  const [address, setAddress] = useState<string | null>(null);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(input.trim());
  const token = useQuery({
    queryKey: ["md-token", address],
    queryFn: () => getJson<TokenPrice>(`/api/market-data/tokens/base/${address}?allowThin=true`),
    enabled: address !== null,
    refetchInterval: 30_000,
    retry: false,
  });

  return (
    <Card className="bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="size-5" /> Base token price (on-chain)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setAddress(input.trim().toLowerCase());
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="0x… token contract on Base"
            className="font-mono text-xs"
            aria-label="Token contract address"
          />
          <Button type="submit" disabled={!valid || token.isFetching}>
            {token.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Price"}
          </Button>
        </form>
        <p className="text-xs text-gray-500">
          Example prefilled: AERO. Priced from the deepest Uniswap V2, Uniswap V3, or Aerodrome
          pool.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setInput(MRWD);
              setAddress(MRWD.toLowerCase());
            }}
          >
            Price MRWD
          </button>
        </p>
        {token.error && <p className="text-sm text-rose-600">{(token.error as Error).message}</p>}
        {token.data && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Token</dt>
            <dd className="font-semibold">{token.data.symbol ?? "—"}</dd>
            <dt className="text-gray-500">Price</dt>
            <dd className="font-mono">
              {usd(token.data.priceUsd)}
              {token.data.indicative && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[11px] text-amber-800">
                  indicative · thin pool
                </span>
              )}
            </dd>
            <dt className="text-gray-500">24h</dt>
            <dd className={`font-mono ${pctTone(token.data.change24hPercent)}`}>
              {token.data.change24hPercent == null
                ? "collecting history"
                : pct(token.data.change24hPercent)}
            </dd>
            {token.data.pool && (
              <>
                <dt className="text-gray-500">Pool</dt>
                <dd>
                  {token.data.pool.dex} / {token.data.pool.quoteToken}
                </dd>
                <dt className="text-gray-500">Pool liquidity</dt>
                <dd className="font-mono">{compactUsd(token.data.pool.liquidityUsd)}</dd>
              </>
            )}
            <dt className="text-gray-500">Fully diluted value</dt>
            <dd className="font-mono">{compactUsd(token.data.fdvUsd)}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
