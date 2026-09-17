/**
 * useTokenPrice Hook - Shaggy Dogg DEX
 *
 * React hook for fetching token prices using the Vercel Edge Function
 *
 * Features:
 * - Automatic polling with configurable interval
 * - Multi-currency support (USD, EUR, GBP, JPY, CNY, BTC, ETH)
 * - 24h price change percentage
 * - CDN caching via Edge Function
 * - Error handling with retry
 *
 * @example
 * const { price, change24h, loading, error } = useTokenPrice('ETH', 'usd')
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface TokenPriceData {
  symbol: string;
  price: number;
  currency: string;
  timestamp: number;
  change24h?: number;
  source: "coingecko" | "fallback" | "cache";
}

export interface UseTokenPriceOptions {
  /**
   * Currency to fetch price in
   * Supported: usd, eur, gbp, jpy, cny, btc, eth
   * @default 'usd'
   */
  currency?: "usd" | "eur" | "gbp" | "jpy" | "cny" | "btc" | "eth";

  /**
   * Auto-refresh interval in milliseconds
   * Set to 0 to disable auto-refresh
   * @default 60000 (60 seconds, matches CDN cache)
   */
  refreshInterval?: number;

  /**
   * Enable auto-refresh
   * @default true
   */
  enabled?: boolean;
}

export interface UseTokenPriceReturn {
  /** Current price data */
  data: TokenPriceData | null;

  /** Current price value */
  price: number | null;

  /** 24h price change percentage */
  change24h: number | null;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Manually refresh price */
  refresh: () => Promise<void>;

  /** Last update timestamp */
  lastUpdate: number | null;
}

/**
 * Fetch token price from Vercel Edge Function
 */
export function useTokenPrice(
  symbol: string,
  options: UseTokenPriceOptions = {}
): UseTokenPriceReturn {
  const {
    currency = "usd",
    refreshInterval = 60000, // 60s (matches Edge Function cache)
    enabled = true,
  } = options;

  const [data, setData] = useState<TokenPriceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch price data
   */
  const fetchPrice = useCallback(async (): Promise<void> => {
    if (!symbol || !enabled) {
      setLoading(false);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const url = `/api/price/${encodeURIComponent(symbol.toUpperCase())}?currency=${currency}`;

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const priceData: TokenPriceData = await response.json();

      setData(priceData);
      setLastUpdate(Date.now());
      setError(null);
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const error = err instanceof Error ? err : new Error("Failed to fetch price");
      setError(error);
      console.error("[useTokenPrice] Error:", error);
    } finally {
      setLoading(false);
    }
  }, [symbol, currency, enabled]);

  /**
   * Initial fetch on mount and when dependencies change
   */
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    fetchPrice();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPrice, enabled]);

  /**
   * Auto-refresh interval
   */
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) {
      return;
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      fetchPrice();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPrice, refreshInterval, enabled]);

  return {
    data,
    price: data?.price ?? null,
    change24h: data?.change24h ?? null,
    loading,
    error,
    refresh: fetchPrice,
    lastUpdate,
  };
}

/**
 * Hook for fetching multiple token prices
 * More efficient than calling useTokenPrice multiple times
 */
export function useTokenPrices(
  symbols: string[],
  options: UseTokenPriceOptions = {}
): Record<string, UseTokenPriceReturn> {
  const { currency = "usd", refreshInterval = 60000, enabled = true } = options;

  const [prices, setPrices] = useState<Record<string, UseTokenPriceReturn>>({});

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      return;
    }

    const fetchPrice = async (symbol: string): Promise<UseTokenPriceReturn> => {
      const url = `/api/price/${encodeURIComponent(symbol.toUpperCase())}?currency=${currency}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: TokenPriceData = await response.json();

      return {
        data,
        price: data.price,
        change24h: data.change24h ?? null,
        loading: false,
        error: null,
        refresh: async () => {},
        lastUpdate: Date.now(),
      };
    };

    const fetchAllPrices = async () => {
      const results: Record<string, UseTokenPriceReturn> = {};

      await Promise.allSettled(
        symbols.map(async (symbol) => {
          try {
            const base = await fetchPrice(symbol);
            results[symbol] = {
              ...base,
              refresh: async () => {
                try {
                  const refreshed = await fetchPrice(symbol);
                  setPrices((prev) => ({ ...prev, [symbol]: refreshed }));
                } catch (err) {
                  const error = err instanceof Error ? err : new Error("Failed to fetch price");
                  setPrices((prev) => ({
                    ...prev,
                    [symbol]: {
                      data: null,
                      price: null,
                      change24h: null,
                      loading: false,
                      error,
                      refresh: async () => {},
                      lastUpdate: null,
                    },
                  }));
                }
              },
            };
          } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to fetch price");
            results[symbol] = {
              data: null,
              price: null,
              change24h: null,
              loading: false,
              error,
              refresh: async () => {},
              lastUpdate: null,
            };
          }
        })
      );

      setPrices(results);
    };

    fetchAllPrices();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchAllPrices, refreshInterval);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [symbols, currency, refreshInterval, enabled]);

  return prices;
}
