import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, Radio, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// cryptostream (../cryptostream) via the Vite proxy. Decimals arrive as strings (lossless).
const BASE = "/cryptostream";

interface MarketRow {
  symbol: string;
  streamed_as: string;
  base: string;
  quote: string;
  price: string | null;
  price_usd: string | null;
  venue: string | null;
  age_ms: number | null;
  stale: boolean;
  bid: string | null;
  ask: string | null;
  spread_bps: string | null;
  change_24h_pct: string | null;
  high_24h: string | null;
  low_24h: string | null;
  volume_24h: string | null;
  volume_24h_usd: string | null;
  high_52w: string | null;
  low_52w: string | null;
  sparkline: string[];
}

interface MarketsResponse {
  data: MarketRow[];
  meta: { count: number; live: number; dropped: string[] };
}

interface TradeRow {
  venue: string;
  price: string;
  size: string;
  side: "buy" | "sell" | null;
  trade_id: string;
  ts_ms: number;
}

async function getJson<T>(path: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("cryptostream is unreachable");
  }
  const body: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new Error(typeof detail === "string" ? detail : `cryptostream HTTP ${r.status}`);
  }
  return body as T;
}

// ───────────────────────────── formatting ─────────────────────────────

const num = (v: string | null | undefined) => (v == null ? null : Number(v));
const price = (v: string | null | undefined) => {
  const n = num(v);
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = n >= 1_000 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  });
};
const usdCompact = (v: string | null | undefined) => {
  const n = num(v);
  return n == null
    ? "—"
    : `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
};
const pct = (v: string | null | undefined) => {
  const n = num(v);
  return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};
const tone = (v: string | null | undefined) => {
  const n = num(v);
  return n == null
    ? "text-gray-400"
    : n > 0
      ? "text-emerald-600"
      : n < 0
        ? "text-rose-600"
        : "text-gray-600";
};

// ───────────────────────────── live price ticks over WebSocket ─────────────────────────────

type LiveTicks = Record<string, { price: string; at: number; dir: 1 | -1 | 0 }>;

function useLiveTicks(): { ticks: LiveTicks; connected: boolean } {
  const [ticks, setTicks] = useState<LiveTicks>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}${BASE}/v1/ws`);
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        socket?.send(JSON.stringify({ op: "subscribe", topics: ["live:*"] }));
      };
      socket.onmessage = (ev: MessageEvent<string>) => {
        let frames: unknown;
        try {
          frames = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!Array.isArray(frames)) return;
        setTicks((prev) => {
          const next = { ...prev };
          for (const f of frames as Array<{ kind?: string; symbol?: string; price?: string }>) {
            if (f.kind !== "live" || !f.symbol || !f.price) continue;
            const old = prev[f.symbol];
            const dir = old
              ? Number(f.price) > Number(old.price)
                ? 1
                : Number(f.price) < Number(old.price)
                  ? -1
                  : old.dir
              : 0;
            next[f.symbol] = { price: f.price, at: Date.now(), dir };
          }
          return next;
        });
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) retry = setTimeout(connect, Math.min(30_000, 500 * 2 ** attempt++));
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return { ticks, connected };
}

// ───────────────────────────── page ─────────────────────────────

export default function Markets() {
  const markets = useQuery({
    queryKey: ["cs-markets"],
    queryFn: () => getJson<MarketsResponse>("/v1/markets"),
    refetchInterval: 2_000,
  });
  const { ticks, connected } = useLiveTicks();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const all = markets.data?.data ?? [];
    return q ? all.filter((r) => r.symbol.includes(q) || r.streamed_as.includes(q)) : all;
  }, [markets.data, query]);

  const movers = useMemo(() => {
    const live = (markets.data?.data ?? []).filter((r) => !r.stale && r.change_24h_pct != null);
    const sorted = [...live].sort((a, b) => Number(b.change_24h_pct) - Number(a.change_24h_pct));
    return { gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse() };
  }, [markets.data]);

  const selectedRow =
    rows.find((r) => r.streamed_as === selected) ??
    markets.data?.data.find((r) => r.streamed_as === selected);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="text-center">
        <h1 className="mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-bold text-transparent">
          Markets
        </h1>
        <p className="text-gray-600">
          Live crypto prices and 24h statistics streamed directly from Coinbase.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <Badge variant={connected ? "secondary" : "destructive"} className="gap-1">
            <Radio className="size-3" />{" "}
            {connected ? "live ticks streaming" : "live ticks reconnecting"}
          </Badge>
          {markets.data && (
            <Badge variant="secondary">
              {markets.data.meta.live}/{markets.data.meta.count} pairs live
            </Badge>
          )}
        </div>
      </div>

      {markets.error ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{(markets.error as Error).message}</p>
              <p className="mt-1 font-mono text-xs">
                cd C:\Users\fbada\source\repos\cryptostream; uv run cryptostream serve
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <MoversCard
          title="Top gainers (24h)"
          icon={<ArrowUpRight className="size-5 text-emerald-600" />}
          rows={movers.gainers}
          onPick={setSelected}
        />
        <MoversCard
          title="Top losers (24h)"
          icon={<ArrowDownRight className="size-5 text-rose-600" />}
          rows={movers.losers}
          onPick={setSelected}
        />
      </div>

      <Card className="bg-white/80 backdrop-blur-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>All pairs · by 24h volume</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 size-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search BTC, SOL-USD…"
              className="pl-8"
              aria-label="Search pairs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {!markets.data ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              {markets.isLoading && <Loader2 className="size-4 animate-spin" />} Loading live
              markets…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Pair</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3 text-right">24h</th>
                    <th className="py-2 pr-3 text-right">24h high / low</th>
                    <th className="py-2 pr-3 text-right">24h volume</th>
                    <th className="py-2 pr-3 text-right">Spread</th>
                    <th className="py-2 pr-3">Since start (5m)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const tick = ticks[r.streamed_as];
                    const live = tick && Date.now() - tick.at < 10_000 ? tick.price : r.price; // fresh tick, else polled price
                    const flash =
                      tick && Date.now() - tick.at < 1_200
                        ? tick.dir > 0
                          ? "bg-emerald-50"
                          : tick.dir < 0
                            ? "bg-rose-50"
                            : ""
                        : "";
                    return (
                      <tr
                        key={r.streamed_as}
                        onClick={() => setSelected(r.streamed_as)}
                        className={`cursor-pointer border-t border-gray-100 hover:bg-purple-50 ${selected === r.streamed_as ? "bg-purple-50" : ""}`}
                      >
                        <td className="py-2 pr-3 text-xs text-gray-400">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <span className="font-semibold">{r.streamed_as}</span>
                          {r.symbol !== r.streamed_as && (
                            <span
                              className="ml-1 text-[11px] text-gray-400"
                              title={`${r.symbol} is not listed on Coinbase; showing ${r.streamed_as}`}
                            >
                              for {r.symbol}
                            </span>
                          )}
                          {r.stale && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              no recent trade
                            </Badge>
                          )}
                        </td>
                        <td className={`py-2 pr-3 text-right font-mono transition-colors ${flash}`}>
                          {price(live)}
                        </td>
                        <td className={`py-2 pr-3 text-right font-mono ${tone(r.change_24h_pct)}`}>
                          {pct(r.change_24h_pct)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-gray-600">
                          {price(r.high_24h)} / {price(r.low_24h)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {usdCompact(r.volume_24h_usd)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">
                          {r.spread_bps == null ? "—" : `${Number(r.spread_bps).toFixed(1)} bps`}
                        </td>
                        <td className="py-2 pr-3">
                          <Spark values={r.sparkline} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!!markets.data?.meta.dropped.length && (
            <p className="mt-4 text-xs text-gray-500">
              Not listed on Coinbase, so not shown: {markets.data.meta.dropped.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      {selectedRow && (
        <PairDetail
          row={selectedRow}
          livePrice={ticks[selectedRow.streamed_as]?.price ?? selectedRow.price}
        />
      )}
    </div>
  );
}

function MoversCard({
  title,
  icon,
  rows,
  onPick,
}: {
  title: string;
  icon: React.ReactNode;
  rows: MarketRow[];
  onPick: (s: string) => void;
}) {
  return (
    <Card className="bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">Waiting for live 24h data…</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.streamed_as}>
                <button
                  type="button"
                  onClick={() => onPick(r.streamed_as)}
                  className="flex w-full justify-between rounded px-1 hover:bg-purple-50"
                >
                  <span className="font-semibold">{r.streamed_as}</span>
                  <span className="font-mono">
                    {price(r.price)}{" "}
                    <span className={tone(r.change_24h_pct)}>{pct(r.change_24h_pct)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Spark({ values }: { values: string[] }) {
  if (values.length < 2) return <span className="text-[11px] text-gray-400">collecting</span>;
  const W = 100;
  const H = 24;
  const nums = values.map(Number);
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || hi * 0.001 || 1;
  const d = nums
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (nums.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / span) * (H - 2) - 1).toFixed(1)}`
    )
    .join("");
  const up = (nums.at(-1) ?? 0) >= (nums[0] ?? 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-24" preserveAspectRatio="none" aria-hidden>
      <path
        d={d}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={up ? "stroke-emerald-500" : "stroke-rose-500"}
      />
    </svg>
  );
}

function PairDetail({ row, livePrice }: { row: MarketRow; livePrice: string | null }) {
  const trades = useQuery({
    queryKey: ["cs-trades", row.streamed_as],
    queryFn: () => getJson<{ data: TradeRow[] }>(`/v1/trades/${row.streamed_as}`),
    refetchInterval: 2_000,
  });
  return (
    <Card className="bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-3">
          {row.streamed_as}
          <span className="font-mono text-2xl">{price(livePrice)}</span>
          <span className={`font-mono text-base ${tone(row.change_24h_pct)}`}>
            {pct(row.change_24h_pct)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Best bid / ask</dt>
          <dd className="font-mono">
            {price(row.bid)} / {price(row.ask)}
          </dd>
          <dt className="text-gray-500">Spread</dt>
          <dd className="font-mono">
            {row.spread_bps == null ? "—" : `${Number(row.spread_bps).toFixed(2)} bps`}
          </dd>
          <dt className="text-gray-500">24h high / low</dt>
          <dd className="font-mono">
            {price(row.high_24h)} / {price(row.low_24h)}
          </dd>
          <dt className="text-gray-500">24h volume</dt>
          <dd className="font-mono">
            {row.volume_24h == null
              ? "—"
              : `${Number(row.volume_24h).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row.base}`}{" "}
            · {usdCompact(row.volume_24h_usd)}
          </dd>
          <dt className="text-gray-500">52-week high / low</dt>
          <dd className="font-mono">
            {price(row.high_52w)} / {price(row.low_52w)}
          </dd>
          <dt className="text-gray-500">Source</dt>
          <dd>
            {row.venue ?? "—"} ·{" "}
            {row.age_ms == null
              ? "no recent update"
              : `updated ${(row.age_ms / 1000).toFixed(1)}s ago`}
          </dd>
        </dl>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Latest trades
          </h3>
          {!trades.data?.data.length ? (
            <p className="text-sm text-gray-500">No trades since the stream started.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left font-medium">Time</th>
                  <th className="text-right font-medium">Price</th>
                  <th className="text-right font-medium">Size</th>
                  <th className="text-right font-medium">Side</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {trades.data.data.slice(0, 15).map((t) => (
                  <tr key={t.trade_id}>
                    <td>{new Date(t.ts_ms).toLocaleTimeString()}</td>
                    <td className="text-right">{price(t.price)}</td>
                    <td className="text-right">
                      {Number(t.size).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                    </td>
                    <td
                      className={`text-right ${t.side === "buy" ? "text-emerald-600" : t.side === "sell" ? "text-rose-600" : "text-gray-400"}`}
                    >
                      {t.side ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
