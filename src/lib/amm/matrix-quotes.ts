import { createPublicClient, formatUnits } from "viem";
import { base } from "viem/chains";

import { UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { getUniswapV2Router } from "@/config/contracts";
import { loadDexDeployment } from "@/config/dex/deployment";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { verifyDexDeployment } from "@/lib/amm/own-dex";
import { createBaseReadTransport } from "@/lib/base-rpc";

import type { Address } from "viem";

export const MATRIX_QUOTE_MAX_AGE_MS = 30_000;
const wrapped = BASE_MAINNET_TOKENS.find((t) => t.symbol === "WETH")!;

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
  };
}

export interface MatrixDexQuote {
  status: "quoted" | "unavailable" | "rpc-error";
  output?: string;
  inputSymbol: string;
  outputSymbol: string;
  checkedAt: number;
  venueLabel?: string;
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
  // Timestamp at request start: slow requests must not make an old quote look fresh.
  const checkedAt = Date.now();
  const deployment = loadDexDeployment();
  const venueLabel = deployment ? "Shaggy-Dogg-Dex pools · Base" : "Via Uniswap V2 · Base";
  try {
    if (deployment) await verifyDexDeployment(client, deployment);
    const results = await client.multicall({
      allowFailure: true,
      contracts: routes.map((route) => ({
        address: deployment?.router ?? getUniswapV2Router(base.id),
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
            venueLabel,
            inputSymbol: route.inputSymbol,
            outputSymbol: route.outputSymbol,
            ...(output && output > 0n
              ? { status: "quoted", output: formatUnits(output, route.decimalsOut) }
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
          venueLabel,
        },
      ])
    );
  }
}
