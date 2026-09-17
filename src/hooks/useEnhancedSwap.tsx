// src/hooks/useEnhancedSwap.tsx - Enhanced swap with price impact, multi-hop routing
import { useMemo } from "react";

import { type Address } from "viem";
import { useReadContract } from "wagmi";

import { UNISWAP_V2_PAIR_ABI } from "@/config/abis";
import { WRAPPED_NATIVE_ADDRESS } from "@/config/tokens";

import { useSwap, type UseSwapReturn } from "./useSwap";

import type { Token } from "@/config/tokens";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface PriceImpactData {
  readonly impact: number; // percentage (0-100)
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly warning?: string;
}

interface RouteInfo {
  readonly path: readonly Address[];
  readonly pathSymbols: readonly string[];
  readonly estimatedOutput: bigint;
  readonly priceImpact: PriceImpactData;
}

export interface EnhancedSwapReturn extends UseSwapReturn {
  readonly priceImpact: PriceImpactData | null;
  readonly bestRoute: RouteInfo | null;
  readonly alternativeRoutes: readonly RouteInfo[];
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const PRICE_IMPACT_THRESHOLDS = {
  LOW: 1, // < 1%
  MEDIUM: 3, // 1-3%
  HIGH: 5, // 3-5%
  CRITICAL: 5, // > 5%
} as const;

const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address;
const FACTORY_ABI = [
  {
    constant: true,
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    name: "getPair",
    outputs: [{ name: "pair", type: "address" }],
    type: "function",
  },
] as const;

// Common routing tokens for multi-hop
const ROUTING_TOKENS = {
  WETH: WRAPPED_NATIVE_ADDRESS,
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
} as const;

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function isNative(address: Address | "native"): address is "native" {
  return address === "native";
}

function resolveAddress(token: Token): Address {
  return isNative(token.address) ? WRAPPED_NATIVE_ADDRESS : token.address;
}

/**
 * Calculate price impact based on reserves
 * Formula: impact = ((reserveIn * amountOut) / (reserveOut * amountIn) - 1) * 100
 */
function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): PriceImpactData {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) {
    return { impact: 0, severity: "low" };
  }

  // Expected output with no slippage
  const expectedOut = (reserveOut * amountIn) / (reserveIn + amountIn);

  // Price impact calculation
  const impactBigInt = expectedOut > 0n ? ((expectedOut - amountOut) * 10000n) / expectedOut : 0n;

  const impact = Number(impactBigInt) / 100; // Convert to percentage

  let severity: PriceImpactData["severity"];
  let warning: string | undefined;

  if (impact < PRICE_IMPACT_THRESHOLDS.LOW) {
    severity = "low";
  } else if (impact < PRICE_IMPACT_THRESHOLDS.MEDIUM) {
    severity = "medium";
    warning = "Moderate price impact. Consider splitting your trade.";
  } else if (impact < PRICE_IMPACT_THRESHOLDS.HIGH) {
    severity = "high";
    warning = "High price impact! You may receive significantly less than expected.";
  } else {
    severity = "critical";
    warning =
      "CRITICAL price impact! This trade will lose significant value. Consider a different route.";
  }

  const result: PriceImpactData = { impact, severity };
  if (warning) {
    return { ...result, warning };
  }
  return result;
}

/**
 * Generate potential routing paths
 */
function generateRoutingPaths(tokenIn: Token, tokenOut: Token): ReadonlyArray<readonly Address[]> {
  const addressIn = resolveAddress(tokenIn);
  const addressOut = resolveAddress(tokenOut);

  // Direct path
  const directPath = [addressIn, addressOut] as const;

  // Multi-hop paths through common routing tokens
  const multiHopPaths: Array<readonly Address[]> = [];

  Object.values(ROUTING_TOKENS).forEach((routingToken) => {
    // Skip if routing token is same as input or output
    if (routingToken === addressIn || routingToken === addressOut) return;

    // Path: tokenIn -> routingToken -> tokenOut
    multiHopPaths.push([addressIn, routingToken, addressOut] as const);
  });

  return [directPath, ...multiHopPaths];
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════════════════════

export function useEnhancedSwap(
  initialSellToken: Token,
  initialBuyToken: Token
): EnhancedSwapReturn {
  // Get base swap functionality
  const baseSwap = useSwap(initialSellToken, initialBuyToken);
  const { state } = baseSwap;

  // ────────────────────────────────────────────────────────────────────────────
  // Get pair address for price impact calculation
  // ────────────────────────────────────────────────────────────────────────────

  const { data: pairAddress } = useReadContract({
    address: UNISWAP_V2_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [resolveAddress(state.sellToken), resolveAddress(state.buyToken)],
  });

  const poolExists = pairAddress && pairAddress !== "0x0000000000000000000000000000000000000000";

  // ────────────────────────────────────────────────────────────────────────────
  // Get reserves for price impact
  // ────────────────────────────────────────────────────────────────────────────

  const { data: reservesData } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "getReserves",
    query: {
      enabled: !!poolExists,
      refetchInterval: 10_000,
    },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Calculate price impact
  // ────────────────────────────────────────────────────────────────────────────

  const priceImpact = useMemo<PriceImpactData | null>(() => {
    if (!state.sellAmount || !state.buyAmount || !reservesData || !poolExists) {
      return null;
    }

    const [reserve0, reserve1] = reservesData as readonly [bigint, bigint, number];

    // Determine which reserve is which based on token addresses
    const token0 = resolveAddress(state.sellToken);
    const token1 = resolveAddress(state.buyToken);
    const isToken0Lower = BigInt(token0) < BigInt(token1);

    const reserveIn = isToken0Lower ? reserve0 : reserve1;
    const reserveOut = isToken0Lower ? reserve1 : reserve0;

    // Parse amounts
    const amountIn = BigInt(
      Math.floor(parseFloat(state.sellAmount) * 10 ** state.sellToken.decimals)
    );
    const amountOut = BigInt(
      Math.floor(parseFloat(state.buyAmount) * 10 ** state.buyToken.decimals)
    );

    return calculatePriceImpact(amountIn, amountOut, reserveIn, reserveOut);
  }, [
    state.sellAmount,
    state.buyAmount,
    state.sellToken,
    state.buyToken,
    reservesData,
    poolExists,
  ]);

  // ────────────────────────────────────────────────────────────────────────────
  // Multi-hop routing (experimental - requires more contract reads)
  // ────────────────────────────────────────────────────────────────────────────

  const routingPaths = useMemo(() => {
    return generateRoutingPaths(state.sellToken, state.buyToken);
  }, [state.sellToken, state.buyToken]);

  // For now, just return the direct path as best route
  const bestRoute = useMemo<RouteInfo | null>(() => {
    if (!state.sellAmount || !state.buyAmount || routingPaths.length === 0) {
      return null;
    }

    const directPath = routingPaths[0];
    if (!directPath) {
      return null;
    }

    const amountOut = BigInt(
      Math.floor(parseFloat(state.buyAmount) * 10 ** state.buyToken.decimals)
    );

    return {
      path: directPath,
      pathSymbols: [state.sellToken.symbol, state.buyToken.symbol],
      estimatedOutput: amountOut,
      priceImpact: priceImpact || { impact: 0, severity: "low" },
    };
  }, [
    state.sellAmount,
    state.buyAmount,
    state.sellToken,
    state.buyToken,
    routingPaths,
    priceImpact,
  ]);

  // ────────────────────────────────────────────────────────────────────────────
  // Return enhanced swap data
  // ────────────────────────────────────────────────────────────────────────────

  return {
    ...baseSwap,
    priceImpact,
    bestRoute,
    alternativeRoutes: [], // TODO: Implement multi-hop route comparison
  };
}
