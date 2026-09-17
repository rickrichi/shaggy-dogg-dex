// src/components/swap/PriceChart.tsx
import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Helper to format data for TradingView
// Binance returns [time, open, high, low, close, volume, ...]
interface BinanceKline {
  0: number; // Open time
  1: string; // Open
  2: string; // High
  3: string; // Low
  4: string; // Close
  5: string; // Volume
}

const formatData = (bins: BinanceKline[]) => {
  return bins.map((bin) => ({
    time: (bin[0] / 1000) as Time,
    open: parseFloat(bin[1]),
    high: parseFloat(bin[2]),
    low: parseFloat(bin[3]),
    close: parseFloat(bin[4]),
  }));
};

interface PriceChartProps {
  baseSymbol?: string;
  quoteSymbol?: string;
}

export const PriceChart = ({ baseSymbol = "ETH", quoteSymbol = "USDT" }: PriceChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [interval, setInterval] = useState<"1h" | "1d" | "1w">("1d");

  // Normalize symbol for Binance compatibility and build endpoints with fallbacks
  const normalizedPair =
    `${baseSymbol === "WETH" ? "ETH" : baseSymbol}${quoteSymbol}`.toUpperCase();
  const dataSources = [
    import.meta.env.VITE_BINANCE_PROXY_URL?.replace(/\/$/, ""),
    import.meta.env.DEV ? "/proxy/binance" : "https://api.binance.com",
    "https://data-api.binance.vision",
  ].filter(Boolean) as string[];

  // 1. Fetch Data with React Query (handles retries + background refresh)
  const {
    data: candleData = [],
    isError,
    isFetching,
    refetch,
  } = useQuery<Array<{ time: Time; open: number; high: number; low: number; close: number }>>({
    queryKey: ["price-chart", normalizedPair, interval],
    queryFn: async ({ signal }) => {
      let lastError: unknown;
      for (const baseUrl of dataSources) {
        const url = `${baseUrl}/api/v3/klines?symbol=${normalizedPair}&interval=${interval}&limit=100`;
        try {
          const res = await fetch(url, {
            signal,
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as BinanceKline[];
          if (!Array.isArray(body) || body.length === 0) {
            throw new Error("Empty response");
          }
          return formatData(body);
        } catch (error) {
          lastError = error;
          if (signal?.aborted) break;
        }
      }
      console.error("Chart data fetch error:", lastError);
      throw lastError ?? new Error("Unable to load chart data");
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 55_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });
  const showError = isError && candleData.length === 0;
  const statusLabel = isError ? "Reconnecting…" : isFetching ? "Refreshing…" : "Live";

  // 2. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#334155", // slate-700
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: "rgba(197, 203, 206, 0.1)" },
        horzLines: { color: "rgba(197, 203, 206, 0.1)" },
      },
      rightPriceScale: {
        borderColor: "rgba(197, 203, 206, 0.4)",
      },
      timeScale: {
        borderColor: "rgba(197, 203, 206, 0.4)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", // green-500
      downColor: "#ef4444", // red-500
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 3. Update Data
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candleData);
  }, [candleData]);

  if (showError) {
    return (
      <Card className="flex h-full flex-col border-slate-200/50 bg-white/50 shadow-sm backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg">Price Chart</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-[400px] flex-1 items-center justify-center bg-gradient-to-b from-transparent to-slate-50/50">
          <div className="space-y-2 text-center text-slate-400">
            <TrendingUp className="mx-auto size-12 opacity-50" />
            <p>
              Chart data unavailable for {baseSymbol}/{quoteSymbol}
            </p>
            <p className="text-xs">This pair may not be available on Binance</p>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col border-slate-200/50 bg-white/50 shadow-sm backdrop-blur-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {/* Token Icons */}
              <div className="flex size-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white ring-2 ring-white">
                {baseSymbol?.[0] ?? "A"}
              </div>
              <div className="flex size-8 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white ring-2 ring-white">
                {quoteSymbol?.[0] ?? "B"}
              </div>
            </div>
            <div>
              <CardTitle className="text-lg">
                {baseSymbol} / {quoteSymbol}
              </CardTitle>
              <p className="text-sm text-slate-500">Price Chart</p>
            </div>
          </div>

          {/* Time Interval Selector */}
          <div className="flex items-center gap-2 text-sm">
            <div className="text-xs text-slate-500">{statusLabel}</div>
            <div className="flex gap-2">
              <Button
                variant={interval === "1h" ? "default" : "ghost"}
                size="sm"
                onClick={() => setInterval("1h")}
                className={interval === "1h" ? "bg-slate-800 text-white" : "text-slate-600"}
              >
                1H
              </Button>
              <Button
                variant={interval === "1d" ? "default" : "ghost"}
                size="sm"
                onClick={() => setInterval("1d")}
                className={interval === "1d" ? "bg-slate-800 text-white" : "text-slate-600"}
              >
                1D
              </Button>
              <Button
                variant={interval === "1w" ? "default" : "ghost"}
                size="sm"
                onClick={() => setInterval("1w")}
                className={interval === "1w" ? "bg-slate-800 text-white" : "text-slate-600"}
              >
                1W
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-slate-600"
              >
                Sync
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 bg-gradient-to-b from-transparent to-slate-50/50 pb-2 pt-4">
        <div className="relative min-h-[400px] w-full">
          <div ref={chartContainerRef} className="w-full" />
          {isFetching && candleData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Loading price data…
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
