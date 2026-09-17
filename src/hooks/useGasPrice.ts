/**
 * useGasPrice Hook - Shaggy Dogg DEX
 *
 * React hook for fetching gas price estimates using the Vercel Edge Function
 *
 * Features:
 * - Multi-chain support (Ethereum, Base, Arbitrum, Optimism, Polygon, Sepolia)
 * - EIP-1559 support (baseFee + priorityFee)
 * - USD cost estimates for common operations
 * - Automatic polling with configurable interval
 * - CDN caching via Edge Function
 *
 * @example
 * const { prices, estimatedCosts, loading } = useGasPrice(1) // Ethereum mainnet
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface GasPrice {
  maxFee: string; // in Gwei
  maxPriorityFee?: string; // in Gwei (EIP-1559)
  gasPrice?: string; // in Gwei (legacy)
}

export interface CostEstimate {
  eth: string;
  usd: string;
}

export interface GasEstimate {
  chainId: number;
  chainName: string;
  timestamp: number;
  blockNumber?: number;
  prices: {
    slow: GasPrice;
    standard: GasPrice;
    fast: GasPrice;
  };
  baseFee?: string; // in Gwei (EIP-1559)
  priorityFee?: string; // in Gwei
  estimatedCosts?: {
    transfer: CostEstimate; // 21k gas
    swap: CostEstimate; // 150k gas
  };
}

export interface UseGasPriceOptions {
  /**
   * Auto-refresh interval in milliseconds
   * Set to 0 to disable auto-refresh
   * @default 10000 (10 seconds, matches Edge Function cache)
   */
  refreshInterval?: number;

  /**
   * Enable auto-refresh
   * @default true
   */
  enabled?: boolean;

  /**
   * Gas speed preference
   * @default 'standard'
   */
  speed?: "slow" | "standard" | "fast";
}

export interface UseGasPriceReturn {
  /** Full gas estimate data */
  data: GasEstimate | null;

  /** Gas prices by speed */
  prices: GasEstimate["prices"] | null;

  /** Selected gas price based on speed preference */
  selectedPrice: GasPrice | null;

  /** Estimated costs for common operations */
  estimatedCosts: GasEstimate["estimatedCosts"] | null;

  /** Base fee (EIP-1559) */
  baseFee: string | null;

  /** Priority fee (EIP-1559) */
  priorityFee: string | null;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Manually refresh gas prices */
  refresh: () => Promise<void>;

  /** Last update timestamp */
  lastUpdate: number | null;
}

/**
 * Supported chain IDs
 */
export const SUPPORTED_CHAINS = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
  11155111: "Sepolia",
} as const;

export type SupportedChainId = keyof typeof SUPPORTED_CHAINS;

/**
 * Fetch gas estimates from Vercel Edge Function
 */
export function useGasPrice(
  chainId: SupportedChainId,
  options: UseGasPriceOptions = {}
): UseGasPriceReturn {
  const {
    refreshInterval = 10000, // 10s (matches Edge Function cache)
    enabled = true,
    speed = "standard",
  } = options;

  const [data, setData] = useState<GasEstimate | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Validate chain ID
   */
  const isValidChain = chainId in SUPPORTED_CHAINS;

  /**
   * Fetch gas prices
   */
  const fetchGasPrice = useCallback(async (): Promise<void> => {
    if (!isValidChain || !enabled) {
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
      const url = `/api/gas/${chainId}`;

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const gasData: GasEstimate = await response.json();

      setData(gasData);
      setLastUpdate(Date.now());
      setError(null);
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const error = err instanceof Error ? err : new Error("Failed to fetch gas prices");
      setError(error);
      console.error("[useGasPrice] Error:", error);
    } finally {
      setLoading(false);
    }
  }, [chainId, enabled, isValidChain]);

  /**
   * Initial fetch on mount and when dependencies change
   */
  useEffect(() => {
    if (!enabled || !isValidChain) {
      setLoading(false);
      if (!isValidChain) {
        setError(
          new Error(
            `Unsupported chain ID: ${chainId}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`
          )
        );
      }
      return;
    }

    fetchGasPrice();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchGasPrice, enabled, isValidChain, chainId]);

  /**
   * Auto-refresh interval
   */
  useEffect(() => {
    if (!enabled || refreshInterval <= 0 || !isValidChain) {
      return;
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      fetchGasPrice();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchGasPrice, refreshInterval, enabled, isValidChain]);

  // Get selected price based on speed preference
  const selectedPrice = data?.prices[speed] ?? null;

  return {
    data,
    prices: data?.prices ?? null,
    selectedPrice,
    estimatedCosts: data?.estimatedCosts ?? null,
    baseFee: data?.baseFee ?? null,
    priorityFee: data?.priorityFee ?? null,
    loading,
    error,
    refresh: fetchGasPrice,
    lastUpdate,
  };
}

/**
 * Hook for formatting gas prices
 */
export function useFormattedGasPrice(
  chainId: SupportedChainId,
  speed: "slow" | "standard" | "fast" = "standard"
) {
  const { selectedPrice, estimatedCosts, loading, error } = useGasPrice(chainId, { speed });

  const formatted = {
    /** Gas price in Gwei */
    gwei: selectedPrice?.maxFee ?? selectedPrice?.gasPrice ?? null,

    /** Transfer cost in ETH */
    transferEth: estimatedCosts?.transfer.eth ?? null,

    /** Transfer cost in USD */
    transferUsd: estimatedCosts?.transfer.usd ?? null,

    /** Swap cost in ETH */
    swapEth: estimatedCosts?.swap.eth ?? null,

    /** Swap cost in USD */
    swapUsd: estimatedCosts?.swap.usd ?? null,

    /** Human-readable gas price */
    display: selectedPrice ? `${selectedPrice.maxFee ?? selectedPrice.gasPrice} Gwei` : null,

    loading,
    error,
  };

  return formatted;
}

/**
 * Hook for comparing gas prices across multiple chains
 */
export function useMultiChainGasPrices(
  chainIds: SupportedChainId[],
  options: UseGasPriceOptions = {}
): Record<number, UseGasPriceReturn> {
  const { refreshInterval = 10000, enabled = true, speed = "standard" } = options;

  const [prices, setPrices] = useState<Record<number, UseGasPriceReturn>>({});

  useEffect(() => {
    if (!enabled || chainIds.length === 0) {
      return;
    }

    const fetchGasPrice = async (chainId: number): Promise<UseGasPriceReturn> => {
      const url = `/api/gas/${chainId}?speed=${speed}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: GasEstimate = await response.json();

      return {
        data,
        prices: data.prices,
        selectedPrice: data.prices[speed],
        estimatedCosts: data.estimatedCosts ?? null,
        baseFee: data.baseFee ?? null,
        priorityFee: data.priorityFee ?? null,
        loading: false,
        error: null,
        refresh: async () => {},
        lastUpdate: Date.now(),
      };
    };

    const fetchAllGasPrices = async () => {
      const results: Record<number, UseGasPriceReturn> = {};

      await Promise.allSettled(
        chainIds.map(async (chainId) => {
          try {
            const base = await fetchGasPrice(chainId);
            results[chainId] = {
              ...base,
              refresh: async () => {
                try {
                  const refreshed = await fetchGasPrice(chainId);
                  setPrices((prev) => ({ ...prev, [chainId]: refreshed }));
                } catch (err) {
                  const error =
                    err instanceof Error ? err : new Error("Failed to fetch gas prices");
                  setPrices((prev) => ({
                    ...prev,
                    [chainId]: {
                      data: null,
                      prices: null,
                      selectedPrice: null,
                      estimatedCosts: null,
                      baseFee: null,
                      priorityFee: null,
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
            const error = err instanceof Error ? err : new Error("Failed to fetch gas prices");
            results[chainId] = {
              data: null,
              prices: null,
              selectedPrice: null,
              estimatedCosts: null,
              baseFee: null,
              priorityFee: null,
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

    fetchAllGasPrices();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchAllGasPrices, refreshInterval);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [chainIds, speed, refreshInterval, enabled]);

  return prices;
}
