import { useCallback, useEffect, useState } from "react";

import MARKET_PAIRS from "@/config/market-pairs.json";

export interface MatrixCexPrice {
  bid: number;
  ask: number;
  ts: number;
}

// Every market pair is already "BASE/USDT" -- exactly what Binance, Bybit, and OKX spot-quote
// in, so their subscription lists are derived straight from the matrix instead of hand-curated.
const USDT_BASE_ASSETS = Array.from(
  new Set(
    (MARKET_PAIRS as string[])
      .map((symbol) => symbol.split("/"))
      .filter(([, quote]) => quote === "USDT")
      .map(([base]) => base)
  )
);
const BINANCE_SYMBOLS = USDT_BASE_ASSETS.map((base) => `${base}USDT`.toLowerCase());
const BYBIT_SYMBOLS = USDT_BASE_ASSETS.map((base) => `${base}USDT`);
const OKX_INST_IDS = USDT_BASE_ASSETS.map((base) => `${base}-USDT`);

/** Splits an array into fixed-size batches (exchange subscribe calls cap how many topics fit). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
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
  const [binanceQuotes, setBinanceQuotes] = useState<Record<string, MatrixCexPrice>>({});
  const [bybitQuotes, setBybitQuotes] = useState<Record<string, MatrixCexPrice>>({});
  const [okxQuotes, setOkxQuotes] = useState<Record<string, MatrixCexPrice>>({});
  const [coinbaseConnected, setCoinbaseConnected] = useState(false);
  const [krakenConnected, setKrakenConnected] = useState(false);
  const [binanceConnected, setBinanceConnected] = useState(false);
  const [bybitConnected, setBybitConnected] = useState(false);
  const [okxConnected, setOkxConnected] = useState(false);

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

  // ───────────────────────────── Binance WebSocket ─────────────────────────────
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connectBinance = () => {
      try {
        ws = new WebSocket("wss://stream.binance.com:9443/ws");

        ws.onopen = () => {
          if (disposed) return;
          attempt = 0;
          setBinanceConnected(true);
          chunk(BINANCE_SYMBOLS, 100).forEach((batch, i) => {
            ws?.send(
              JSON.stringify({
                method: "SUBSCRIBE",
                params: batch.map((s) => `${s}@bookTicker`),
                id: i + 1,
              })
            );
          });
        };

        ws.onmessage = (e: MessageEvent<string>) => {
          if (disposed) return;
          try {
            const m = JSON.parse(e.data);
            if (m.s && m.b && m.a) {
              const bid = Number(m.b);
              const ask = Number(m.a);
              if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
                const now = Date.now();
                const base = String(m.s).replace(/USDT$/, "");
                setBinanceQuotes((prev) => ({
                  ...prev,
                  [`${base}/USDT`]: { bid, ask, ts: now },
                }));
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setBinanceConnected(false);
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          retryTimer = setTimeout(connectBinance, delay);
        };

        ws.onerror = () => ws?.close();
      } catch {
        if (!disposed) {
          retryTimer = setTimeout(connectBinance, 3000);
        }
      }
    };

    connectBinance();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // ───────────────────────────── Bybit WebSocket ─────────────────────────────
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;

    const connectBybit = () => {
      try {
        ws = new WebSocket("wss://stream.bybit.com/v5/public/spot");

        ws.onopen = () => {
          if (disposed) return;
          attempt = 0;
          setBybitConnected(true);
          // Bybit's spot "tickers" topic carries lastPrice/24h stats but no bid/ask; depth-1
          // order book is the lightweight channel that actually has best bid/ask.
          chunk(BYBIT_SYMBOLS, 10).forEach((batch) => {
            ws?.send(
              JSON.stringify({ op: "subscribe", args: batch.map((s) => `orderbook.1.${s}`) })
            );
          });
          pingTimer = setInterval(() => ws?.send(JSON.stringify({ op: "ping" })), 20_000);
        };

        ws.onmessage = (e: MessageEvent<string>) => {
          if (disposed) return;
          try {
            const m = JSON.parse(e.data);
            const topic = typeof m.topic === "string" ? m.topic : undefined;
            if (topic?.startsWith("orderbook.1.") && m.data?.s) {
              const bid = Number(m.data.b?.[0]?.[0]);
              const ask = Number(m.data.a?.[0]?.[0]);
              if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
                const base = String(m.data.s).replace(/USDT$/, "");
                const now = Date.now();
                setBybitQuotes((prev) => ({ ...prev, [`${base}/USDT`]: { bid, ask, ts: now } }));
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setBybitConnected(false);
          clearInterval(pingTimer);
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          retryTimer = setTimeout(connectBybit, delay);
        };

        ws.onerror = () => ws?.close();
      } catch {
        if (!disposed) {
          retryTimer = setTimeout(connectBybit, 3000);
        }
      }
    };

    connectBybit();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, []);

  // ───────────────────────────── OKX WebSocket ─────────────────────────────
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;

    const connectOkx = () => {
      try {
        ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");

        ws.onopen = () => {
          if (disposed) return;
          attempt = 0;
          setOkxConnected(true);
          chunk(OKX_INST_IDS, 50).forEach((batch) => {
            ws?.send(
              JSON.stringify({
                op: "subscribe",
                args: batch.map((instId) => ({ channel: "tickers", instId })),
              })
            );
          });
          pingTimer = setInterval(() => ws?.send("ping"), 20_000);
        };

        ws.onmessage = (e: MessageEvent<string>) => {
          if (disposed) return;
          if (e.data === "pong") return;
          try {
            const m = JSON.parse(e.data);
            const row = Array.isArray(m.data) ? m.data[0] : undefined;
            if (m.arg?.channel === "tickers" && row?.instId && row.bidPx && row.askPx) {
              const bid = Number(row.bidPx);
              const ask = Number(row.askPx);
              if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
                const now = Date.now();
                const key = String(row.instId).replace("-", "/");
                setOkxQuotes((prev) => ({ ...prev, [key]: { bid, ask, ts: now } }));
              }
            }
          } catch {
            // Ignore parse errors (including the literal "pong" keepalive reply)
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setOkxConnected(false);
          clearInterval(pingTimer);
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          retryTimer = setTimeout(connectOkx, delay);
        };

        ws.onerror = () => ws?.close();
      } catch {
        if (!disposed) {
          retryTimer = setTimeout(connectOkx, 3000);
        }
      }
    };

    connectOkx();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
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

  // Binance, Bybit, and OKX all store under the matrix's own "BASE/USDT" key already, since
  // every subscribed symbol was derived from (and normalized back to) that exact format.
  const usdtQuote = (quotes: Record<string, MatrixCexPrice>, symbol: string) => {
    if (quotes[symbol]) return quotes[symbol];
    const [baseAsset, quoteAsset] = symbol.split("/");
    if (!baseAsset) return null;
    if (quoteAsset === "USDT" || quoteAsset === "USD" || quoteAsset === "USDC") {
      return quotes[`${baseAsset}/USDT`] ?? null;
    }
    return null;
  };

  const getBinanceQuote = useCallback(
    (symbol: string): MatrixCexPrice | null => usdtQuote(binanceQuotes, symbol),
    [binanceQuotes]
  );
  const getBybitQuote = useCallback(
    (symbol: string): MatrixCexPrice | null => usdtQuote(bybitQuotes, symbol),
    [bybitQuotes]
  );
  const getOkxQuote = useCallback(
    (symbol: string): MatrixCexPrice | null => usdtQuote(okxQuotes, symbol),
    [okxQuotes]
  );

  return {
    coinbaseQuotes,
    krakenQuotes,
    binanceQuotes,
    bybitQuotes,
    okxQuotes,
    coinbaseConnected,
    krakenConnected,
    binanceConnected,
    bybitConnected,
    okxConnected,
    getCoinbaseQuote,
    getKrakenQuote,
    getBinanceQuote,
    getBybitQuote,
    getOkxQuote,
  };
}
