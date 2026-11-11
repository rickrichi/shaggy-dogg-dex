import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import MevArb from "./MevArb";

// Read-only summary published by the aave-mev searcher on the market-data VM. vercel.json forwards
// /api/mev/* there; in development Vite proxies it.
export const MEV_SUMMARY_PATH = "/api/mev/summary";
const STALE_MS = 120_000;

export interface OpportunityRow {
  t: string;
  block: string;
  user: string;
  hf: number;
  pair: string;
  funding: string;
  profitEth: number;
  gasEth: number;
  netEth: number | null;
  decision: string;
}

export interface CompetitorRow {
  t: string;
  block: string;
  tx: string;
  user: string;
  liquidator: string;
  pair: string;
  seenByUs: boolean;
}

export interface WinnerStats {
  txs: number;
  bonusEth: number;
  paidEth: number;
  shareP25: number | null;
  shareMedian: number | null;
  shareP75: number | null;
}

export interface WinnerRow {
  t: string;
  block: string;
  tx: string;
  liquidator: string;
  pairs: string[];
  bonusEth: number;
  paidEth: number;
  share: number | null;
  afterOracleUpdate: boolean;
}

export interface MevSummary {
  version: 1;
  mode: string;
  chain: string;
  startedAt: string | null;
  updatedAt: string;
  lastBlock: string | null;
  lastBlockAt: string | null;
  borrowersIndexed: number;
  hotAccounts: number;
  blocksProcessed: number;
  blocksSkipped: number;
  totals: {
    opportunities: number;
    viable: number;
    simFailed: number;
    submissions: number;
    competitorLiquidations: number;
    competitorSeenByUs: number;
    errors: number;
    rateLimited: number;
  };
  /** Chainlink SVR oracle-update backruns. Absent on bot builds before 2026-11-11. */
  oracle?: {
    hints: number;
    unreplayable: number;
    aaveUpdates: number;
    positionsPushedUnder: number;
    opportunities: number;
    viable: number;
    simFailed: number;
    submissions: number;
    competitorTargets: number;
  };
  /** What winning liquidators earned and paid block builders. Absent on older bot builds. */
  winners?: {
    oracleBackruns: WinnerStats;
    other: WinnerStats;
    recent: WinnerRow[];
  };
  best: OpportunityRow | null;
  sumProfitEth: number;
  recentOpportunities: OpportunityRow[];
  recentCompetitors: CompetitorRow[];
  decisions: Record<string, number>;
}

async function fetchSummary(): Promise<MevSummary> {
  let res: Response;
  try {
    res = await fetch(MEV_SUMMARY_PATH, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("The bot's server did not answer.");
  }
  if (!res.ok) throw new Error(`The bot's server answered HTTP ${res.status}.`);
  return (await res.json()) as MevSummary;
}

/** ETH amounts here are often dust: show 4 significant digits instead of rounding to 0. */
export function fmtEth(v: number | null): string {
  if (v === null) return "—";
  if (v === 0) return "0 ETH";
  const abs = Math.abs(v);
  return `${abs >= 0.01 ? v.toFixed(4) : v.toPrecision(3)} ETH`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const ES = "https://etherscan.io";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function WinnerLine({ label, w }: { label: string; w: WinnerStats }) {
  return (
    <p>
      <strong>{label}:</strong> {w.txs.toLocaleString()} transactions · bonus {fmtEth(w.bonusEth)} ·
      paid to builders {fmtEth(w.paidEth)} · winners kept {fmtEth(w.bonusEth - w.paidEth)} · payment
      as share of bonus: median {pct(w.shareMedian)} (middle half {pct(w.shareP25)}–
      {pct(w.shareP75)})
    </p>
  );
}

const verdict = (d: string) =>
  d === "send" ? (
    <Badge className="bg-emerald-600">worth sending</Badge>
  ) : (
    <span className="text-muted-foreground">{d}</span>
  );

export default function MevBot() {
  const q = useQuery({
    queryKey: ["mev-summary"],
    queryFn: fetchSummary,
    refetchInterval: 15_000,
  });
  const s = q.data;
  const now = Date.now();
  const live = !!s?.lastBlockAt && now - Date.parse(s.lastBlockAt) < STALE_MS;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Bot className="size-7" />
        <h1 className="text-2xl font-bold">MEV bots: Aave liquidations and Uniswap arbitrage</h1>
        {s ? (
          <>
            <Badge variant={live ? "default" : "destructive"}>
              {live ? "Running" : "Not responding"}
            </Badge>
            <Badge variant="outline">
              {s.mode === "live" ? "LIVE — sends bundles" : "Shadow — watches, never trades"}
            </Badge>
          </>
        ) : null}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Watches every Aave V3 borrower on Ethereum mainnet. When one can be liquidated it simulates
        the whole trade (flash loan, liquidation, swap, repay) on the real chain state, prices gas
        and a builder bribe, and records whether it would have been worth sending. In shadow mode
        nothing is signed or sent. This page is read-only.
      </p>

      {q.isLoading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading the bot&apos;s summary…
        </div>
      ) : null}
      {q.isError ? (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="size-4 text-destructive" />
            {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {s ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Last block checked"
              value={s.lastBlock ? `#${s.lastBlock}` : "—"}
              hint={ago(s.lastBlockAt, now)}
            />
            <Stat label="Borrowers watched" value={s.borrowersIndexed.toLocaleString()} />
            <Stat
              label="Close to liquidation"
              value={s.hotAccounts.toLocaleString()}
              hint="health factor under 1.05"
            />
            <Stat label="Liquidations simulated" value={s.totals.opportunities.toLocaleString()} />
            <Stat
              label="Worth sending"
              value={s.totals.viable.toLocaleString()}
              hint="profit after gas and bribe"
            />
            <Stat
              label="Taken by others"
              value={s.totals.competitorLiquidations.toLocaleString()}
              hint={`${s.totals.competitorSeenByUs} we had flagged`}
            />
          </div>

          {s.oracle ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Oracle-update backruns (Chainlink SVR via MEV-Share)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Most Aave liquidations happen in the same block as the price update that causes
                  them. Chainlink sends those updates privately through MEV-Share with the new price
                  in the hint, so the bot replays each update, finds the borrowers it pushes under
                  health factor 1 and simulates liquidating them right behind it.
                </p>
                <p>
                  {s.oracle.hints.toLocaleString()} oracle updates seen since restart ·{" "}
                  {s.oracle.aaveUpdates.toLocaleString()} moved an Aave price ·{" "}
                  {s.oracle.positionsPushedUnder.toLocaleString()} borrowers pushed under 1 ·{" "}
                  {s.oracle.opportunities.toLocaleString()} liquidations simulated ·{" "}
                  <strong>{s.oracle.viable.toLocaleString()} worth sending</strong>
                  {s.mode === "live" ? ` · ${s.oracle.submissions} sent` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.oracle.competitorTargets} liquidations by other bots were of borrowers we saw
                  an update push under 1 · {s.oracle.simFailed} simulations reverted ·{" "}
                  {s.oracle.unreplayable} updates already landed before we could replay them
                </p>
              </CardContent>
            </Card>
          ) : null}

          {s.winners ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What winning liquidators paid</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  For every liquidation another bot makes: the bonus it earned (collateral seized
                  minus debt repaid, at Aave&apos;s prices) and what it paid the block builder to
                  win the slot. A bid has to beat that share to win.
                </p>
                <WinnerLine label="Right after an oracle update" w={s.winners.oracleBackruns} />
                <WinnerLine label="Other liquidations" w={s.winners.other} />
                {s.winners.recent.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3">When</th>
                          <th className="pr-3">Pair</th>
                          <th className="pr-3">Bonus</th>
                          <th className="pr-3">Paid builder</th>
                          <th className="pr-3">Share</th>
                          <th className="pr-3">Oracle backrun?</th>
                          <th>Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.winners.recent.map((w) => (
                          <tr key={w.tx} className="border-t">
                            <td className="whitespace-nowrap py-1 pr-3">{ago(w.t, now)}</td>
                            <td className="pr-3">{w.pairs.join(", ")}</td>
                            <td className="pr-3 tabular-nums">{fmtEth(w.bonusEth)}</td>
                            <td className="pr-3 tabular-nums">{fmtEth(w.paidEth)}</td>
                            <td className="pr-3 tabular-nums">{pct(w.share)}</td>
                            <td className="pr-3">{w.afterOracleUpdate ? "yes" : "no"}</td>
                            <td>
                              <a
                                className="inline-flex items-center gap-1 underline"
                                href={`${ES}/tx/${w.tx}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {short(w.tx)} <ExternalLink className="size-3" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <span className="text-muted-foreground">No liquidation measured yet.</span>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Best opportunity so far</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {s.best ? (
                <div className="grid gap-2 md:grid-cols-5">
                  <div>
                    <div className="text-xs text-muted-foreground">Pair (collateral→debt)</div>
                    {s.best.pair}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Gross profit</div>
                    {fmtEth(s.best.profitEth)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Gas</div>
                    {fmtEth(s.best.gasEth)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Block</div>
                    <a
                      className="underline"
                      href={`${ES}/block/${s.best.block}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{s.best.block}
                    </a>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Verdict</div>
                    {verdict(s.best.decision)}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">No liquidatable position seen yet.</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent simulated liquidations</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {s.recentOpportunities.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">When</th>
                      <th className="pr-3">Borrower</th>
                      <th className="pr-3">Pair</th>
                      <th className="pr-3">Health</th>
                      <th className="pr-3">Profit</th>
                      <th className="pr-3">Gas</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.recentOpportunities.map((r) => (
                      <tr key={`${r.block}-${r.user}-${r.t}`} className="border-t">
                        <td className="whitespace-nowrap py-1 pr-3">{ago(r.t, now)}</td>
                        <td className="pr-3">
                          <a
                            className="underline"
                            href={`${ES}/address/${r.user}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(r.user)}
                          </a>
                        </td>
                        <td className="pr-3">{r.pair}</td>
                        <td className="pr-3 tabular-nums">{r.hf.toFixed(4)}</td>
                        <td className="pr-3 tabular-nums">{fmtEth(r.profitEth)}</td>
                        <td className="pr-3 tabular-nums">{fmtEth(r.gasEth)}</td>
                        <td>{verdict(r.decision)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="text-sm text-muted-foreground">None yet.</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Liquidations other bots made</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {s.recentCompetitors.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">When</th>
                      <th className="pr-3">Pair</th>
                      <th className="pr-3">Liquidator</th>
                      <th className="pr-3">Did we see it?</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.recentCompetitors.map((c) => (
                      <tr key={c.tx + c.user} className="border-t">
                        <td className="whitespace-nowrap py-1 pr-3">{ago(c.t, now)}</td>
                        <td className="pr-3">{c.pair}</td>
                        <td className="pr-3">
                          <a
                            className="underline"
                            href={`${ES}/address/${c.liquidator}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(c.liquidator)}
                          </a>
                        </td>
                        <td className="pr-3">{c.seenByUs ? "yes" : "no"}</td>
                        <td>
                          <a
                            className="inline-flex items-center gap-1 underline"
                            href={`${ES}/tx/${c.tx}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(c.tx)} <ExternalLink className="size-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="text-sm text-muted-foreground">
                  None since the bot started watching.
                </span>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Started {ago(s.startedAt, now)} · {s.blocksProcessed.toLocaleString()} blocks checked,{" "}
            {s.blocksSkipped.toLocaleString()} skipped while busy · {s.totals.simFailed} simulations
            reverted · {s.totals.errors} errors ({s.totals.rateLimited} were the free RPC
            rate-limiting) · summary {ago(s.updatedAt, now)}
          </p>
        </>
      ) : null}
      <MevArb />
    </div>
  );
}
