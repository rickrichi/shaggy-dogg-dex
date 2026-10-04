// src/hooks/useCeFiArbStream.ts
import { useCallback, useEffect, useRef, useState } from "react";

import { ARB_API_URL, ARB_WS_URL } from "@/config/crypto-arb";
import {
  type ConnState,
  isSnapshot,
  type Opportunity,
  type Snapshot,
  type Subscription,
  type VenueState,
} from "@/types/crypto-arb";

const DEFAULT_WS_URL = ARB_WS_URL;
const DEFAULT_API_URL = `${ARB_API_URL}/api/snapshot`;
const MAX_HISTORY = 120;

export interface CeFiArbStreamResult {
  snapshot: Snapshot | null;
  conn: ConnState;
  lagMs: number | null;
  bestNetHistory: number[];
  venues: VenueState[];
  opportunities: Opportunity[];
  isLive: boolean;
  refetchSnapshot: () => Promise<void>;
}

export function useCeFiArbStream(
  sub: Subscription = { notional: 1000, minNetBps: -1e9, symbols: null }
): CeFiArbStreamResult {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lagMs, setLagMs] = useState<number | null>(null);
  const [bestNetHistory, setBestNetHistory] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now);

  const wsRef = useRef<WebSocket | null>(null);
  const generationRef = useRef(0);
  const latestTimestamp = useRef(0);
  const pendingFetch = useRef<AbortController | null>(null);
  const subRef = useRef<Subscription>(sub);
  subRef.current = sub;

  // Direct REST fetch fallback
  const fetchSnapshotDirect = useCallback(async () => {
    pendingFetch.current?.abort();
    const controller = new AbortController();
    pendingFetch.current = controller;
    const generation = generationRef.current;
    const subscription = JSON.stringify(subRef.current);
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const url = new URL(DEFAULT_API_URL);
      url.searchParams.set("notional", String(subRef.current.notional));
      url.searchParams.set("minNetBps", String(subRef.current.minNetBps));

      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (
        !controller.signal.aborted &&
        generation === generationRef.current &&
        subscription === JSON.stringify(subRef.current) &&
        isSnapshot(data) &&
        data.ts >= latestTimestamp.current
      ) {
        latestTimestamp.current = data.ts;
        // The REST endpoint accepts notional and minNetBps only.
        if (subRef.current.symbols?.length) {
          data.opportunities = data.opportunities.filter((item) =>
            subRef.current.symbols!.includes(item.symbol)
          );
        }
        setSnapshot(data);
        setLagMs(Math.max(0, Date.now() - data.ts));
        const best = data.opportunities[0]?.netBps;
        if (best !== undefined) {
          setBestNetHistory((h) =>
            h.length >= MAX_HISTORY ? [...h.slice(1), best] : [...h, best]
          );
        }
      }
    } catch {
      // Quiet fail on REST fallback polling
    } finally {
      clearTimeout(timeout);
      if (pendingFetch.current === controller) pendingFetch.current = null;
    }
  }, []);

  // WebSocket lifecycle management
  useEffect(() => {
    generationRef.current++;
    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      try {
        const ws = new WebSocket(DEFAULT_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close();
            return;
          }
          attempt = 0;
          setConn("open");
          ws.send(JSON.stringify({ type: "subscribe", ...subRef.current }));
        };

        ws.onmessage = (ev: MessageEvent<string>) => {
          if (disposed) return;
          let msg: unknown;
          try {
            msg = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (!isSnapshot(msg) || msg.ts < latestTimestamp.current) return;
          latestTimestamp.current = msg.ts;
          setSnapshot(msg);
          setLagMs(Math.max(0, Date.now() - msg.ts));
          const best = msg.opportunities[0]?.netBps;
          if (best !== undefined) {
            setBestNetHistory((h) =>
              h.length >= MAX_HISTORY ? [...h.slice(1), best] : [...h, best]
            );
          }
        };

        ws.onclose = (ev) => {
          if (wsRef.current === ws) wsRef.current = null;
          if (disposed) return;
          if (ev.code === 1008) {
            // Origin rejected; fallback to REST polling
            setConn("closed");
            fetchSnapshotDirect();
            return;
          }
          setConn("reconnecting");
          const delay = Math.min(10_000, 500 * 2 ** attempt++) * (0.5 + Math.random());
          timer = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // Failed handshakes trigger onclose themselves. Closing CONNECTING
          // here produces a second premature-close error in the browser.
          if (ws.readyState === WebSocket.OPEN) ws.close();
        };
      } catch {
        setConn("reconnecting");
        timer = setTimeout(connect, 3000);
      }
    };

    // React StrictMode cleans up its first effect before this task runs.
    timer = setTimeout(connect, 0);

    // Fallback heartbeat ticker: polls REST if WS is not open
    const fallbackTicker = setInterval(() => {
      setNow(Date.now());
      if (
        !pendingFetch.current &&
        (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      ) {
        fetchSnapshotDirect();
      }
    }, 2500);

    return () => {
      disposed = true;
      generationRef.current++;
      pendingFetch.current?.abort();
      clearTimeout(timer);
      clearInterval(fallbackTicker);
      if (wsRef.current) {
        const ws = wsRef.current;
        // If the handshake is pending, onopen sees disposed and closes it.
        // Do not abort a CONNECTING socket just because a tab unmounted.
        if (ws.readyState === WebSocket.OPEN) ws.close(1000);
        wsRef.current = null;
      }
    };
  }, [fetchSnapshotDirect]);

  // Resubscribe on subscription change
  const subKey = JSON.stringify(sub);
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "subscribe", ...subRef.current }));
      setBestNetHistory([]);
    } else {
      fetchSnapshotDirect();
    }
  }, [subKey, fetchSnapshotDirect]);

  return {
    snapshot,
    conn,
    lagMs,
    bestNetHistory,
    venues: snapshot?.venues ?? [],
    opportunities: snapshot?.opportunities ?? [],
    isLive: Boolean(snapshot && Math.max(now, Date.now()) - snapshot.ts < 5000),
    refetchSnapshot: fetchSnapshotDirect,
  };
}
