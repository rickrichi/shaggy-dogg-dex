/* eslint-disable no-empty-pattern */
// src/hooks/usePortfolioDebug.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address, formatUnits } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

/* ============ Types ============ */
export interface Token {
  key: string;
  symbol: string;
  name: string;
  address: Address | "0x0000000000000000000000000000000000000000";
  decimals: number;
  chainId: number;
  balance: string;
  balanceFormatted: string;
  usdValue: number;
  priceUsd: number;
  logo?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalTokens: number;
  topChain: string;
  biggestHolding: Token | null;
  percentChange24h: number;
}

export interface UsePortfolioReturn {
  tokens: Token[];
  summary: PortfolioSummary;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/* ============ Debug Hook ============ */
export function usePortfolioDebug(): UsePortfolioReturn {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  // Debug the enabled condition
  const isQueryEnabled = useMemo(() => {
    const enabled = Boolean(isConnected && address && publicClient && Number.isFinite(chainId));
    console.log('🔍 Query Debug:', { 
      enabled, 
      isConnected, 
      address, 
      publicClient: !!publicClient, 
      chainId,
      chainIdValid: Number.isFinite(chainId)
    });
    return enabled;
  }, [isConnected, address, publicClient, chainId]);

  const { data, isLoading, error, refetch } = useQuery<{
    tokens: Token[];
    summary: PortfolioSummary;
  }>({
    queryKey: ["portfolio-debug", address, chainId],
    enabled: isQueryEnabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1000,
    queryFn: async ({ }) => {
      console.log('🚀 Portfolio Query Starting...');
      
      if (!address || !publicClient || !Number.isFinite(chainId)) {
        throw new Error("Wallet/network not ready");
      }

      try {
        // Step 1: Get native balance (simple test)
        console.log('⏳ Step 1: Getting native balance...');
        const nativeBal = await Promise.race([
          publicClient.getBalance({ address }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Native balance timeout')), 10000)
          )
        ]);
        console.log('✅ Native balance:', formatUnits(nativeBal, 18));

        // Step 2: Test API call
        console.log('⏳ Step 2: Testing API prices...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`/api/prices?chainId=${chainId}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const text = await res.text();
          console.error('❌ API Error:', res.status, text);
          throw new Error(`API prices failed: ${res.status}`);
        }

        const priceData = await res.json();
        console.log('✅ API Response:', priceData);

        // Step 3: Get chain info
        const nativeMeta = getNativeMeta(chainId);
        console.log('✅ Native meta:', nativeMeta);

        // Step 4: Build minimal token array
        const natFormatted = formatUnits(nativeBal, 18);
        const natPrice = priceData.native?.usd ?? 0;

        const tokens: Token[] = [{
          key: `native:${chainId}`,
          symbol: nativeMeta.symbol,
          name: nativeMeta.name,
          address: "0x0000000000000000000000000000000000000000",
          decimals: 18,
          chainId,
          balance: nativeBal.toString(),
          balanceFormatted: natFormatted,
          usdValue: natPrice * Number(natFormatted),
          priceUsd: natPrice,
        }];

        const summary: PortfolioSummary = {
          totalValue: natPrice * Number(natFormatted),
          totalTokens: 1,
          topChain: getChainName(chainId),
          biggestHolding: tokens[0] ?? null,
          percentChange24h: priceData.native?.usd_24h_change ?? 0,
        };

        console.log('🎉 Portfolio Query Success!', { tokens: tokens.length, totalValue: summary.totalValue });
        
        return { tokens, summary };

      } catch (queryError) {
        console.error('💥 Portfolio Query Error:', queryError);
        throw queryError;
      }
    },
  });

  const fallbackSummary: PortfolioSummary = useMemo(() => ({
    totalValue: 0,
    totalTokens: 0,
    topChain: getChainName(chainId),
    biggestHolding: null,
    percentChange24h: 0,
  }), [chainId]);

  // Debug the current state
  console.log('📊 Portfolio Hook State:', { 
    isLoading, 
    hasData: !!data, 
    tokenCount: data?.tokens?.length ?? 0,
    error: error?.message 
  });

  return {
    tokens: data?.tokens ?? [],
    summary: data?.summary ?? fallbackSummary,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    refetch,
  };
}

// Helper functions
function getNativeMeta(chainId: number): { symbol: string; decimals: number; name: string } {
  switch (chainId) {
    case 1: return { symbol: "ETH", decimals: 18, name: "Ethereum" };
    case 137: return { symbol: "MATIC", decimals: 18, name: "Polygon" };
    case 10: return { symbol: "ETH", decimals: 18, name: "Optimism" };
    case 42161: return { symbol: "ETH", decimals: 18, name: "Arbitrum" };
    case 8453: return { symbol: "ETH", decimals: 18, name: "Base" };
    case 11155111: return { symbol: "ETH", decimals: 18, name: "Sepolia" };
    default: return { symbol: "ETH", decimals: 18, name: "Ethereum" };
  }
}

function getChainName(chainId: number): string {
  switch (chainId) {
    case 1: return "Ethereum";
    case 137: return "Polygon";
    case 10: return "Optimism";
    case 42161: return "Arbitrum";
    case 8453: return "Base";
    case 11155111: return "Sepolia";
    default: return "Unknown";
  }
}