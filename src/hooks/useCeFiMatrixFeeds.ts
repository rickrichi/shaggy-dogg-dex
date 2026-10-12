import { useCallback, useEffect, useState } from "react";

export interface MatrixCexPrice {
  bid: number;
  ask: number;
  ts: number;
}

const COINBASE_PAIRS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "DOGE-USD",
  "XRP-USD",
  "ADA-USD",
  "AVAX-USD",
  "LINK-USD",
  "SUI-USD",
  "AAVE-USD",
  "UNI-USD",
  "NEAR-USD",
  "SHIB-USD",
  "LTC-USD",
  "BCH-USD",
  "DOT-USD",
  "ATOM-USD",
  "APT-USD",
  "ARB-USD",
  "OP-USD",
  "INJ-USD",
  "SEI-USD",
  "TIA-USD",
  "FET-USD",
  "RENDER-USD",
  "GRT-USD",
  "LDO-USD",
  "PEPE-USD",
  "CRV-USD",
  "COMP-USD",
  "SNX-USD",
  "ENS-USD",
  "POL-USD",
  "XLM-USD",
  "ALGO-USD",
  "ICP-USD",
  "FIL-USD",
  "HBAR-USD",
  "ONDO-USD",
  "PENDLE-USD",
  "PYTH-USD",
  "BONK-USD",
  "FLOKI-USD",
  "JTO-USD",
  "ENA-USD",
  "WIF-USD",
  "RAY-USD",
  "STRK-USD",
  "BLUR-USD",
  "AERO-USD",
  "QNT-USD",
  "SAND-USD",
  "MANA-USD",
  "AXS-USD",
  "APE-USD",
  "CHZ-USD",
  "SUPER-USD",
  "PRIME-USD",
  "ETH-USDC",
  "BTC-USDC",
  "SOL-USDC",
];

const KRAKEN_PAIRS = [
  "XBT/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "ADA/USD",
  "DOGE/USD",
  "AVAX/USD",
  "LINK/USD",
  "DOT/USD",
  "LTC/USD",
  "BCH/USD",
  "ATOM/USD",
  "FIL/USD",
  "ICP/USD",
  "NEAR/USD",
  "UNI/USD",
  "AAVE/USD",
  "ALGO/USD",
  "XLM/USD",
  "ETH/USDC",
  "XBT/USDC",
  "SOL/USDC",
  "USDT/USD",
  "USDC/USD",
  "SHIB/USD",
  "PEPE/USD",
  "ARB/USD",
  "OP/USD",
  "INJ/USD",
  "SEI/USD",
  "TIA/USD",
  "FET/USD",
  "RENDER/USD",
  "GRT/USD",
  "CRV/USD",
  "SAND/USD",
  "MANA/USD",
  "APE/USD",
  "CHZ/USD",
];

export function useCeFiMatrixFeeds() {
  const [coinbaseQuotes, setCoinbaseQuotes] = useState<Record<string, MatrixCexPrice>>({});
  const [krakenQuotes, setKrakenQuotes] = useState<Record<string, MatrixCexPrice>>({});
  const [coinbaseConnected, setCoinbaseConnected] = useState(false);
  const [krakenConnected, setKrakenConnected] = useState(false);

  // ───────────────────────────── Coinbase WebSocket ─────────────────────────────
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connectCoinbase = () => {
      try {
        ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");

        ws.onopen = () => {
          if (disposed) return;
          attempt = 0;
          setCoinbaseConnected(true);
          ws?.send(
            JSON.stringify({
              type: "subscribe",
              product_ids: COINBASE_PAIRS,
              channels: ["ticker"],
            })
          );
        };

        ws.onmessage = (e: MessageEvent<string>) => {
          if (disposed) return;
          try {
            const m = JSON.parse(e.data);
            if (m.type === "ticker" && m.product_id && m.best_bid && m.best_ask) {
              const bid = Number(m.best_bid);
              const ask = Number(m.best_ask);
              if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
                const now = Date.now();
                setCoinbaseQuotes((prev) => ({
                  ...prev,
                  [m.product_id]: { bid, ask, ts: now },
                  [m.product_id.replace("-", "/")]: { bid, ask, ts: now },
                }));
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setCoinbaseConnected(false);
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          retryTimer = setTimeout(connectCoinbase, delay);
        };

        ws.onerror = () => ws?.close();
      } catch {
        if (!disposed) {
          retryTimer = setTimeout(connectCoinbase, 3000);
        }
      }
    };

    connectCoinbase();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // ───────────────────────────── Kraken WebSocket ─────────────────────────────
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connectKraken = () => {
      try {
        ws = new WebSocket("wss://ws.kraken.com");

        ws.onopen = () => {
          if (disposed) return;
          attempt = 0;
          setKrakenConnected(true);
          ws?.send(
            JSON.stringify({
              event: "subscribe",
              pair: KRAKEN_PAIRS,
              subscription: { name: "ticker" },
            })
          );
        };

        ws.onmessage = (e: MessageEvent<string>) => {
          if (disposed) return;
          try {
            const m = JSON.parse(e.data);
            if (Array.isArray(m) && m[1] && m[3]) {
              const pair = String(m[3]);
              const data = m[1];
              const bid = Number(data.b?.[0]);
              const ask = Number(data.a?.[0]);
              if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
                const now = Date.now();
                setKrakenQuotes((prev) => {
                  const updated: Record<string, MatrixCexPrice> = {
                    ...prev,
                    [pair]: { bid, ask, ts: now },
                  };
                  // Also normalize XBT to BTC
                  if (pair.includes("XBT")) {
                    const btcPair = pair.replace("XBT", "BTC");
                    updated[btcPair] = { bid, ask, ts: now };
                  }
                  // Normalize XDG to DOGE
                  if (pair.includes("XDG")) {
                    const dogePair = pair.replace("XDG", "DOGE");
                    updated[dogePair] = { bid, ask, ts: now };
                  }
                  return updated;
                });
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setKrakenConnected(false);
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          retryTimer = setTimeout(connectKraken, delay);
        };

        ws.onerror = () => ws?.close();
      } catch {
        if (!disposed) {
          retryTimer = setTimeout(connectKraken, 3000);
        }
      }
    };

    connectKraken();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // ───────────────────────────── Query Helpers ─────────────────────────────
  const getCoinbaseQuote = useCallback(
    (symbol: string): MatrixCexPrice | null => {
      // 1. Exact match (e.g. "ETH/USDC" or "ETH-USDC")
      if (coinbaseQuotes[symbol]) return coinbaseQuotes[symbol];
      const dashed = symbol.replace("/", "-");
      if (coinbaseQuotes[dashed]) return coinbaseQuotes[dashed];

      // 2. Base asset match for USD/USDC/USDT
      const [baseAsset, quoteAsset] = symbol.split("/");
      if (!baseAsset) return null;

      if (quoteAsset === "USDT" || quoteAsset === "USD" || quoteAsset === "USDC") {
        return (
          coinbaseQuotes[`${baseAsset}-USD`] ??
          coinbaseQuotes[`${baseAsset}-USDC`] ??
          coinbaseQuotes[`${baseAsset}/USD`] ??
          coinbaseQuotes[`${baseAsset}/USDC`] ??
          null
        );
      }

      return null;
    },
    [coinbaseQuotes]
  );

  const getKrakenQuote = useCallback(
    (symbol: string): MatrixCexPrice | null => {
      // 1. Exact match
      if (krakenQuotes[symbol]) return krakenQuotes[symbol];

      // 2. XBT translation
      const xbt = symbol.replace("BTC", "XBT");
      if (krakenQuotes[xbt]) return krakenQuotes[xbt];

      // 3. Base asset match for USD/USDC/USDT
      const [baseAsset, quoteAsset] = symbol.split("/");
      if (!baseAsset) return null;

      const baseKraken = baseAsset === "BTC" ? "XBT" : baseAsset === "DOGE" ? "XDG" : baseAsset;

      if (quoteAsset === "USDT" || quoteAsset === "USD" || quoteAsset === "USDC") {
        return (
          krakenQuotes[`${baseKraken}/USD`] ??
          krakenQuotes[`${baseKraken}/USDC`] ??
          krakenQuotes[`${baseAsset}/USD`] ??
          krakenQuotes[`${baseAsset}/USDC`] ??
          null
        );
      }

      return null;
    },
    [krakenQuotes]
  );

  return {
    coinbaseQuotes,
    krakenQuotes,
    coinbaseConnected,
    krakenConnected,
    getCoinbaseQuote,
    getKrakenQuote,
  };
}
