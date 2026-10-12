import { createPublicClient, encodePacked, formatUnits } from "viem";
import { base } from "viem/chains";

import { UNISWAP_V2_ROUTER_ABI, UNISWAP_V3_QUOTER_V2_ABI } from "@/config/abis";
import { getUniswapV2Router, UNISWAP_V3_QUOTER_V2_BASE } from "@/config/contracts";
import { loadDexDeployment } from "@/config/dex/deployment";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { verifyDexDeployment } from "@/lib/amm/own-dex";
import { createBaseReadTransport } from "@/lib/base-rpc";

import type { Address } from "viem";
import type { Token } from "@/config/tokens";

export const MATRIX_QUOTE_MAX_AGE_MS = 30_000;
const wrapped = BASE_MAINNET_TOKENS.find((t) => t.symbol === "WETH")!;
const usdcToken = BASE_MAINNET_TOKENS.find((t) => t.symbol === "USDC")!;

/**
 * Standard CEX market symbol aliases mapped to Base mainnet on-chain equivalents:
 * - ETH -> WETH (Canonical Base Wrapped Ether)
 * - BTC -> cbBTC (Coinbase Wrapped BTC, canonical on Base; WBTC remains directly resolvable)
 * - USD -> USDC (Circle native USD Coin, canonical USD peg on Base)
 */
export const BASE_SYMBOL_ALIASES: Record<string, string> = {
  ETH: "WETH",
  BTC: "cbBTC",
  USD: "USDC",
};

export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

export function matrixRoute(symbol: string) {
  const [from, to] = symbol.split("/");
  if (!from || !to) return null;
  const resolve = (s: string) => {
    const aliased = BASE_SYMBOL_ALIASES[s] ?? s;
    return BASE_MAINNET_TOKENS.find((t) => t.symbol === aliased);
  };
  const sell = resolve(from);
  const buy = resolve(to);
  if (!sell || !buy || sell.address === buy.address) return null;
  const path: Address[] = [sell.address as Address];
  if (sell.address !== wrapped.address && buy.address !== wrapped.address)
    path.push(wrapped.address as Address);
  path.push(buy.address as Address);
  return {
    path,
    amountIn: 10n ** BigInt(sell.decimals),
    decimalsOut: buy.decimals,
    inputSymbol: sell.symbol,
    outputSymbol: buy.symbol,
    sell,
    buy,
  };
}

export interface MatrixDexQuote {
  status: "quoted" | "unavailable" | "rpc-error";
  output?: string;
  inputSymbol: string;
  outputSymbol: string;
  checkedAt: number;
  venueLabel?: string;
  feeTier?: string;
}

interface V3Candidate {
  symbol: string;
  inputSymbol: string;
  outputSymbol: string;
  decimalsOut: number;
  feeLabel: string;
  call: {
    address: Address;
    abi: typeof UNISWAP_V3_QUOTER_V2_ABI;
    functionName: "quoteExactInputSingle" | "quoteExactInput";
    args: readonly unknown[];
  };
}

function buildV3Candidates(
  routes: Array<NonNullable<ReturnType<typeof matrixRoute>> & { symbol: string }>
): V3Candidate[] {
  const candidates: V3Candidate[] = [];

  for (const route of routes) {
    const { symbol, sell, buy, amountIn, decimalsOut, inputSymbol, outputSymbol } = route;
    if (!sell || !buy) continue;

    // 1. Direct pool across all 4 standard concentrated fee tiers
    for (const fee of V3_FEE_TIERS) {
      candidates.push({
        symbol,
        inputSymbol,
        outputSymbol,
        decimalsOut,
        feeLabel: `${fee / 10000}%`,
        call: {
          address: UNISWAP_V3_QUOTER_V2_BASE,
          abi: UNISWAP_V3_QUOTER_V2_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: sell.address as Address,
              tokenOut: buy.address as Address,
              amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ] as const,
        },
      });
    }

    // 2. Multi-hop through WETH (if neither asset is WETH)
    if (sell.address !== wrapped.address && buy.address !== wrapped.address) {
      for (const f1 of [500, 3000] as const) {
        for (const f2 of [100, 500] as const) {
          const path = encodePacked(
            ["address", "uint24", "address", "uint24", "address"],
            [sell.address as Address, f1, wrapped.address as Address, f2, buy.address as Address]
          );
          candidates.push({
            symbol,
            inputSymbol,
            outputSymbol,
            decimalsOut,
            feeLabel: `WETH route (${f1 / 10000}%/${f2 / 10000}%)`,
            call: {
              address: UNISWAP_V3_QUOTER_V2_BASE,
              abi: UNISWAP_V3_QUOTER_V2_ABI,
              functionName: "quoteExactInput",
              args: [path, amountIn] as const,
            },
          });
        }
      }
    }

    // 3. Multi-hop through USDC (if neither asset is USDC and destination is USDT)
    if (usdcToken && sell.address !== usdcToken.address && buy.symbol === "USDT") {
      for (const f1 of [100, 500, 3000] as const) {
        const path = encodePacked(
          ["address", "uint24", "address", "uint24", "address"],
          [sell.address as Address, f1, usdcToken.address as Address, 100, buy.address as Address]
        );
        candidates.push({
          symbol,
          inputSymbol,
          outputSymbol,
          decimalsOut,
          feeLabel: `USDC route (${f1 / 10000}%/0.01%)`,
          call: {
            address: UNISWAP_V3_QUOTER_V2_BASE,
            abi: UNISWAP_V3_QUOTER_V2_ABI,
            functionName: "quoteExactInput",
            args: [path, amountIn] as const,
          },
        });
      }
    }
  }

  return candidates;
}

export async function fetchMatrixDexQuotes(
  symbols: readonly string[]
): Promise<Record<string, MatrixDexQuote>> {
  const routes = symbols.flatMap((symbol) => {
    const route = matrixRoute(symbol);
    return route ? [{ symbol, ...route }] : [];
  });
  if (!routes.length) return {};
  const client = createPublicClient({ chain: base, transport: createBaseReadTransport() });
  const checkedAt = Date.now();
  const deployment = loadDexDeployment();

  try {
    if (deployment) {
      await verifyDexDeployment(client, deployment);
      const results = await client.multicall({
        allowFailure: true,
        contracts: routes.map((route) => ({
          address: deployment.router ?? getUniswapV2Router(base.id),
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "getAmountsOut" as const,
          args: [route.amountIn, route.path] as const,
        })),
      });
      return Object.fromEntries(
        routes.map((route, i) => {
          const result = results[i];
          const output = result?.status === "success" ? result.result.at(-1) : undefined;
          return [
            route.symbol,
            {
              checkedAt,
              venueLabel: "Shaggy-Dogg-Dex pools · Base",
              inputSymbol: route.inputSymbol,
              outputSymbol: route.outputSymbol,
              ...(output && output > 0n
                ? { status: "quoted", output: formatUnits(output, route.decimalsOut) }
                : { status: "unavailable" }),
            },
          ];
        })
      );
    }

    // Uniswap V3 concentrated liquidity on Base
    const candidates = buildV3Candidates(routes);
    const results = await client.multicall({
      allowFailure: true,
      contracts: candidates.map((c) => c.call),
    });

    const bestQuotes = new Map<
      string,
      {
        amountOut: bigint;
        decimalsOut: number;
        inputSymbol: string;
        outputSymbol: string;
        feeLabel: string;
      }
    >();

    results.forEach((res, i) => {
      if (res.status === "success" && res.result) {
        const candidate = candidates[i];
        if (!candidate) return;

        // In Uniswap V3 QuoterV2, result[0] is amountOut (uint256)
        // If length is 2 (e.g. legacy/mock V2 array [amountIn, amountOut]), take result[1]
        const amountOut = Array.isArray(res.result)
          ? res.result.length === 2
            ? (res.result[1] as bigint)
            : (res.result[0] as bigint)
          : typeof res.result === "bigint"
          ? (res.result as bigint)
          : 0n;

        if (amountOut > 0n) {
          const existing = bestQuotes.get(candidate.symbol);
          if (!existing || amountOut > existing.amountOut) {
            bestQuotes.set(candidate.symbol, {
              amountOut,
              decimalsOut: candidate.decimalsOut,
              inputSymbol: candidate.inputSymbol,
              outputSymbol: candidate.outputSymbol,
              feeLabel: candidate.feeLabel,
            });
          }
        }
      }
    });

    return Object.fromEntries(
      routes.map((r) => {
        const best = bestQuotes.get(r.symbol);
        return [
          r.symbol,
          {
            checkedAt,
            venueLabel: "Uniswap V3 · Base (Concentrated)",
            inputSymbol: r.inputSymbol,
            outputSymbol: r.outputSymbol,
            ...(best && best.amountOut > 0n
              ? {
                  status: "quoted",
                  output: formatUnits(best.amountOut, best.decimalsOut),
                  feeTier: best.feeLabel,
                }
              : { status: "unavailable" }),
          },
        ];
      })
    );
  } catch {
    return Object.fromEntries(
      routes.map((route) => [
        route.symbol,
        {
          status: "rpc-error",
          inputSymbol: route.inputSymbol,
          outputSymbol: route.outputSymbol,
          checkedAt,
          venueLabel: deployment
            ? "Shaggy-Dogg-Dex pools · Base"
            : "Uniswap V3 · Base (Concentrated)",
        },
      ])
    );
  }
}
