import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ARB_API_URL, ARB_PRIVATE_API } from "@/config/crypto-arb";

interface Quote {
  id?: string;
  expiresAt?: number;
  symbol?: string;
  buyVenue: string;
  sellVenue: string;
  buyUnderlying?: string;
  sellUnderlying?: string;
  buyAgeMs?: number;
  sellAgeMs?: number;
  buyDepth?: number;
  sellDepth?: number;
  buyDepthBase?: number;
  sellDepthBase?: number;
  buyQty?: number;
  sellQty?: number;
  buyLimit?: number;
  sellLimit?: number;
  buyCostUsd?: number;
  buyFeeUsd?: number;
  buyFeeCurrency?: string;
  buyFeeRate?: number;
  sellFeeUsd?: number;
  sellFeeRate?: number;
  netProceedsUsd?: number;
  netProfitUsd?: number;
  maxCostUsd?: number;
  minProceedsUsd?: number;
  availableBuyUsd?: number;
  availableSellBase?: number;
  executable: boolean;
  reasons: string[];
}

interface Execution {
  id: string;
  state: string;
  message: string;
  quote: Quote;
  remainingExposure: number | null;
  exposureEstimated?: boolean;
  cashFlowUsd?: number;
  feesFinal?: boolean;
  orders: Array<{
    id: string | null;
    venue: string;
    side: string;
    status: string;
    filled: number | null;
    requestedQty: number;
    average?: number | null;
  }>;
}

const usd = (value?: number) =>
  value == null
    ? "—"
    : value.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
const qty = (value?: number | null) =>
  value == null ? "Unknown" : value.toLocaleString(undefined, { maximumFractionDigits: 10 });
const pct = (value?: number) => (value == null ? "—" : `${(value * 100).toFixed(3)}%`);

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${ARB_API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json", "X-Trade-Intent": "live" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(
      typeof data.detail === "string" ? data.detail : "Live request failed",
      response.status
    );
  return data as T;
}

interface LiveVenueComparisonProps {
  symbol: string;
  notional: number;
  onExecuted: () => Promise<void>;
}

export function LiveVenueComparison(props: LiveVenueComparisonProps) {
  // Quotes and execution use exchange accounts, which exist only in the local crypto-arb backend.
  if (!ARB_PRIVATE_API) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live execution</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Live quotes and trading run in the Shaggy Dogg desktop app with your own exchange
          accounts. The spreads on this page are live and read-only.
        </CardContent>
      </Card>
    );
  }
  return <LiveVenueComparisonPanel {...props} />;
}

function LiveVenueComparisonPanel({ symbol, notional, onExecuted }: LiveVenueComparisonProps) {
  const [routes, setRoutes] = useState<Quote[]>([]);
  const [preview, setPreview] = useState<Quote | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const intent = useRef<{ previewId: string; requestId: string } | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const [uncertain, setUncertain] = useState(false);

  const refreshExecutions = useCallback(async () => {
    const result = await request<{ executions: Execution[] }>("/api/live/executions");
    setExecutions(result.executions);
    if (intent.current && result.executions.some((item) => item.id === intent.current?.requestId)) {
      intent.current = null;
      setUncertain(false);
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number;
    generation.current += 1;
    setRoutes([]);
    setPreview(null);
    const poll = async () => {
      try {
        const params = new URLSearchParams({ symbol, notional: String(notional) });
        const result = await request<{ routes: Quote[] }>(`/api/live/comparison?${params}`);
        if (active) {
          setRoutes(result.routes);
          setComparisonError("");
        }
      } catch (reason) {
        if (active) {
          setRoutes([]);
          setComparisonError(
            reason instanceof Error ? reason.message : "Live comparison unavailable"
          );
        }
      } finally {
        if (active) timer = window.setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [symbol, notional]);

  useEffect(() => {
    let active = true;
    let timer: number;
    const poll = async () => {
      try {
        await refreshExecutions();
      } catch {
        /* Retain known executions during reconnect. */
      }
      if (active) timer = window.setTimeout(poll, 3000);
    };
    void poll();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(clock);
    };
  }, [refreshExecutions]);

  const prepare = async (buyVenue: string) => {
    if (inFlight.current || uncertain) return;
    const version = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const result = await request<Quote>("/api/live/preview", { symbol, notional, buyVenue });
      if (version === generation.current) {
        setPreview(result);
        intent.current = { previewId: result.id!, requestId: crypto.randomUUID() };
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Preview failed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!intent.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await request<Execution>("/api/live/execute", { ...intent.current, confirmLive: true });
      setPreview(null);
      intent.current = null;
      setUncertain(false);
      void refreshExecutions().catch(() =>
        setError("Trade accepted; reconnecting to order updates")
      );
      void onExecuted();
    } catch (reason) {
      const rejected =
        reason instanceof RequestError && reason.status >= 400 && reason.status < 500;
      setUncertain(!rejected);
      if (rejected) {
        setPreview(null);
        intent.current = null;
      }
      setError(
        `${reason instanceof Error ? reason.message : "Execution response unavailable"}.${rejected ? " Request a fresh preview." : " Refresh order status or retry this same request; do not create a second trade."}`
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const reconcile = async (id: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await request(`/api/live/executions/${id}/reconcile`, {});
      await refreshExecutions();
      void onExecuted();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reconciliation failed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const recover = async (id: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await request(`/api/live/executions/${id}/recover`, {
        requestId: crypto.randomUUID(),
        confirmLive: true,
      });
      await refreshExecutions();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Recovery request failed; refresh broker status"
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-bold text-slate-900">
            Kraken ↔ Alpaca · Live comparison
          </CardTitle>
          <span className="text-xs font-semibold text-emerald-700">
            {symbol} · {usd(notional)} maximum
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Depth-priced quotes with account fees. Each trade requires a fresh preview and explicit
          execution.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {comparisonError && (
          <p role="status" className="text-sm text-amber-800">
            {comparisonError}
          </p>
        )}
        {uncertain && !preview && (
          <Button size="sm" disabled={busy} onClick={() => void execute()}>
            Retry same live request
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-amber-800">
            {error}
          </p>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {routes.map((route) => (
            <div
              key={route.buyVenue}
              className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs"
            >
              <h4 className="font-bold capitalize">
                Buy {route.buyVenue} → Sell {route.sellVenue}
              </h4>
              {route.id && (
                <>
                  <p className="text-slate-500">
                    Underlying venues: {route.buyUnderlying} → {route.sellUnderlying}
                  </p>
                  <p>
                    Quote age: {route.buyAgeMs} / {route.sellAgeMs} ms at calculation
                  </p>
                  <p>
                    Depth: {route.buyDepth} ask / {route.sellDepth} bid levels (
                    {qty(route.buyDepthBase)} / {qty(route.sellDepthBase)} base)
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <dt>Buy cash cost</dt>
                    <dd className="text-right font-mono">{usd(route.buyCostUsd)}</dd>
                    <dt>Buy fee · {pct(route.buyFeeRate)}</dt>
                    <dd className="text-right font-mono">
                      {usd(route.buyFeeUsd)} equivalent · {route.buyFeeCurrency}
                    </dd>
                    <dt>Sell fee · {pct(route.sellFeeRate)}</dt>
                    <dd className="text-right font-mono">{usd(route.sellFeeUsd)}</dd>
                    <dt>Net sell proceeds</dt>
                    <dd className="text-right font-mono">{usd(route.netProceedsUsd)}</dd>
                    <dt className="font-bold">Expected net profit</dt>
                    <dd
                      className={`text-right font-mono font-bold ${(route.netProfitUsd ?? 0) > 0 ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {usd(route.netProfitUsd)}
                    </dd>
                    <dt>Available buy cash</dt>
                    <dd className="text-right font-mono">{usd(route.availableBuyUsd)}</dd>
                    <dt>Available sell inventory</dt>
                    <dd className="text-right font-mono">{qty(route.availableSellBase)}</dd>
                  </dl>
                </>
              )}
              {route.reasons.map((reason) => (
                <p key={reason} className="text-amber-800">
                  {reason}
                </p>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={busy || uncertain || !route.executable}
                onClick={() => void prepare(route.buyVenue)}
              >
                Preview live trade
              </Button>
            </div>
          ))}
          {!routes.length && (
            <p className="text-xs text-slate-500">Waiting for live account and order book data…</p>
          )}
        </div>
        {preview && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
            <p className="font-bold">Live order preview · {preview.symbol}</p>
            <p>
              Buy {qty(preview.buyQty)} on {preview.buyVenue} at up to {usd(preview.buyLimit)}; sell
              the confirmed net fill on {preview.sellVenue} at no less than {usd(preview.sellLimit)}
              .
            </p>
            <p>
              Maximum buy cost: {usd(preview.maxCostUsd)}. Minimum proceeds if both quantities fill:{" "}
              {usd(preview.minProceedsUsd)}.
            </p>
            <p>
              Unfilled orders are canceled. A partial sell can receive one further attempt at the
              same price floor; any remaining exposure is retained and shown below.
            </p>
            {preview.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  busy || !preview.executable || (!uncertain && (preview.expiresAt ?? 0) <= now)
                }
                onClick={() => void execute()}
              >
                {uncertain
                  ? "Retry same live request"
                  : (preview.expiresAt ?? 0) <= now
                    ? "Preview expired"
                    : "Execute live pair"}
              </Button>
              {!uncertain && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setPreview(null);
                    intent.current = null;
                  }}
                >
                  Dismiss preview
                </Button>
              )}
            </div>
          </div>
        )}
        {executions.length > 0 && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <h4 className="text-sm font-bold">Live fills and remaining exposure</h4>
            {executions.slice(0, 10).map((execution) => (
              <div
                key={execution.id}
                className="space-y-1 rounded border border-slate-200 p-3 text-xs"
              >
                <p className="font-semibold">
                  {execution.quote.symbol} · {execution.state.replaceAll("_", " ")} ·{" "}
                  {execution.id.slice(0, 8)}
                </p>
                <p>{execution.message}</p>
                {execution.orders.map((order, i) => (
                  <p key={`${execution.id}-${i}`} className="font-mono">
                    {order.venue} {order.side}: {qty(order.filled)} / {qty(order.requestedQty)} ·{" "}
                    {order.status} · avg {usd(order.average ?? undefined)} ·{" "}
                    {order.id ?? "awaiting broker ID"}
                  </p>
                ))}
                <p className="font-semibold">
                  Remaining base exposure: {qty(execution.remainingExposure)}
                  {execution.exposureEstimated ? " (Alpaca fee awaiting final posting)" : ""}
                </p>
                <p>
                  Net cash flow from reported fills: {usd(execution.cashFlowUsd)}
                  {execution.feesFinal
                    ? " · fees reported"
                    : " · fees estimated until broker posting"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void reconcile(execution.id)}
                >
                  Refresh broker order status
                </Button>
                {execution.state === "exposure" && (execution.remainingExposure ?? 0) > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    disabled={busy}
                    onClick={() => void recover(execution.id)}
                  >
                    Execute residual sell at original limit
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
