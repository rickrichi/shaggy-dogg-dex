import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ARB_API_URL, ARB_PRIVATE_API } from "@/config/crypto-arb";

interface TriangleExecution {
  id: string;
  state: string;
  route: { route: string };
  error?: string;
  summary?: string;
  balances: Record<string, number>;
  orders: Array<{ id: string | null; clientOrderId: string; symbol: string; status: string }>;
}

export function KrakenTriangleJournal() {
  const [executions, setExecutions] = useState<TriangleExecution[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(`${ARB_API_URL}/api/kraken/triangular/executions`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Triangle history unavailable");
    const data = await response.json();
    setExecutions(data.executions);
  }, []);

  useEffect(() => {
    if (!ARB_PRIVATE_API) return;
    const poll = () => {
      void refresh().catch(() => setError("Triangle history unavailable"));
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const reconcile = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${ARB_API_URL}/api/kraken/triangular/executions/${encodeURIComponent(id)}/reconcile`,
        {
          method: "POST",
          headers: { "X-Trade-Intent": "live" },
          signal: AbortSignal.timeout(45000),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Broker refresh failed");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Broker refresh failed");
    } finally {
      setBusy(false);
    }
  };

  if (!ARB_PRIVATE_API || (!executions.length && !error)) return null;
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Kraken triangle history">
      <h3 className="font-semibold">Kraken triangle history</h3>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {executions.map((execution) => (
        <div key={execution.id} className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">
            {execution.route.route} · {execution.state}
          </p>
          <p>{execution.error || execution.summary}</p>
          <p>
            Remaining currencies (fees may be estimated):{" "}
            {Object.entries(execution.balances)
              .map(([asset, amount]) => `${amount.toPrecision(6)} ${asset}`)
              .join(" · ")}
          </p>
          {execution.orders.map((order) => (
            <p key={order.clientOrderId} className="break-all text-xs text-muted-foreground">
              {order.symbol} · {order.status} · Order{" "}
              {order.id || `pending (${order.clientOrderId})`}
            </p>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void reconcile(execution.id)}
          >
            Refresh broker status
          </Button>
        </div>
      ))}
    </section>
  );
}
