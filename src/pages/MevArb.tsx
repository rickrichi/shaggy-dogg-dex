import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, ExternalLink } from "lucide-react";

import { ArbExecutorDeployCard } from "@/components/ArbExecutorDeployCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

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
  liquidity?: ExecutableLiquidity;
}

interface ExecutableLiquidity {
  ticksCrossed?: number;
  priceImpactBps?: number;
  maxExecutableAmount?: number;
  insufficientDepth?: boolean;
}

interface ThresholdSensitivity {
  samples: number;
  thresholds: Record<string, { opportunities: number; netEth: number }>;
}

interface BuilderTelemetry {
  attempts: number;
  accepted: number;
  observed: number;
  included: number;
  medianInclusionLatencyMs: number | null;
}

interface LiquidityTelemetry {
  samples: number;
  ticksCrossed: number;
  maxTicksCrossed: number;
  maxPriceImpactBps: number;
  maxExecutableAmount: number | null;
  insufficientDepthRejections: number;
}

export interface Tier2TelemetrySummary {
  enabled: boolean;
  authorityEnabled: boolean;
  eligible: boolean;
  samples: number;
  agreedSamples: number;
  agreementRate: number;
  streak: number;
  reason: string | null;
  totals: {
    evaluated: number;
    unavailable: number;
    authorityUsed: number;
    improvedCount: number;
    adaptiveExpansions: number;
  };
  last: {
    block: string;
    target: string;
    boundaryMode: string;
    currentProfit: string;
    tier2ExactProfit: string | null;
    profitDelta: string | null;
    authorityUsed: boolean;
  } | null;
}

export interface Tier3TelemetrySummary {
  shadowEnabled: boolean;
  authorityEnabled: boolean;
  modelVersion: string | null;
  halted: boolean;
  haltReason: string | null;
  control: { resolved: number; landed: number; landingRate: number };
  experiment: { resolved: number; landed: number; landingRate: number };
  totals: {
    proposals: number;
    insufficientEvidence: number;
    assignedExperiment: number;
    appliedExperiment: number;
  };
  last: {
    pair: string;
    assignedGroup: string;
    appliedGroup: string;
    proposalStatus: string;
    sharePpm: number | null;
    expectedNetWei: string | null;
  } | null;
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
  sessionTotals?: ChainSummary["totals"];
  execution?: ExecutionFunnel;
  sessionExecution?: ExecutionFunnel;
  risk?: RiskSnapshot;
  tier2?: Tier2TelemetrySummary;
  thresholdSensitivity?: ThresholdSensitivity;
  liquidity?: LiquidityTelemetry;
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
  liquidity?: ExecutableLiquidity;
  poolOnly?: {
    tx: string;
    blindAmountIn: number;
    blindProfitQuote: number;
    blindNetEth: number;
    blindDecision: string;
  };
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
    poolOnlyLanded?: number;
    poolOnlySimulated?: number;
    blindWorthSending?: number;
    blindBundlesSent?: number;
    skippedBusy: number;
    simulated: number;
    profitableBeforeGas: number;
    worthSending: number;
    bundlesSent: number;
    landed: number;
    errors: number;
    rateLimited: number;
  };
  sessionTotals?: BackrunSummary["totals"];
  execution?: ExecutionFunnel;
  sessionExecution?: ExecutionFunnel;
  blindDiagnostics?: {
    attempted: number;
    skipped: number;
    failed: number;
    lastReason: string | null;
    lastAt: string | null;
  };
  missAudit?: MissAuditSummary;
  sessionMissAudit?: MissAuditSummary;
  competitorLosses?: CompetitorLoss[];
  orderFlow?: Record<string, OrderFlowStats>;
  risk?: RiskSnapshot;
  tier2?: Tier2TelemetrySummary;
  tier3?: Tier3TelemetrySummary;
  latencyMs?: {
    samples: number;
    avgTotalMs: number;
    p50TotalMs: number;
    p95TotalMs: number;
    lastTotalMs: number | null;
    avgSimMs: number;
    avgSendMs: number;
    avgDecisionMs?: number;
    avgSigningMs?: number;
    avgRelayMs?: number;
    send?: StagePct & { samples: number };
    stages?: {
      prepMs: StagePct;
      simMs: StagePct;
      signingMs: StagePct;
      relayMs: StagePct;
      snapshotAgeMs: StagePct;
      snapshotLagBlocks: StagePct;
    };
    relayNetworkFailures?: number;
    eventLoopMs?: { p50: number; p99: number; max: number; at: string };
  };
  buildersSeen?: Record<string, number>;
  builders?: Record<string, BuilderTelemetry>;
  thresholdSensitivity?: ThresholdSensitivity;
  liquidity?: LiquidityTelemetry;
  submissionPopulations?: {
    pricedAccepted: number;
    blindAccepted: number;
    relayAttempts: number;
    rejectedOrUnclassified: number;
  };
  nonInclusion?: {
    userTransactionAbsent: number;
    bundleUnderbid: number;
    simulationDivergence: number;
    nonceConflict: number;
    unknown: number;
  };
  best: BackrunRow | null;
  recent: BackrunRow[];
  submissions: ChainSummary["submissions"];
}

type MissOutcome =
  | "landed"
  | "no_user_tx_hash"
  | "user_swap_not_landed"
  | "landed_before_window"
  | "landed_after_window"
  | "competitor_backran"
  | "would_have_succeeded"
  | "would_have_reverted"
  | "inconclusive";

interface MissAuditSummary {
  total: number;
  outcomes: Partial<Record<MissOutcome, number>>;
  retries?: number;
  errors?: number;
  queueDropped?: number;
}

const MISS_LABEL: Record<MissOutcome, string> = {
  landed: "our backrun landed",
  no_user_tx_hash: "hint could not be followed",
  user_swap_not_landed: "user swap did not land",
  landed_before_window: "user landed before our window",
  landed_after_window: "user landed after our window",
  competitor_backran: "competitor moved our route first",
  would_have_succeeded: "still profitable; builder/bid lost",
  would_have_reverted: "stale or no longer profitable",
  inconclusive: "inconclusive after audit failures",
};

export interface CompetitorLoss {
  t: string;
  hash: string;
  pair: string;
  block: string;
  builder: string | null;
  userTx: string | null;
  userIndex: number | null;
  competitor: {
    tx: string;
    from: string | null;
    to: string | null;
    index: number | null;
    priorityFeeWei: string | null;
    coinbaseTransferWei: string | null;
    pools: string[];
  };
  ourBidWei: string | null;
  ourNetEth: number | null;
  sendLagMs: number | null;
}

export interface OrderFlowStats {
  connected: boolean;
  lastEventAt: string | null;
  lastError: string | null;
  txs: number;
  traced: number;
  traceErrors: number;
  droppedBusy: number;
  withSwaps: number;
  noRoute?: number;
  priced: number;
  worthSending: number;
  bestNetEth: number | null;
  reconnects?: number;
  disconnects?: number;
  disconnectedMs?: number;
  disconnectedSince?: string | null;
  lastCloseCode?: number | null;
}

const FEED_NAME: Record<string, string> = {
  mempool: "Public mempool",
  mevblocker: "MEV Blocker",
  liquidation: "Combined liquidation backrun",
};

function OrderFlowFeeds({ feeds }: { feeds: Record<string, OrderFlowStats> | undefined }) {
  const entries = Object.entries(feeds ?? {});
  if (!entries.length) return null;
  return (
    <>
      {entries.map(([name, f]) => {
        const isListener = name === "liquidation";
        const status = f.connected
          ? isListener
            ? "listener enabled"
            : "connected"
          : isListener
            ? "listener inactive"
            : "not connected";
        return (
          <div
            key={name}
            className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
          >
            <strong className="text-foreground">{FEED_NAME[name] ?? name} feed</strong> · {status}
            {!f.connected && f.lastError ? ` (${f.lastError})` : ""} · {f.txs} txs · {f.traced}{" "}
            simulated · {f.withSwaps} moved our pools
            {f.noRoute ? ` (${f.noRoute} opened no price gap)` : ""} · {f.priced} routes priced ·{" "}
            {f.worthSending} worth sending
            {f.bestNetEth !== null ? ` · best net ${f.bestNetEth.toFixed(4)} ETH` : ""}
            {f.traceErrors ? ` · ${f.traceErrors} trace errors` : ""}
            {f.droppedBusy ? ` · ${f.droppedBusy} skipped (busy)` : ""}
            {f.disconnects !== undefined
              ? ` · ${f.reconnects ?? 0} reconnects / ${f.disconnects} disconnects`
              : ""}
            {f.disconnectedMs ? ` · ${(f.disconnectedMs / 1000).toFixed(1)} s disconnected` : ""}
            {f.lastCloseCode ? ` · last close ${f.lastCloseCode}` : ""}
          </div>
        );
      })}
    </>
  );
}

const ETHERSCAN = "https://etherscan.io";

function ethOf(wei: string | null): string {
  if (wei === null) return "?";
  try {
    const eth = Number(BigInt(wei)) / 1e18;
    return eth === 0 ? "0" : eth < 0.0001 ? eth.toExponential(1) : eth.toFixed(4);
  } catch {
    return "?";
  }
}

function addWei(a: string | null, b: string | null): string | null {
  try {
    return (BigInt(a ?? "0") + BigInt(b ?? "0")).toString();
  } catch {
    return null;
  }
}

function lagText(ms: number | null): string {
  if (ms === null) return "send timing not recorded";
  const s = (Math.abs(ms) / 1000).toFixed(2);
  return ms > 0
    ? `we sent ${s} s after the block started (too late)`
    : `we sent ${s} s before the block`;
}

function CompetitorLosses({ losses }: { losses: CompetitorLoss[] | undefined }) {
  if (!losses?.length) return null;
  const short = (h: string) => `${h.slice(0, 8)}…`;
  return (
    <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        <strong className="text-foreground">Lost to competitors</strong> · last {losses.length}
      </summary>
      <ul className="mt-1 space-y-1">
        {losses.map((l) => {
          const paid =
            l.competitor.coinbaseTransferWei === null
              ? `${ethOf(l.competitor.priorityFeeWei)} ETH priority fee + direct builder payment not traced`
              : `${ethOf(addWei(l.competitor.priorityFeeWei, l.competitor.coinbaseTransferWei))} ETH to the builder`;
          return (
            <li key={l.hash} className="break-words">
              {new Date(l.t).toLocaleString()} · {l.pair} · block{" "}
              <a
                className="underline"
                href={`${ETHERSCAN}/block/${l.block}`}
                target="_blank"
                rel="noreferrer"
              >
                #{l.block}
              </a>{" "}
              · winner{" "}
              <a
                className="underline"
                href={`${ETHERSCAN}/tx/${l.competitor.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(l.competitor.tx)}
              </a>{" "}
              at position {l.competitor.index ?? "?"}
              {l.userIndex !== null ? ` (user swap at ${l.userIndex})` : ""} paid {paid} · we bid{" "}
              {ethOf(l.ourBidWei)} ETH
              {l.ourNetEth !== null ? ` (est. net ${l.ourNetEth.toFixed(4)} ETH)` : ""} ·{" "}
              {lagText(l.sendLagMs)}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function missBreakdown(a: MissAuditSummary) {
  return (Object.entries(a.outcomes) as Array<[MissOutcome, number]>)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([outcome, n]) => `${n} ${MISS_LABEL[outcome]}`)
    .join(" · ");
}

export interface ArbSummary {
  version: 1 | 2;
  startedAt: string;
  lifetimeStartedAt?: string;
  updatedAt: string;
  chains: ChainSummary[];
  backrun?: BackrunSummary;
}

interface ExecutionFunnel {
  attempts: number;
  accepted: number;
  rejected: number;
  notIncluded: number;
  reverted: number;
  landed: number;
  realizedProfitQuote: number;
  realizedLossWei: string;
  pending?: number;
  unresolved?: number;
}

interface StagePct {
  p50: number;
  p95: number;
}

interface RiskSnapshot {
  paused: boolean;
  reason: string | null;
  utcDay: string;
  realizedLossWei: string;
  dailyLossLimitWei: string;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
}

const EXPLORER: Record<string, string> = {
  base: "https://basescan.org",
  ethereum: "https://etherscan.io",
};
const NAME: Record<string, string> = { base: "Base", ethereum: "Ethereum" };

const CONTROL_FETCH_TIMEOUT_MS = 20_000;
// The server's challenge expires after 120 s, so a later signature would be rejected anyway.
const CONTROL_SIGN_TIMEOUT_MS = 110_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function Tier2Telemetry({ t }: { t: Tier2TelemetrySummary | undefined }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  if (!t?.enabled) return null;
  const rate = `${(t.agreementRate * 100).toFixed(1)}%`;
  const setAuthority = async (enabled: boolean) => {
    setPending("Authorizing…");
    setControlError(null);
    try {
      // Use the wallet connected through the site's Connect button, not raw window.ethereum:
      // with several extensions installed, window.ethereum can be a different wallet whose
      // prompt never appears, leaving the request pending forever. Loaded on click so the
      // read-only dashboard does not initialize wallet connectors.
      const [{ wagmiConfig }, { getAccount, signMessage }] = await Promise.all([
        import("@/wagmi"),
        import("wagmi/actions"),
      ]);
      const account = getAccount(wagmiConfig);
      const address = account.address;
      if (!account.isConnected || !address)
        throw new Error("Connect the executor-owner wallet with the Connect button first.");
      const challengeResponse = await fetch(
        `/api/mev/arb/control/tier2/challenge?address=${encodeURIComponent(address)}&enabled=${enabled}`,
        { cache: "no-store", signal: AbortSignal.timeout(CONTROL_FETCH_TIMEOUT_MS) }
      );
      const challenge = (await challengeResponse.json()) as {
        nonce?: string;
        message?: string;
        error?: string;
      };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message)
        throw new Error(challenge.error ?? "Could not authorize the Tier 2 change.");
      setPending("Confirm in wallet…");
      const signature = await withTimeout(
        signMessage(wagmiConfig, { account: address, message: challenge.message }),
        CONTROL_SIGN_TIMEOUT_MS,
        "The wallet did not respond. Open your wallet extension, then try again."
      );
      setPending("Applying…");
      const response = await fetch("/api/mev/arb/control/tier2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, enabled, nonce: challenge.nonce, signature }),
        signal: AbortSignal.timeout(CONTROL_FETCH_TIMEOUT_MS),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Tier 2 control failed.");
      await queryClient.invalidateQueries({ queryKey: ["mev-arb-summary"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tier 2 control failed.";
      setControlError(
        error instanceof Error && error.name === "TimeoutError"
          ? "The control server did not respond. Try again."
          : /reject|denied/i.test(message)
            ? "Signature request was rejected."
            : message
      );
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-foreground">Tier 2 sizing</strong>
        <Badge variant={t.eligible ? "default" : "outline"}>
          {t.eligible ? "Authority eligible" : "Burn-in"}
        </Badge>
        <label
          className="flex items-center gap-1.5"
          title="Requires a signature from the authorized admin wallet"
        >
          <Switch
            className="h-5 w-9 [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4"
            checked={t.authorityEnabled}
            disabled={pending !== null || (!t.authorityEnabled && !t.eligible)}
            onCheckedChange={(enabled) => void setAuthority(enabled)}
            aria-label="Tier 2 execution authority"
          />
          <span>{pending ?? (t.authorityEnabled ? "Execution enabled" : "Shadow only")}</span>
        </label>
      </div>
      {controlError ? <div className="mt-1 text-destructive">{controlError}</div> : null}
      <div className="mt-1">
        {t.agreedSamples}/{t.samples} agreed ({rate}) · streak {t.streak} · {t.totals.evaluated}{" "}
        evaluated · {t.totals.authorityUsed} authority uses · {t.totals.improvedCount} improvements
        · {t.totals.adaptiveExpansions} adaptive expansions · {t.totals.unavailable} unavailable
      </div>
      {t.last ? (
        <div className="mt-1 break-all">
          Latest #{t.last.block}: {t.last.target} · {t.last.boundaryMode} · profit Δ{" "}
          {t.last.profitDelta ?? "—"} raw units{t.last.authorityUsed ? " · Tier 2 used" : ""}
        </div>
      ) : t.reason ? (
        <div className="mt-1">{t.reason}</div>
      ) : null}
    </div>
  );
}

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
        {c.risk?.paused ? (
          <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Submissions paused by burn-in guard: {c.risk.reason}
          </div>
        ) : null}
        <Tier2Telemetry t={c.tier2} />
        <div className="text-xs text-muted-foreground">
          Block #{c.lastBlock ?? "—"} ({ago(c.lastBlockAt, now)}) · watching {c.spreads.length}{" "}
          pairs ({c.venues.v2} v2 pairs, {c.venues.v3} v3 pools, {c.venues.v4} v4 pools) ·{" "}
          {c.totals.candidates.toLocaleString()} price gaps seen ·{" "}
          {c.totals.simulated.toLocaleString()} simulated · {c.totals.profitableBeforeGas}{" "}
          profitable before gas · <strong>{c.totals.worthSending} worth sending</strong>
          {c.mode === "live" ? ` · ${c.totals.submissions} sent, ${c.totals.landed} landed` : ""}
        </div>
        {c.thresholdSensitivity ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Shadow net-threshold sensitivity ({c.thresholdSensitivity.samples} priced routes):{" "}
            {Object.entries(c.thresholdSensitivity.thresholds)
              .map(([threshold, value]) =>
                `${threshold} ETH → ${value.opportunities} (${value.netEth.toFixed(6)} ETH)`,
              )
              .join(" · ")}
          </div>
        ) : null}
        {c.liquidity ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Executable liquidity: {c.liquidity.samples} samples · {c.liquidity.ticksCrossed} tick
            boundaries crossed (max {c.liquidity.maxTicksCrossed}) · max impact{" "}
            {c.liquidity.maxPriceImpactBps.toFixed(1)} bps · max executable amount{" "}
            {c.liquidity.maxExecutableAmount?.toLocaleString() ?? "unknown"} ·{" "}
            {c.liquidity.insufficientDepthRejections} insufficient-depth rejections
          </div>
        ) : null}
        {c.sessionTotals ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Current session: {c.sessionTotals.simulated} simulated · {c.sessionTotals.worthSending}{" "}
            worth sending · {c.sessionTotals.submissions} accepted · {c.sessionTotals.landed}{" "}
            landed. Lifetime: {c.totals.simulated} simulated · {c.totals.submissions} accepted ·{" "}
            {c.totals.landed} landed.
          </div>
        ) : null}
        {c.execution ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {c.sessionExecution ? "Current-session" : "Lifetime"} execution:{" "}
            {(c.sessionExecution ?? c.execution).attempts} attempts →{" "}
            {(c.sessionExecution ?? c.execution).accepted} relay/sequencer accepted →{" "}
            <strong>{(c.sessionExecution ?? c.execution).landed} landed</strong> ·{" "}
            {(c.sessionExecution ?? c.execution).rejected} rejected ·{" "}
            {(c.sessionExecution ?? c.execution).notIncluded} not included ·{" "}
            {(c.sessionExecution ?? c.execution).reverted} reverted · realized{" "}
            {(c.sessionExecution ?? c.execution).realizedProfitQuote.toFixed(4)} quote units ·
            realized gas loss{" "}
            {(Number((c.sessionExecution ?? c.execution).realizedLossWei) / 1e18).toPrecision(3)}{" "}
            ETH. Lifetime: {c.execution.attempts} attempts / {c.execution.landed} landed.
          </div>
        ) : null}

        <div className="max-h-72 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Pair</th>
                <th className="pr-3">Pools</th>
                <th className="pr-3">Price range</th>
                <th className="pr-3">Best gap after fees</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              {[...c.spreads]
                .sort((a, b) => (b.bestEdgeBps ?? -Infinity) - (a.bestEdgeBps ?? -Infinity))
                .map((s) => {
                  const prices = s.venues.map((v) => v.price);
                  const hasPrices = prices.length > 0;
                  const lo = hasPrices ? Math.min(...prices) : 0;
                  const hi = hasPrices ? Math.max(...prices) : 0;
                  const digits = hi >= 100 ? 2 : 6;
                  return (
                    <tr key={s.pair} className="border-t">
                      <td className="py-1 pr-3 font-medium">{s.pair}</td>
                      <td className="pr-3">{s.venues.length}</td>
                      <td className="pr-3 tabular-nums">
                        {hasPrices ? `${lo.toFixed(digits)} – ${hi.toFixed(digits)}` : "—"}
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
                  {s.tx && (s.status === "landed" || s.status === "reverted") ? (
                    <a
                      className="inline-flex items-center gap-1 underline"
                      href={`${ex}/tx/${s.tx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.tx.slice(0, 10)}… <ExternalLink className="size-3" />
                    </a>
                  ) : s.tx ? (
                    <code
                      className="text-xs"
                      title="Private transaction hash; it will not exist on a block explorer unless included"
                    >
                      {s.tx.slice(0, 10)}…
                    </code>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-1 text-xs text-muted-foreground">
              Private submissions marked not included were never placed on-chain, so block explorers
              will not have a transaction page for them.
            </div>
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          {c.blocksProcessed.toLocaleString()} state snapshots checked,{" "}
          {c.blocksSkipped.toLocaleString()} newer blocks observed while the previous scan was busy
          {c.sessionTotals ? (
            <>
              {" "}
              · this session: {c.sessionTotals.errors} errors ({c.sessionTotals.rateLimited} RPC
              rate limits) · lifetime: {c.totals.errors} errors ({c.totals.rateLimited} RPC rate
              limits)
            </>
          ) : (
            <>
              {" "}
              · {c.totals.errors} errors ({c.totals.rateLimited} RPC rate limits)
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function acceptedBundles(totals: BackrunSummary["totals"]) {
  const priced = `${totals.bundlesSent.toLocaleString()} priced accepted`;
  return totals.blindBundlesSent === undefined
    ? priced
    : `${priced} · ${totals.blindBundlesSent.toLocaleString()} blind accepted`;
}

function BackrunCard({ b, now }: { b: BackrunSummary; now: number }) {
  const recentHint = !!b.lastEventAt && now - Date.parse(b.lastEventAt) < STALE_MS;
  const feedStatus = !b.connected
    ? "Not connected"
    : recentHint
      ? "Listening"
      : b.lastEventAt
        ? "Connected · no recent hints"
        : "Connected · awaiting first hint";
  const t = b.totals;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Ethereum backruns (Flashbots MEV-Share)
          <Badge variant={!b.connected ? "destructive" : recentHint ? "default" : "secondary"}>
            {feedStatus}
          </Badge>
          <Badge variant="outline">
            {b.mode === "live" ? "LIVE — sends bundles" : "Shadow — simulates, never sends"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {b.risk?.paused ? (
          <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
            MEV-Share submissions paused by burn-in guard: {b.risk.reason}
          </div>
        ) : null}
        <Tier2Telemetry t={b.tier2} />
        {b.tier3 ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-foreground">Tier 3 bid experiment</strong>
              <Badge
                variant={
                  b.tier3.halted ? "destructive" : b.tier3.authorityEnabled ? "default" : "outline"
                }
              >
                {b.tier3.halted ? "Halted" : b.tier3.authorityEnabled ? "5% authority" : "Shadow"}
              </Badge>
              <span>{b.tier3.modelVersion ?? "no model samples"}</span>
            </div>
            {b.tier3.haltReason ? (
              <div className="mt-1 text-destructive">{b.tier3.haltReason}</div>
            ) : null}
            <div className="mt-1">
              Control: {b.tier3.control.landed}/{b.tier3.control.resolved} landed (
              {(b.tier3.control.landingRate * 100).toFixed(1)}%) · experiment:{" "}
              {b.tier3.experiment.landed}/{b.tier3.experiment.resolved} (
              {(b.tier3.experiment.landingRate * 100).toFixed(1)}%)
            </div>
            <div className="mt-1">
              {b.tier3.totals.proposals} proposals · {b.tier3.totals.assignedExperiment} assigned to
              5% cohort · {b.tier3.totals.appliedExperiment} experimental bids applied ·{" "}
              {b.tier3.totals.insufficientEvidence} awaiting evidence
            </div>
            {b.tier3.last ? (
              <div className="mt-1">
                Last: {b.tier3.last.pair} · {b.tier3.last.assignedGroup} →{" "}
                {b.tier3.last.appliedGroup} · {b.tier3.last.proposalStatus}
                {b.tier3.last.sharePpm !== null
                  ? ` · ${(b.tier3.last.sharePpm / 10_000).toFixed(2)}% bid`
                  : ""}
              </div>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Wallets that opt in to MEV-Share announce pending swaps. When one moves a Uniswap pool we
          watch, the bot prices a trade placed right after it that brings the pool back in line. The
          user is refunded most of what that trade pays the block builder. It never trades ahead of
          anyone.
        </p>
        <div className="text-xs text-muted-foreground">
          {t.events.toLocaleString()} hints seen · {t.swapHints.toLocaleString()} swapped on our
          pools ({t.withSwapData} with the swap result, {t.poolOnly} pool only
          {t.poolOnlyLanded !== undefined
            ? ` — ${t.poolOnlyLanded} matched after landing, ${t.poolOnlySimulated ?? 0} priced`
            : ""}
          ) · {t.simulated} simulated · {t.profitableBeforeGas} profitable before gas ·{" "}
          <strong>{t.worthSending} worth sending</strong>
          {t.blindWorthSending !== undefined ? ` (${t.blindWorthSending} blind)` : ""}
          {b.mode === "live"
            ? ` · ${acceptedBundles(t)} · ${t.landed} landed`
            : ""}
        </div>
        {b.sessionTotals ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Current session: {b.sessionTotals.simulated} simulated · {b.sessionTotals.worthSending}{" "}
            worth sending · {acceptedBundles(b.sessionTotals)} · {b.sessionTotals.landed}{" "}
            landed. Lifetime: {t.simulated} simulated · {acceptedBundles(t)} · {t.landed}{" "}
            landed.
          </div>
        ) : null}
        {b.execution ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {b.sessionExecution ? "Current-session" : "Lifetime"} submission audit:{" "}
            {(b.sessionExecution ?? b.execution).attempts}{" "}
            attempts → {(b.sessionExecution ?? b.execution).accepted} relay accepted →{" "}
            <strong>{(b.sessionExecution ?? b.execution).landed} landed</strong> ·{" "}
            {(b.sessionExecution ?? b.execution).rejected} rejected ·{" "}
            {(b.sessionExecution ?? b.execution).notIncluded} not included ·{" "}
            {(b.sessionExecution ?? b.execution).reverted} reverted
            {(b.sessionExecution ?? b.execution).pending !== undefined
              ? ` · ${(b.sessionExecution ?? b.execution).pending} awaiting outcome`
              : ""}{" "}
            · realized {(b.sessionExecution ?? b.execution).realizedProfitQuote.toFixed(4)} quote
            units. Lifetime: {b.execution.attempts} attempts / {b.execution.landed} landed
            {b.execution.unresolved
              ? ` / ${b.execution.unresolved} unresolved across restarts`
              : ""}
            .
          </div>
        ) : null}
        {b.submissionPopulations ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Submission populations: {b.submissionPopulations.relayAttempts} relay attempts;{" "}
            {b.submissionPopulations.pricedAccepted} priced accepted +{" "}
            {b.submissionPopulations.blindAccepted} blind accepted
            {b.submissionPopulations.rejectedOrUnclassified
              ? `; ${b.submissionPopulations.rejectedOrUnclassified} rejected or legacy-unclassified attempts`
              : ""}
            . Legacy <code>bundlesSent</code> counts priced bundles only.
          </div>
        ) : null}
        {b.thresholdSensitivity ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Shadow net-threshold sensitivity ({b.thresholdSensitivity.samples} priced routes):{" "}
            {Object.entries(b.thresholdSensitivity.thresholds)
              .map(([threshold, value]) =>
                `${threshold} ETH → ${value.opportunities} (${value.netEth.toFixed(6)} ETH)`,
              )
              .join(" · ")}
          </div>
        ) : null}
        {b.liquidity ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Executable liquidity: {b.liquidity.samples} samples · {b.liquidity.ticksCrossed} tick
            boundaries crossed (max {b.liquidity.maxTicksCrossed}) · max impact{" "}
            {b.liquidity.maxPriceImpactBps.toFixed(1)} bps · max executable amount{" "}
            {b.liquidity.maxExecutableAmount?.toLocaleString() ?? "unknown"} ·{" "}
            {b.liquidity.insufficientDepthRejections} insufficient-depth rejections
          </div>
        ) : null}
        {b.nonInclusion ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Non-inclusion attribution: {b.nonInclusion.userTransactionAbsent} user transaction
            absent · {b.nonInclusion.bundleUnderbid} underbid ·{" "}
            {b.nonInclusion.simulationDivergence} simulation divergence ·{" "}
            {b.nonInclusion.nonceConflict} nonce conflict · {b.nonInclusion.unknown} unknown
          </div>
        ) : null}
        {b.missAudit &&
        (b.missAudit.total > 0 ||
          (b.missAudit.retries ?? 0) > 0 ||
          (b.missAudit.errors ?? 0) > 0 ||
          (b.missAudit.queueDropped ?? 0) > 0) ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Accepted-bundle outcome audit: current session {b.sessionMissAudit?.total ?? 0}
            {b.sessionMissAudit?.total ? ` (${missBreakdown(b.sessionMissAudit)})` : ""}. Lifetime{" "}
            {b.missAudit.total}
            {b.missAudit.total ? ` (${missBreakdown(b.missAudit)})` : ""}. Reliability: current
            session {b.sessionMissAudit?.retries ?? 0} retries · {b.sessionMissAudit?.errors ?? 0}{" "}
            RPC errors · {b.sessionMissAudit?.queueDropped ?? 0} queue drops; lifetime{" "}
            {b.missAudit.retries ?? 0} retries · {b.missAudit.errors ?? 0} RPC errors ·{" "}
            {b.missAudit.queueDropped ?? 0} queue drops.
          </div>
        ) : null}
        <CompetitorLosses losses={b.competitorLosses} />
        <OrderFlowFeeds feeds={b.orderFlow} />
        {b.blindDiagnostics ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Blind fanout diagnostics: {b.blindDiagnostics.attempted} attempted ·{" "}
            {b.blindDiagnostics.skipped} skipped · {b.blindDiagnostics.failed} failed
            {b.blindDiagnostics.lastReason ? ` · latest: ${b.blindDiagnostics.lastReason}` : ""}
          </div>
        ) : null}
        {b.latencyMs && b.latencyMs.samples > 0 ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Latency: p50 <strong>{b.latencyMs.p50TotalMs.toFixed(1)} ms</strong> · p95{" "}
            <strong>{b.latencyMs.p95TotalMs.toFixed(1)} ms</strong> · simulation{" "}
            {b.latencyMs.avgSimMs.toFixed(1)} ms · signing{" "}
            {(b.latencyMs.avgSigningMs ?? 0).toFixed(1)} ms · relay{" "}
            {(b.latencyMs.avgRelayMs ?? b.latencyMs.avgSendMs).toFixed(1)} ms · builders:{" "}
            {Object.keys(b.buildersSeen ?? {}).join(", ") || "default relay set"}
          </div>
        ) : null}
        {b.builders && Object.keys(b.builders).length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Builder / relay</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Accepted</th>
                  <th className="px-3 py-2">Observed</th>
                  <th className="px-3 py-2">Included</th>
                  <th className="px-3 py-2">Median inclusion latency</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(b.builders).map(([name, value]) => (
                  <tr key={name} className="border-t">
                    <td className="px-3 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2 tabular-nums">{value.attempts}</td>
                    <td className="px-3 py-2 tabular-nums">{value.accepted}</td>
                    <td className="px-3 py-2 tabular-nums">{value.observed}</td>
                    <td className="px-3 py-2 tabular-nums">{value.included}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {value.medianInclusionLatencyMs === null
                        ? "—"
                        : `${value.medianInclusionLatencyMs.toFixed(0)} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {b.latencyMs?.stages ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Latency stages (p50 / p95):{" "}
            {b.latencyMs.send && b.latencyMs.send.samples > 0
              ? `hint→relay ${b.latencyMs.send.p50.toFixed(0)} / ${b.latencyMs.send.p95.toFixed(0)} ms · `
              : ""}
            state refresh {b.latencyMs.stages.prepMs.p50.toFixed(0)} /{" "}
            {b.latencyMs.stages.prepMs.p95.toFixed(0)} ms · simulation{" "}
            {b.latencyMs.stages.simMs.p50.toFixed(0)} / {b.latencyMs.stages.simMs.p95.toFixed(0)} ms
            · relay {b.latencyMs.stages.relayMs.p50.toFixed(0)} /{" "}
            {b.latencyMs.stages.relayMs.p95.toFixed(0)} ms · snapshot age{" "}
            {(b.latencyMs.stages.snapshotAgeMs.p50 / 1000).toFixed(1)} /{" "}
            {(b.latencyMs.stages.snapshotAgeMs.p95 / 1000).toFixed(1)} s (
            {b.latencyMs.stages.snapshotLagBlocks.p50} / {b.latencyMs.stages.snapshotLagBlocks.p95}{" "}
            blocks behind)
            {b.latencyMs.relayNetworkFailures
              ? ` · ${b.latencyMs.relayNetworkFailures} relay timeouts/network failures`
              : ""}
            {b.latencyMs.eventLoopMs
              ? ` · event-loop delay p99 ${b.latencyMs.eventLoopMs.p99.toFixed(0)} ms (max ${b.latencyMs.eventLoopMs.max.toFixed(0)} ms)`
              : ""}
          </div>
        ) : null}
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
                    <td className="pr-3">
                      {r.swapVenue}
                      {r.poolOnly ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (pool-only{" "}
                          <a
                            className="underline"
                            href={`https://etherscan.io/tx/${r.poolOnly.tx}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.poolOnly.tx.slice(0, 8)}…
                          </a>
                          )
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap pr-3">
                      {r.buy} → {r.sell}
                    </td>
                    <td className="pr-3 tabular-nums">{r.edgeBps.toFixed(2)} bp</td>
                    <td className="pr-3 tabular-nums">{fmtSigned(r.profitQuote, r.quote)}</td>
                    <td className="pr-3 tabular-nums">
                      {fmtSigned(r.netEth, "ETH")}
                      {r.poolOnly ? (
                        <div className="text-xs text-muted-foreground">
                          blind: {fmtSigned(r.poolOnly.blindNetEth, "ETH")}
                        </div>
                      ) : null}
                    </td>
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

export default function MevArb({ now }: { now: number }) {
  const q = useQuery({ queryKey: ["mev-arb-summary"], queryFn: fetchArb, refetchInterval: 15_000 });
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <ArrowRightLeft className="size-5" /> Uniswap v2 / v3 / v4 arbitrage
      </h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Compares every configured Uniswap v2, v3 and v4 pool for each pair whenever the scanner is
        free. On fast chains such as Base it samples the newest available state instead of queuing
        stale blocks. When one pool is cheaper than another by more than both fees, it runs the
        whole trade (flash borrow from the v4 PoolManager, buy, sell, repay) on the real chain state
        at many sizes, then subtracts gas. Only trades that clear the minimum after gas are ever
        sent.
      </p>
      <ArbExecutorDeployCard />
      {q.isError ? (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="size-4 text-destructive" />
            {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : null}
      {q.data ? (
        <div className="grid grid-cols-1 gap-4">
          {q.data.chains.map((c) => (
            <ChainCard key={c.chain} c={c} now={now} />
          ))}
          {q.data.backrun ? <BackrunCard b={q.data.backrun} now={now} /> : null}
        </div>
      ) : null}
    </section>
  );
}
