import { type Address, parseAbi, type PublicClient, zeroAddress } from "viem";

import {
  AERODROME_FACTORY,
  isV3Route,
  type SmartRoute,
  v2RouteFactory,
  v3RouteDeployment,
  v3RouteFees,
} from "./smart-routing";
import { UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_FACTORY_BASE, UNISWAP_V3_POOL_ABI } from "./uniswap-v3";

export const HIGH_PRICE_IMPACT = 5;
export const SEVERE_PRICE_IMPACT = 15;

interface Ratio {
  numerator: bigint;
  denominator: bigint;
}
const PAIR_ABI = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
]);
const AERO_ABI = parseAbi([
  "function getPool(address,address,bool) view returns (address)",
  "function metadata() view returns (uint256,uint256,uint256,uint256,bool,address,address)",
]);

/** Raw output units per raw input unit; decimals cancel for volatile pools. */
export function reserveSpotPrice(
  reserveIn: bigint,
  reserveOut: bigint,
  stable = false,
  inputScale = 1n,
  outputScale = 1n
): Ratio {
  if (reserveIn <= 0n || reserveOut <= 0n || inputScale <= 0n || outputScale <= 0n)
    throw new Error("Pool has no usable reserves.");
  if (!stable) return { numerator: reserveOut, denominator: reserveIn };

  // Aerodrome's stable invariant is x*y*(x*x+y*y), with normalized reserves.
  // Its marginal output/input rate is y*(3*x*x+y*y) / x*(x*x+3*y*y).
  // Cross-multiply decimal scales to retain precision without floating point.
  const x = reserveIn * outputScale;
  const y = reserveOut * inputScale;
  return {
    numerator: y * (3n * x * x + y * y) * outputScale,
    denominator: x * (x * x + 3n * y * y) * inputScale,
  };
}

export function v3SpotPrice(sqrtPriceX96: bigint, inputIsToken0: boolean): Ratio {
  if (sqrtPriceX96 <= 0n) throw new Error("Pool price is unavailable.");
  const square = sqrtPriceX96 * sqrtPriceX96;
  return inputIsToken0
    ? { numerator: square, denominator: 2n ** 192n }
    : { numerator: 2n ** 192n, denominator: square };
}

/**
 * Execution shortfall versus the route's pre-trade marginal price, INCLUDING
 * pool fees. This is separate from slippage tolerance and is not a USD valuation.
 */
export function priceImpactPercent(input: bigint, output: bigint, prices: Ratio[]): number {
  if (input <= 0n || output <= 0n || prices.length === 0)
    throw new Error("Price impact requires a positive trade and pool prices.");
  let expected = input;
  let denominator = 1n;
  for (const price of prices) {
    if (price.numerator <= 0n || price.denominator <= 0n) throw new Error("Invalid pool price.");
    expected *= price.numerator;
    denominator *= price.denominator;
  }
  const shortfall = expected - output * denominator;
  return shortfall <= 0n ? 0 : Number((shortfall * 100_000_000n) / expected) / 1_000_000;
}

/** All reads use the quote's block, including every hop of a multi-pool route. */
export async function getRoutePriceImpact(
  client: Pick<PublicClient, "multicall">,
  chainId: number,
  route: SmartRoute,
  input: bigint,
  output: bigint,
  blockNumber: bigint
): Promise<number | null> {
  try {
    const hops = route.path.slice(0, -1).map((from, i) => ({
      from,
      to: route.path[i + 1]!,
      stable: route.stable[i] ?? false,
    }));
    const pools = await client.multicall({
      blockNumber,
      allowFailure: false,
      contracts: hops.map(({ from, to, stable }, i) =>
        isV3Route(route)
          ? {
              address: v3RouteDeployment(route, chainId)?.factory ?? UNISWAP_V3_FACTORY_BASE,
              abi: UNISWAP_V3_FACTORY_ABI,
              functionName: "getPool",
              args: [from, to, v3RouteFees(route)[i]!],
            }
          : route.venue === "Aerodrome"
            ? {
                address: AERODROME_FACTORY,
                abi: AERO_ABI,
                functionName: "getPool",
                args: [from, to, stable],
              }
            : {
                address: v2RouteFactory(route, chainId),
                abi: PAIR_ABI,
                functionName: "getPair",
                args: [from, to],
              }
      ),
    });
    if (pools.some((pool) => !pool || pool === zeroAddress)) return null;
    const prices = await Promise.all(
      hops.map(async (hop, i): Promise<Ratio> => {
        const address = pools[i] as Address;
        if (route.venue === "Aerodrome") {
          const [metadata] = await client.multicall({
            blockNumber,
            allowFailure: false,
            contracts: [{ address, abi: AERO_ABI, functionName: "metadata" }],
          });
          const [d0, d1, r0, r1, stable, token0, token1] = metadata;
          const forward = token0.toLowerCase() === hop.from.toLowerCase();
          if (
            stable !== hop.stable ||
            (forward ? token1 : token0).toLowerCase() !== hop.to.toLowerCase()
          )
            throw new Error("Pool does not match the route.");
          return forward
            ? reserveSpotPrice(r0, r1, stable, d0, d1)
            : reserveSpotPrice(r1, r0, stable, d1, d0);
        }
        if (isV3Route(route)) {
          const [slot, token0] = await client.multicall({
            blockNumber,
            allowFailure: false,
            contracts: [
              { address, abi: UNISWAP_V3_POOL_ABI, functionName: "slot0" },
              { address, abi: UNISWAP_V3_POOL_ABI, functionName: "token0" },
            ],
          });
          return v3SpotPrice(slot[0], token0.toLowerCase() === hop.from.toLowerCase());
        }
        const [reserves, token0] = await client.multicall({
          blockNumber,
          allowFailure: false,
          contracts: [
            { address, abi: PAIR_ABI, functionName: "getReserves" },
            { address, abi: PAIR_ABI, functionName: "token0" },
          ],
        });
        return token0.toLowerCase() === hop.from.toLowerCase()
          ? reserveSpotPrice(reserves[0], reserves[1])
          : reserveSpotPrice(reserves[1], reserves[0]);
      })
    );
    return priceImpactPercent(input, output, prices);
  } catch {
    // Never label a missing/failed pool read as zero impact.
    return null;
  }
}
