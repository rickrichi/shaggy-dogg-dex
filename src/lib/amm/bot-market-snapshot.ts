// src/lib/amm/bot-market-snapshot.ts
// Live Base quotes for the Auto-Pilot bot, read from the venues its live handlers trade on:
//   triangular  - Uniswap V3, WETH -> USDC -> X -> WETH for whichever candidate middle asset X
//                 currently quotes best (executed with SwapRouter02.exactInput on exactly the
//                 quoted path). Scanning multiple candidates instead of one fixed asset (first
//                 DAI, then cbBTC alone) means a single candidate's liquidity thinning out no
//                 longer makes the whole feature go dark -- see rankMidAssetCandidates below.
//   cross-DEX   - Uniswap V3 (best WETH/USDC tier) and Aerodrome volatile WETH -> USDC
// Triangular rates are returned fee-inclusive (each V3 pool has its own fee), so the engine must not
// add a fee of its own. Cross-DEX prices are returned fee-free with each venue's real fee rate.

import {
  type Abi,
  type Address,
  encodeFunctionData,
  encodePacked,
  formatUnits,
  type Hex,
  parseEther,
  parseUnits,
  type PublicClient,
} from "viem";

import {
  AERODROME_ROUTER_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V3_SWAP_ROUTER_02_ABI,
} from "@/config/abis";

import { V3_FEE_TIERS } from "./uniswap-v3";

const AERODROME_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getFee",
    stateMutability: "view",
    inputs: [
      { name: "pool", type: "address" },
      { name: "_stable", type: "bool" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ALL_TIERS = V3_FEE_TIERS.map((tier) => tier.fee);
// None of the candidate middle assets are pegged pairs, and their deepest tier isn't always the
// usual stablecoin one — quote every tier on every leg, same as the WETH/USDC legs.

/** A candidate middle asset for the triangular cycle: WETH -> USDC -> candidate -> WETH. */
export interface TriangularCandidate {
  readonly symbol: string;
  readonly address: Address;
  readonly decimals: number;
}

export interface BotQuoteVenues {
  readonly uniswapV3Quoter: Address;
  readonly uniswapV3Router: Address;
  readonly aerodromeRouter: Address;
  readonly aerodromeFactory: Address;
  readonly weth: Address;
  readonly usdc: Address;
  readonly candidates: readonly TriangularCandidate[];
}

/** A Uniswap V3 multi-hop path: tokens[i] -> tokens[i + 1] through the pool with fees[i]. */
export interface V3Path {
  readonly tokens: readonly [Address, Address, Address, Address];
  readonly fees: readonly [number, number, number];
}

export interface LiveBotQuotes {
  /** Fee-inclusive rates along `triangularPath`; their product is the path's real output. */
  readonly wethUsdcPrice: number;
  readonly usdcMidRate: number;
  readonly midWethRate: number;
  /** Which candidate middle asset actually won this tick's scan. */
  readonly midAsset: TriangularCandidate;
  readonly triangularPath: V3Path;
  /** WETH out of the full triangular path for `tradeWeth` WETH in, after pool fees. */
  readonly triangularTerminalWeth: number;
  /** Fee-free prices and each venue's fee rate, for the cross-DEX comparison. */
  readonly uniswapEthPrice: number;
  readonly uniswapFeeTier: number;
  readonly uniswapFeeRate: number;
  readonly aerodromeEthPrice: number;
  readonly aerodromeFeeRate: number;
  /** USDC per WETH actually received on each venue for `tradeWeth`, after pool fees. */
  readonly uniswapExecutionPrice: number;
  readonly aerodromeExecutionPrice: number;
  readonly tradeWeth: number;
}

export function encodeV3Path(tokens: readonly Address[], fees: readonly number[]): Hex {
  if (tokens.length !== fees.length + 1) throw new Error("A V3 path needs one fee per hop");
  const types: Array<"address" | "uint24"> = [];
  const values: Array<Address | number> = [];
  tokens.forEach((token, i) => {
    types.push("address");
    values.push(token);
    const fee = fees[i];
    if (fee !== undefined) {
      types.push("uint24");
      values.push(fee);
    }
  });
  return encodePacked(types, values);
}

const positive = (value: bigint | undefined): value is bigint => value !== undefined && value > 0n;

/** QuoterV2 returns (amountOut, ...); anything else is not a quote. */
function quotedAmount(
  result: { status: string; result?: unknown } | undefined
): bigint | undefined {
  if (result?.status !== "success" || !Array.isArray(result.result)) return undefined;
  const amount = result.result[0];
  return typeof amount === "bigint" ? amount : undefined;
}

function bestSingleHop(
  results: readonly ({ status: string; result?: unknown } | undefined)[],
  offset: number
): { fee: number; out: bigint } | null {
  let best: { fee: number; out: bigint } | null = null;
  ALL_TIERS.forEach((fee, i) => {
    const out = quotedAmount(results[offset + i]);
    if (positive(out) && (!best || out > best.out)) best = { fee, out };
  });
  return best;
}

// Ranking uses a fixed reference size, independent of the bot's actual trade size: it only needs
// to compare candidates against each other, not produce the real numbers (stage 2 does that).
const RANK_PROBE_USDC = parseUnits("2000", 6);

/**
 * Cheap screen across every candidate in `venues.candidates`: quotes USDC -> candidate -> WETH
 * (best single-hop tier each leg, not the full combination search) for a fixed reference size,
 * and ranks candidates by how much WETH value survived the round trip. Candidates missing either
 * leg's liquidity entirely are dropped. Best candidate first; empty when none have both legs.
 */
export async function rankMidAssetCandidates(
  client: Pick<PublicClient, "multicall">,
  venues: BotQuoteVenues
): Promise<TriangularCandidate[]> {
  const { usdc, weth, candidates } = venues;
  if (candidates.length === 0) return [];
  const quoter = { address: venues.uniswapV3Quoter, abi: UNISWAP_V3_QUOTER_V2_ABI as Abi };

  let firstLeg;
  try {
    firstLeg = await client.multicall({
      allowFailure: true,
      contracts: candidates.flatMap((c) =>
        ALL_TIERS.map((fee) => ({
          ...quoter,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: usdc, tokenOut: c.address, amountIn: RANK_PROBE_USDC, fee, sqrtPriceLimitX96: 0n }],
        }))
      ),
    });
  } catch {
    return [];
  }

  const midAmounts = candidates.map((c, idx) => ({
    candidate: c,
    best: bestSingleHop(firstLeg, idx * ALL_TIERS.length),
  }));
  const withMid = midAmounts.filter(
    (m): m is { candidate: TriangularCandidate; best: { fee: number; out: bigint } } => m.best !== null
  );
  if (withMid.length === 0) return [];

  let secondLeg;
  try {
    secondLeg = await client.multicall({
      allowFailure: true,
      contracts: withMid.flatMap(({ candidate, best }) =>
        ALL_TIERS.map((fee) => ({
          ...quoter,
          functionName: "quoteExactInputSingle",
          args: [
            { tokenIn: candidate.address, tokenOut: weth, amountIn: best.out, fee, sqrtPriceLimitX96: 0n },
          ],
        }))
      ),
    });
  } catch {
    return [];
  }

  return withMid
    .map(({ candidate }, idx) => ({
      candidate,
      wethOut: bestSingleHop(secondLeg, idx * ALL_TIERS.length)?.out ?? 0n,
    }))
    .filter((r) => r.wethOut > 0n)
    .sort((a, b) => (b.wethOut > a.wethOut ? 1 : b.wethOut < a.wethOut ? -1 : 0))
    .map((r) => r.candidate);
}

// Only the top few candidates from the cheap screen get the full, expensive combination search.
const STAGE2_SURVIVORS = 3;

/**
 * Quote the bot's legs at its trade size. Scans every candidate in `venues.candidates` via
 * rankMidAssetCandidates first, then runs the full fee-tier combination search only on the top
 * STAGE2_SURVIVORS -- see the module comment for why. Returns null when no candidate survives
 * the cheap screen, or the full search finds no usable path for any survivor, or any other leg
 * cannot be quoted (RPC failure, missing pool, zero output): the caller must skip the tick rather
 * than evaluate made-up numbers.
 */
export async function fetchLiveBotQuotes(
  client: Pick<PublicClient, "multicall">,
  venues: BotQuoteVenues,
  tradeWeth: number
): Promise<LiveBotQuotes | null> {
  if (!(tradeWeth > 0)) return null;
  const amountIn = parseEther(tradeWeth.toString());
  const { weth, usdc } = venues;
  const quoter = { address: venues.uniswapV3Quoter, abi: UNISWAP_V3_QUOTER_V2_ABI as Abi };

  const ranked = await rankMidAssetCandidates(client, venues);
  const survivors = ranked.slice(0, STAGE2_SURVIVORS);
  if (survivors.length === 0) return null;

  const paths: V3Path[] = survivors.flatMap((candidate) =>
    ALL_TIERS.flatMap((f1) =>
      ALL_TIERS.flatMap((f2) =>
        ALL_TIERS.map(
          (f3): V3Path => ({ tokens: [weth, usdc, candidate.address, weth], fees: [f1, f2, f3] })
        )
      )
    )
  );

  let results;
  try {
    results = await client.multicall({
      allowFailure: true,
      contracts: [
        ...paths.map((path) => ({
          ...quoter,
          functionName: "quoteExactInput",
          args: [encodeV3Path(path.tokens, path.fees), amountIn],
        })),
        ...ALL_TIERS.map((fee) => ({
          ...quoter,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: weth, tokenOut: usdc, amountIn, fee, sqrtPriceLimitX96: 0n }],
        })),
        {
          address: venues.aerodromeRouter,
          abi: AERODROME_ROUTER_ABI as Abi,
          functionName: "getAmountsOut",
          args: [
            amountIn,
            [{ from: weth, to: usdc, stable: false, factory: venues.aerodromeFactory }],
          ],
        },
        {
          address: venues.aerodromeFactory,
          abi: AERODROME_FACTORY_ABI as Abi,
          functionName: "getPool",
          args: [weth, usdc, false],
        },
      ],
    });
  } catch {
    return null;
  }

  let best: { path: V3Path; out: bigint } | null = null;
  paths.forEach((path, i) => {
    const out = quotedAmount(results[i]);
    if (positive(out) && (!best || out > best.out)) best = { path, out };
  });

  let uniswap: { fee: number; out: bigint } | null = null;
  ALL_TIERS.forEach((fee, i) => {
    const out = quotedAmount(results[paths.length + i]);
    if (positive(out) && (!uniswap || out > uniswap.out)) uniswap = { fee, out };
  });

  const aeroResult = results[paths.length + ALL_TIERS.length];
  const aeroOut =
    aeroResult?.status === "success" ? (aeroResult.result as readonly bigint[]).at(-1) : undefined;
  const poolResult = results[paths.length + ALL_TIERS.length + 1];
  const aeroPool = poolResult?.status === "success" ? (poolResult.result as Address) : undefined;

  const chosen = best as { path: V3Path; out: bigint } | null;
  const uni = uniswap as { fee: number; out: bigint } | null;
  if (!chosen || !uni || !positive(aeroOut) || !aeroPool || aeroPool === ZERO_ADDRESS) return null;

  // The path's middle token is the winning candidate; look it up for its decimals.
  const midCandidate = survivors.find((c) => c.address === chosen.path.tokens[2]);
  if (!midCandidate) return null;

  // Intermediate amounts along the chosen path, and Aerodrome's fee for the pool it routes through.
  const [f1, f2] = chosen.path.fees;
  let second;
  try {
    second = await client.multicall({
      allowFailure: true,
      contracts: [
        {
          ...quoter,
          functionName: "quoteExactInput",
          args: [encodeV3Path([weth, usdc], [f1]), amountIn],
        },
        {
          ...quoter,
          functionName: "quoteExactInput",
          args: [encodeV3Path([weth, usdc, midCandidate.address], [f1, f2]), amountIn],
        },
        {
          address: venues.aerodromeFactory,
          abi: AERODROME_FACTORY_ABI as Abi,
          functionName: "getFee",
          args: [aeroPool, false],
        },
      ],
    });
  } catch {
    return null;
  }
  const usdcMid = quotedAmount(second[0]);
  const midMid = quotedAmount(second[1]);
  const feeResult = second[2];
  const aeroFeeBps = feeResult?.status === "success" ? (feeResult.result as bigint) : undefined;
  if (!positive(usdcMid) || !positive(midMid) || aeroFeeBps === undefined) return null;

  const aerodromeFeeRate = Number(aeroFeeBps) / 10_000; // Aerodrome fees are in basis points
  if (!(aerodromeFeeRate >= 0 && aerodromeFeeRate < 0.1)) return null;
  const uniswapFeeRate = uni.fee / 1_000_000; // V3 fees are in hundredths of a basis point

  const usdc1 = Number(formatUnits(usdcMid, 6));
  // Each candidate has its own decimals (cbBTC=8, USDT=6, most others=18) -- getting this wrong
  // would be off by orders of magnitude, not a rounding error.
  const mid1 = Number(formatUnits(midMid, midCandidate.decimals));
  const weth2 = Number(formatUnits(chosen.out, 18));
  const uniswapExecutionPrice = Number(formatUnits(uni.out, 6)) / tradeWeth;
  const aerodromeExecutionPrice = Number(formatUnits(aeroOut, 6)) / tradeWeth;

  return {
    wethUsdcPrice: usdc1 / tradeWeth,
    usdcMidRate: mid1 / usdc1,
    midWethRate: weth2 / mid1,
    midAsset: midCandidate,
    triangularPath: chosen.path,
    triangularTerminalWeth: weth2,
    uniswapEthPrice: uniswapExecutionPrice / (1 - uniswapFeeRate),
    uniswapFeeTier: uni.fee,
    uniswapFeeRate,
    aerodromeEthPrice: aerodromeExecutionPrice / (1 - aerodromeFeeRate),
    aerodromeFeeRate,
    uniswapExecutionPrice,
    aerodromeExecutionPrice,
    tradeWeth,
  };
}

/**
 * SwapRouter02 call for the triangular path: native ETH in (wrapped by the router), WETH out to
 * `recipient`, reverting below `minimumOut`; any unspent ETH is refunded.
 */
export function v3TriangularSwapCall(
  router: Address,
  path: V3Path,
  amountIn: bigint,
  minimumOut: bigint,
  recipient: Address,
  deadline: bigint
) {
  if (amountIn <= 0n || minimumOut <= 0n) throw new Error("Invalid triangular swap amounts");
  const swap = encodeFunctionData({
    abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
    functionName: "exactInput",
    args: [
      {
        path: encodeV3Path(path.tokens, path.fees),
        recipient,
        amountIn,
        amountOutMinimum: minimumOut,
      },
    ],
  });
  const refund = encodeFunctionData({
    abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
    functionName: "refundETH",
  });
  return {
    address: router,
    abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
    functionName: "multicall" as const,
    args: [deadline, [swap, refund]] as const,
    value: amountIn,
  };
}
