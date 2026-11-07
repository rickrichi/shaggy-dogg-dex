import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Read-only summary of the Uniswap v2/v3/v4 arbitrage scanner on the market-data VM
// (vercel.json forwards /api/mev/* there).
export const ARB_SUMMARY_PATH = "/api/mev/arb/summary";
const STALE_MS = 120_000;

export interface ArbRow {
  t: string;
  block: string;
  pair: string;
  buy: string;
  sell: string;
  edgeBps: number;
  amountIn: number;
  quote: string;
  profitQuote: number;
  profitEth: number;
  gasEth: number;
  netEth: number;
  decision: string;
}

export interface ChainSummary {
  chain: string;
  mode: "shadow" | "live";
  lastBlock: string | null;
  lastBlockAt: string | null;
  blocksProcessed: number;
  blocksSkipped: number;
  venues: { v2: number; v3: number; v4: number };
  totals: {
    candidates: number;
    simulated: number;
    profitableBeforeGas: number;
    worthSending: number;
    submissions: number;
    landed: number;
    errors: number;
    rateLimited: number;
  };
  best: ArbRow | null;
  spreads: Array<{
    pair: string;
    venues: Array<{ label: string; price: number; feeBps: number }>;
    bestEdgeBps: number | null;
    buy: string | null;
    sell: string | null;
  }>;
  recent: ArbRow[];
  submissions: Array<{
    t: string;
    block: string;
    pair: string;
    tx: string | null;
    status: string;
    profitQuote: number;
    quote: string;
  }>;
}

export interface BackrunRow {
  t: string;
  block: string;
  pair: string;
  swapVenue: string;
  buy: string;
  sell: string;
  edgeBps: number;
  amountIn: number;
  quote: string;
  profitQuote: number;
  profitEth: number;
  gasEth: number;
  bribeEth: number;
  netEth: number;
  decision: string;
}

export interface BackrunSummary {
  chain: string;
  mode: "shadow" | "live";
  connected: boolean;
  lastEventAt: string | null;
  totals: {
    events: number;
    swapHints: number;
    withSwapData: number;
    poolOnly: number;
    skippedBusy: number;
    simulated: number;
    profitableBeforeGas: number;
    worthSending: number;
    bundlesSent: number;
    landed: number;
    errors: number;
    rateLimited: number;
  };
  best: BackrunRow | null;
  recent: BackrunRow[];
  submissions: ChainSummary["submissions"];
}

export interface ArbSummary {
  version: 1;
  startedAt: string;
  updatedAt: string;
  chains: ChainSummary[];
  backrun?: BackrunSummary;
}

const EXPLORER: Record<string, string> = {
  base: "https://basescan.org",
  ethereum: "https://etherscan.io",
};
const NAME: Record<string, string> = { base: "Base", ethereum: "Ethereum" };

async function fetchArb(): Promise<ArbSummary> {
  let res: Response;
  try {
    res = await fetch(ARB_SUMMARY_PATH, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("The arbitrage scanner's server did not answer.");
  }
  if (!res.ok) throw new Error(`The arbitrage scanner's server answered HTTP ${res.status}.`);
  return (await res.json()) as ArbSummary;
}

export const fmtSigned = (v: number, unit: string) => {
  const a = Math.abs(v);
  const s = a === 0 ? "0" : a >= 0.01 ? a.toFixed(4) : a.toPrecision(3);
  return `${v < 0 ? "−" : ""}${s} ${unit}`;
};

const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 90
    ? `${s}s ago`
    : s < 5400
      ? `${Math.round(s / 60)} min ago`
      : `${Math.round(s / 3600)} h ago`;
};

function ChainCard({ c, now }: { c: ChainSummary; now: number }) {
  const live = !!c.lastBlockAt && now - Date.parse(c.lastBlockAt) < STALE_MS;
  const ex = EXPLORER[c.chain] ?? "https://etherscan.io";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {NAME[c.chain] ?? c.chain}
          <Badge variant={live ? "default" : "destructive"}>
            {live ? "Running" : "Not responding"}
          </Badge>
          <Badge variant="outline">
            {c.mode === "live" ? "LIVE — sends transactions" : "Shadow — simulates, never sends"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="text-xs text-muted-foreground">
          Block #{c.lastBlock ?? "—"} ({ago(c.lastBlockAt, now)}) · watching {c.venues.v2} v2 pairs,{" "}
          {c.venues.v3} v3 pools, {c.venues.v4} v4 pools · {c.totals.candidates.toLocaleString()}{" "}
          price gaps seen · {c.totals.simulated.toLocaleString()} simulated ·{" "}
          {c.totals.profitableBeforeGas} profitable before gas ·{" "}
          <strong>{c.totals.worthSending} worth sending</strong>
          {c.mode === "live" ? ` · ${c.totals.submissions} sent, ${c.totals.landed} landed` : ""}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Pair</th>
                <th className="pr-3">Pools</th>
                <th className="pr-3">Price range</th>
                <th className="pr-3">Best gap after fees</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              {c.spreads.map((s) => {
                const prices = s.venues.map((v) => v.price);
                const lo = Math.min(...prices);
                const hi = Math.max(...prices);
                const digits = hi >= 100 ? 2 : 6;
                return (
                  <tr key={s.pair} className="border-t">
                    <td className="py-1 pr-3 font-medium">{s.pair}</td>
                    <td className="pr-3">{s.venues.length}</td>
                    <td className="pr-3 tabular-nums">
                      {lo.toFixed(digits)} – {hi.toFixed(digits)}
                    </td>
                    <td
                      className={`pr-3 tabular-nums ${s.bestEdgeBps !== null && s.bestEdgeBps > 0 ? "font-semibold text-emerald-600" : ""}`}
                    >
                      {s.bestEdgeBps === null ? "—" : `${s.bestEdgeBps.toFixed(2)} bp`}
                    </td>
                    <td className="text-muted-foreground">
                      {s.buy && s.sell ? `${s.buy} → ${s.sell}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {c.best ? (
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs text-muted-foreground">Best simulated so far</div>
            {c.best.pair}: buy on {c.best.buy}, sell on {c.best.sell},{" "}
            {c.best.amountIn.toPrecision(4)} {c.best.quote} in →{" "}
            {fmtSigned(c.best.profitQuote, c.best.quote)} · gas {fmtSigned(c.best.gasEth, "ETH")} ·
            net <strong>{fmtSigned(c.best.netEth, "ETH")}</strong> · {c.best.decision}
          </div>
        ) : null}

        {c.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">When</th>
                  <th className="pr-3">Pair</th>
                  <th className="pr-3">Route</th>
                  <th className="pr-3">Gap</th>
                  <th className="pr-3">Best size</th>
                  <th className="pr-3">Profit</th>
                  <th className="pr-3">Net after gas</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {c.recent.slice(0, 12).map((r) => (
                  <tr key={`${r.t}-${r.pair}-${r.buy}-${r.sell}`} className="border-t">
                    <td className="whitespace-nowrap py-1 pr-3">{ago(r.t, now)}</td>
                    <td className="pr-3">{r.pair}</td>
                    <td className="whitespace-nowrap pr-3">
                      {r.buy} → {r.sell}
                    </td>
                    <td className="pr-3 tabular-nums">{r.edgeBps.toFixed(2)} bp</td>
                    <td className="pr-3 tabular-nums">
                      {r.amountIn.toPrecision(4)} {r.quote}
                    </td>
                    <td className="pr-3 tabular-nums">{fmtSigned(r.profitQuote, r.quote)}</td>
                    <td className="pr-3 tabular-nums">{fmtSigned(r.netEth, "ETH")}</td>
                    <td>
                      {r.decision === "send" ? (
                        <Badge className="bg-emerald-600">worth sending</Badge>
                      ) : (
                        <span className="text-muted-foreground">{r.decision}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted-foreground">No price gap has survived the fee check yet.</div>
        )}

        {c.submissions.length ? (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Transactions sent</div>
            <ul className="space-y-1">
              {c.submissions.map((s) => (
                <li key={s.tx ?? s.t} className="flex flex-wrap items-center gap-2">
                  {ago(s.t, now)} · {s.pair} · {s.status}
                  {s.status === "landed" ? ` · +${s.profitQuote} ${s.quote}` : ""}
                  {s.tx ? (
                    <a
                      className="inline-flex items-center gap-1 underline"
                      href={`${ex}/tx/${s.tx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.tx.slice(0, 10)}… <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          {c.blocksProcessed.toLocaleString()} blocks checked, {c.blocksSkipped.toLocaleString()}{" "}
          skipped while busy · {c.totals.errors} errors ({c.totals.rateLimited} free-RPC rate
          limits)
        </div>
      </CardContent>
    </Card>
  );
}

function BackrunCard({ b, now }: { b: BackrunSummary; now: number }) {
  const live = b.connected && !!b.lastEventAt && now - Date.parse(b.lastEventAt) < STALE_MS;
  const t = b.totals;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Ethereum backruns (Flashbots MEV-Share)
          <Badge variant={live ? "default" : "destructive"}>
            {live ? "Listening" : "Not connected"}
          </Badge>
          <Badge variant="outline">
            {b.mode === "live" ? "LIVE — sends bundles" : "Shadow — simulates, never sends"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Wallets that opt in to MEV-Share announce pending swaps. When one moves a Uniswap pool we
          watch, the bot prices a trade placed right after it that brings the pool back in line. The
          user is refunded most of what that trade pays the block builder. It never trades ahead of
          anyone.
        </p>
        <div className="text-xs text-muted-foreground">
          {t.events.toLocaleString()} hints seen · {t.swapHints.toLocaleString()} swapped on our
          pools ({t.withSwapData} with the swap result, {t.poolOnly} pool only) · {t.simulated}{" "}
          simulated · {t.profitableBeforeGas} profitable before gas ·{" "}
          <strong>{t.worthSending} worth sending</strong>
          {b.mode === "live" ? ` · ${t.bundlesSent} sent, ${t.landed} landed` : ""}
        </div>
        {b.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">When</th>
                  <th className="pr-3">Pair</th>
                  <th className="pr-3">User swapped on</th>
                  <th className="pr-3">Backrun route</th>
                  <th className="pr-3">Gap</th>
                  <th className="pr-3">Profit</th>
                  <th className="pr-3">Net after gas</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {b.recent.slice(0, 12).map((r) => (
                  <tr key={`${r.t}-${r.pair}-${r.buy}-${r.sell}`} className="border-t">
                    <td className="whitespace-nowrap py-1 pr-3">{ago(r.t, now)}</td>
                    <td className="pr-3">{r.pair}</td>
                    <td className="pr-3">{r.swapVenue}</td>
                    <td className="whitespace-nowrap pr-3">
                      {r.buy} → {r.sell}
                    </td>
                    <td className="pr-3 tabular-nums">{r.edgeBps.toFixed(2)} bp</td>
                    <td className="pr-3 tabular-nums">{fmtSigned(r.profitQuote, r.quote)}</td>
                    <td className="pr-3 tabular-nums">{fmtSigned(r.netEth, "ETH")}</td>
                    <td>
                      {r.decision === "send" ? (
                        <Badge className="bg-emerald-600">worth sending</Badge>
                      ) : (
                        <span className="text-muted-foreground">{r.decision}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted-foreground">
            No announced swap has opened a gap bigger than the pool fees yet.
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {t.skippedBusy} skipped while busy · {t.errors} errors ({t.rateLimited} free-RPC rate
          limits)
        </div>
      </CardContent>
    </Card>
  );
}

export default function MevArb() {
  const q = useQuery({ queryKey: ["mev-arb-summary"], queryFn: fetchArb, refetchInterval: 15_000 });
  const now = Date.now();
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <ArrowRightLeft className="size-5" /> Uniswap v2 / v3 / v4 arbitrage
      </h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Compares every Uniswap v2, v3 and v4 pool for each pair, every block. When one pool is
        cheaper than another by more than both fees, it runs the whole trade (flash borrow from the
        v4 PoolManager, buy, sell, repay) on the real chain state at many sizes, then subtracts gas.
        Only trades that clear the minimum after gas are ever sent.
      </p>
      {q.isError ? (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="size-4 text-destructive" />
            {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : null}
      {q.data ? (
        <div className="grid gap-4">
          {q.data.chains.map((c) => (
            <ChainCard key={c.chain} c={c} now={now} />
          ))}
          {q.data.backrun ? <BackrunCard b={q.data.backrun} now={now} /> : null}
        </div>
      ) : null}
    </section>
  );
}
