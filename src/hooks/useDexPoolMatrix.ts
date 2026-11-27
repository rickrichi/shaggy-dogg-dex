import { useQuery } from "@tanstack/react-query";
import { type Address, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";

import { BASE_DEX_VENUES, type DexVenueCapability } from "@/config/dex-venues";

const V2_FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;
const V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;
const AERO_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "bool" }],
    outputs: [{ type: "address" }],
  },
] as const;
const V2_POOL_ABI = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
] as const;
const V3_POOL_ABI = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

export type PoolCheckState =
  "live" | "inactive" | "missing" | "partial" | "unsupported" | "error";
export interface QuoteTarget {
  address: Address;
  symbol: string;
}
export interface DiscoveredPool {
  address: Address;
  fee?: number;
  stable?: boolean;
  liquidity: "active" | "inactive" | "unknown";
  quoteAddress?: Address;
  quoteSymbol?: string;
}
export interface PoolDiscovery {
  venue: DexVenueCapability;
  state: PoolCheckState;
  pools: DiscoveredPool[];
  failedChecks: number;
  error?: string;
}
interface Reader {
  readContract: (request: Record<string, unknown>) => Promise<unknown>;
}
const nonzero = (address: Address) => address.toLowerCase() !== zeroAddress;

export async function inspectVenuePools(
  client: Reader,
  venue: DexVenueCapability,
  token: Address,
  quote: Address,
  quoteSymbol?: string,
): Promise<PoolDiscovery> {
  if (!venue.factory)
    return { venue, state: "unsupported", pools: [], failedChecks: 0 };
  const checks: Array<{
    fee?: number;
    stable?: boolean;
    run: () => Promise<Address>;
  }> =
    venue.kind === "v2"
      ? [
          {
            run: () =>
              client.readContract({
                address: venue.factory,
                abi: V2_FACTORY_ABI,
                functionName: "getPair",
                args: [token, quote],
              }) as Promise<Address>,
          },
        ]
      : venue.kind === "aerodrome"
        ? [false, true].map((stable) => ({
            stable,
            run: () =>
              client.readContract({
                address: venue.factory,
                abi: AERO_FACTORY_ABI,
                functionName: "getPool",
                args: [token, quote, stable],
              }) as Promise<Address>,
          }))
        : (venue.fees ?? []).map((fee) => ({
            fee,
            run: () =>
              client.readContract({
                address: venue.factory,
                abi: V3_FACTORY_ABI,
                functionName: "getPool",
                args: [token, quote, fee],
              }) as Promise<Address>,
          }));
  const factoryResults = await Promise.allSettled(
    checks.map((check) => check.run()),
  );
  const factoryFailures = factoryResults.filter(
    (result) => result.status === "rejected",
  ).length;
  const candidates = factoryResults.flatMap((result, index) =>
    result.status === "fulfilled" && nonzero(result.value)
      ? [
          {
            address: result.value,
            ...(checks[index]?.fee !== undefined
              ? { fee: checks[index]!.fee }
              : {}),
            ...(checks[index]?.stable !== undefined
              ? { stable: checks[index]!.stable }
              : {}),
            ...(quoteSymbol !== undefined
              ? { quoteAddress: quote, quoteSymbol }
              : {}),
          },
        ]
      : [],
  );
  if (!candidates.length) {
    if (factoryFailures === checks.length)
      return {
        venue,
        state: "error",
        pools: [],
        failedChecks: factoryFailures,
        error: "All factory reads failed",
      };
    if (factoryFailures)
      return {
        venue,
        state: "partial",
        pools: [],
        failedChecks: factoryFailures,
        error: "Some factory reads failed; absence is not confirmed",
      };
    return { venue, state: "missing", pools: [], failedChecks: 0 };
  }
  const reads = await Promise.allSettled(
    candidates.map((pool) =>
      client.readContract({
        address: pool.address,
        abi: venue.kind === "v3" ? V3_POOL_ABI : V2_POOL_ABI,
        functionName: venue.kind === "v3" ? "liquidity" : "getReserves",
      }),
    ),
  );
  let liquidityFailures = 0;
  const pools: DiscoveredPool[] = candidates.map((pool, index) => {
    const result = reads[index];
    if (!result || result.status === "rejected") {
      liquidityFailures += 1;
      return { ...pool, liquidity: "unknown" };
    }
    const value = result.value;
    const active =
      typeof value === "bigint"
        ? value > 0n
        : Array.isArray(value) &&
          typeof value[0] === "bigint" &&
          typeof value[1] === "bigint" &&
          value[0] > 0n &&
          value[1] > 0n;
    return { ...pool, liquidity: active ? "active" : "inactive" };
  });
  const failedChecks = factoryFailures + liquidityFailures;
  const state = failedChecks
    ? "partial"
    : pools.some((pool) => pool.liquidity === "active")
      ? "live"
      : "inactive";
  return {
    venue,
    state,
    pools,
    failedChecks,
    ...(failedChecks
      ? { error: "Some on-chain reads failed; partial results shown" }
      : {}),
  };
}

export async function inspectVenuePoolsMultiQuote(
  client: Reader,
  venue: DexVenueCapability,
  token: Address,
  quotes: readonly QuoteTarget[],
): Promise<PoolDiscovery> {
  if (!venue.factory)
    return { venue, state: "unsupported", pools: [], failedChecks: 0 };
  const validQuotes = quotes.filter(
    (q) => q.address.toLowerCase() !== token.toLowerCase(),
  );
  if (!validQuotes.length)
    return { venue, state: "missing", pools: [], failedChecks: 0 };
  if (validQuotes.length === 1) {
    return inspectVenuePools(
      client,
      venue,
      token,
      validQuotes[0]!.address,
      validQuotes[0]!.symbol,
    );
  }
  const results = await Promise.all(
    validQuotes.map((q) =>
      inspectVenuePools(client, venue, token, q.address, q.symbol),
    ),
  );
  const pools = results.flatMap((r) => r.pools);
  const failedChecks = results.reduce((sum, r) => sum + r.failedChecks, 0);
  const allErrored = results.every((r) => r.state === "error");
  if (!pools.length) {
    if (allErrored) {
      return {
        venue,
        state: "error",
        pools: [],
        failedChecks,
        error: "All factory reads failed",
      };
    }
    if (failedChecks > 0) {
      return {
        venue,
        state: "partial",
        pools: [],
        failedChecks,
        error: "Some factory reads failed; absence is not confirmed",
      };
    }
    return { venue, state: "missing", pools: [], failedChecks: 0 };
  }
  const state: PoolCheckState = failedChecks
    ? "partial"
    : pools.some((pool) => pool.liquidity === "active")
      ? "live"
      : "inactive";
  return {
    venue,
    state,
    pools,
    failedChecks,
    ...(failedChecks
      ? { error: "Some on-chain reads failed; partial results shown" }
      : {}),
  };
}

export function useDexPoolMatrix(
  token?: Address,
  quoteOrQuotes?: Address | readonly QuoteTarget[],
  chainId = 8453,
) {
  const client = usePublicClient({ chainId });
  const quotes: readonly QuoteTarget[] =
    typeof quoteOrQuotes === "string"
      ? [{ address: quoteOrQuotes, symbol: "" }]
      : (quoteOrQuotes ?? []);
  const validQuotes = quotes.filter(
    (q) => token && q.address.toLowerCase() !== token.toLowerCase(),
  );
  const quoteKey = validQuotes
    .map((q) => `${q.symbol}:${q.address.toLowerCase()}`)
    .join(",");
  return useQuery({
    queryKey: ["dex-pool-matrix", chainId, token, quoteKey],
    enabled: Boolean(client && token && validQuotes.length > 0),
    staleTime: 20_000,
    queryFn: async () => {
      if (!client || !token || !validQuotes.length)
        throw new Error("Pool reader is not ready.");
      if (typeof quoteOrQuotes === "string") {
        return Promise.all(
          BASE_DEX_VENUES.map((venue) =>
            inspectVenuePools(
              client as unknown as Reader,
              venue,
              token,
              quoteOrQuotes,
            ),
          ),
        );
      }
      return Promise.all(
        BASE_DEX_VENUES.map((venue) =>
          inspectVenuePoolsMultiQuote(
            client as unknown as Reader,
            venue,
            token,
            validQuotes,
          ),
        ),
      );
    },
  });
}
