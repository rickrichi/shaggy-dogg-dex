// src/lib/amm/flash-routes.ts
// Routes for AtomicFlashArbitrageRouter.executeGenericArbitrage, priced live on Base:
//   flash triangle  - borrow USDC or WETH from Aave, run a Uniswap V3 cycle back to it
//   atomic spread   - borrow WETH, sell it for USDC on the venue paying more, buy WETH back on the
//                     other venue, all inside one flash loan
// The router repays Aave and reverts unless it ends with principal + premium + minNetProfit, so a
// route either completes with that profit or nothing happens.

import { type Abi, type Address, encodeFunctionData, type Hex, type PublicClient } from "viem";

import {
  AERODROME_ROUTER_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V3_SWAP_ROUTER_02_ABI,
} from "@/config/abis";

import { type BotQuoteVenues, encodeV3Path } from "./bot-market-snapshot";
import { V3_FEE_TIERS } from "./uniswap-v3";

const ALL_TIERS: readonly number[] = V3_FEE_TIERS.map((tier) => tier.fee);

const AAVE_POOL_PREMIUM_ABI = [
  {
    type: "function",
    name: "FLASHLOAN_PREMIUM_TOTAL",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

/** One step of executeGenericArbitrage: the router approves `tokenIn` to `target`, then calls it. */
export interface SwapStep {
  readonly target: Address;
  readonly tokenIn: Address;
  readonly amountIn: bigint;
  readonly callData: Hex;
}

export interface V3Cycle {
  readonly tokens: readonly Address[];
  readonly fees: readonly number[];
  readonly amountOut: bigint;
}

export type SpreadVenue = "UNISWAP" | "AERODROME";

export interface AtomicSpreadQuote {
  readonly sellVenue: SpreadVenue; // WETH -> USDC here (pays more USDC per WETH)
  readonly buyVenue: SpreadVenue; // USDC -> WETH here
  readonly uniswapFee: number; // V3 tier used for the Uniswap leg
  readonly usdcMid: bigint; // USDC out of the first leg
  readonly wethOut: bigint; // WETH out of the second leg
}

type Quoter = Pick<PublicClient, "multicall">;
interface ReadCall { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }

function quotedAmount(
  result: { status: string; result?: unknown } | undefined
): bigint | undefined {
  if (result?.status !== "success") return undefined;
  const value = Array.isArray(result.result) ? result.result[0] : result.result;
  return typeof value === "bigint" && value > 0n ? value : undefined;
}

/** Aave's live flash-loan premium in basis points (5 on Base at the time of writing). */
export async function readAavePremiumBps(
  client: Pick<PublicClient, "readContract">,
  pool: Address
) {
  return Number(
    await client.readContract({
      address: pool,
      abi: AAVE_POOL_PREMIUM_ABI,
      functionName: "FLASHLOAN_PREMIUM_TOTAL",
    })
  );
}

export const flashPremium = (amount: bigint, premiumBps: number) =>
  (amount * BigInt(premiumBps)) / 10_000n;

/**
 * Best Uniswap V3 cycle through `tokens` (first == last) over every fee-tier combination.
 * Null when no combination has liquidity.
 */
export async function bestV3Cycle(
  client: Quoter,
  quoter: Address,
  tokens: readonly Address[],
  amountIn: bigint
): Promise<V3Cycle | null> {
  const hopTiers = tokens.slice(1).map(() => ALL_TIERS);
  const combos = hopTiers.reduce<number[][]>(
    (acc, tiers) => acc.flatMap((prefix) => tiers.map((fee) => [...prefix, fee])),
    [[]]
  );
  let results;
  try {
    results = await client.multicall({
      allowFailure: true,
      contracts: combos.map((fees) => ({
        address: quoter,
        abi: UNISWAP_V3_QUOTER_V2_ABI as Abi,
        functionName: "quoteExactInput",
        args: [encodeV3Path(tokens, fees), amountIn],
      })),
    });
  } catch {
    return null;
  }
  let best: V3Cycle | null = null;
  combos.forEach((fees, i) => {
    const out = quotedAmount(results[i]);
    if (out !== undefined && (!best || out > best.amountOut))
      best = { tokens, fees, amountOut: out };
  });
  return best;
}

/** The flash triangle for a borrowed asset: USDC -> cbBTC -> WETH -> USDC, or WETH -> USDC -> cbBTC -> WETH. */
export function flashTriangleTokens(asset: "USDC" | "WETH", venues: BotQuoteVenues) {
  const { weth, usdc, cbbtc } = venues;
  return asset === "USDC"
    ? { tokens: [usdc, cbbtc, weth, usdc] as const }
    : { tokens: [weth, usdc, cbbtc, weth] as const };
}

/**
 * Both directions of the WETH/USDC spread for `amountWeth` (wei): sell on one venue, buy back on the
 * other. Returns the direction that ends with more WETH, or null if either venue cannot quote.
 */
export async function quoteAtomicSpread(
  client: Quoter,
  venues: BotQuoteVenues,
  amountWeth: bigint
): Promise<AtomicSpreadQuote | null> {
  const { weth, usdc } = venues;
  const quoter = { address: venues.uniswapV3Quoter, abi: UNISWAP_V3_QUOTER_V2_ABI as Abi };
  const aero = (from: Address, to: Address, amount: bigint): ReadCall => ({
    address: venues.aerodromeRouter,
    abi: AERODROME_ROUTER_ABI as Abi,
    functionName: "getAmountsOut",
    args: [amount, [{ from, to, stable: false, factory: venues.aerodromeFactory }]],
  });
  const uni = (from: Address, to: Address, amount: bigint, fee: number): ReadCall => ({
    ...quoter,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: from, tokenOut: to, amountIn: amount, fee, sqrtPriceLimitX96: 0n }],
  });
  const aeroOut = (r: { status: string; result?: unknown } | undefined) =>
    r?.status === "success" ? ((r.result as readonly bigint[]).at(-1) ?? 0n) : 0n;
  const bestTier = (rs: ReadonlyArray<{ status: string; result?: unknown } | undefined>) =>
    rs.reduce<{ fee: number; out: bigint } | null>((best, r, i) => {
      const out = quotedAmount(r);
      const fee = ALL_TIERS[i];
      return out !== undefined && fee !== undefined && (!best || out > best.out)
        ? { fee, out }
        : best;
    }, null);

  try {
    // Leg 1 on each venue.
    const first = await client.multicall({
      allowFailure: true,
      contracts: [
        ...ALL_TIERS.map((fee) => uni(weth, usdc, amountWeth, fee)),
        aero(weth, usdc, amountWeth),
      ],
    });
    const uniSell = bestTier(first.slice(0, ALL_TIERS.length));
    const aeroSell = aeroOut(first[ALL_TIERS.length]);
    if (!uniSell || aeroSell <= 0n) return null;

    // Leg 2 on the other venue, sized by leg 1.
    const second = await client.multicall({
      allowFailure: true,
      contracts: [
        aero(usdc, weth, uniSell.out),
        ...ALL_TIERS.map((fee) => uni(usdc, weth, aeroSell, fee)),
      ],
    });
    const viaUniThenAero = aeroOut(second[0]);
    const uniBuy = bestTier(second.slice(1));

    const candidates: AtomicSpreadQuote[] = [];
    if (viaUniThenAero > 0n) {
      candidates.push({
        sellVenue: "UNISWAP",
        buyVenue: "AERODROME",
        uniswapFee: uniSell.fee,
        usdcMid: uniSell.out,
        wethOut: viaUniThenAero,
      });
    }
    if (uniBuy) {
      candidates.push({
        sellVenue: "AERODROME",
        buyVenue: "UNISWAP",
        uniswapFee: uniBuy.fee,
        usdcMid: aeroSell,
        wethOut: uniBuy.out,
      });
    }
    return candidates.reduce<AtomicSpreadQuote | null>(
      (best, c) => (!best || c.wethOut > best.wethOut ? c : best),
      null
    );
  } catch {
    return null;
  }
}

/** A Uniswap V3 exactInput step paying `recipient`, reverting below `minimumOut`. */
export function v3ExactInputStep(
  router: Address,
  tokens: readonly Address[],
  fees: readonly number[],
  amountIn: bigint,
  minimumOut: bigint,
  recipient: Address
): SwapStep {
  const tokenIn = tokens[0];
  if (!tokenIn || amountIn <= 0n) throw new Error("Invalid V3 step");
  return {
    target: router,
    tokenIn,
    amountIn,
    callData: encodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      functionName: "exactInput",
      args: [
        { path: encodeV3Path(tokens, fees), recipient, amountIn, amountOutMinimum: minimumOut },
      ],
    }),
  };
}

/** An Aerodrome volatile single-hop step paying `recipient`, reverting below `minimumOut`. */
export function aerodromeStep(
  venues: BotQuoteVenues,
  from: Address,
  to: Address,
  amountIn: bigint,
  minimumOut: bigint,
  recipient: Address,
  deadline: bigint
): SwapStep {
  if (amountIn <= 0n) throw new Error("Invalid Aerodrome step");
  return {
    target: venues.aerodromeRouter,
    tokenIn: from,
    amountIn,
    callData: encodeFunctionData({
      abi: AERODROME_ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [
        amountIn,
        minimumOut,
        [{ from, to, stable: false, factory: venues.aerodromeFactory }],
        recipient,
        deadline,
      ],
    }),
  };
}

// Leg 2 spends slightly less than leg 1 was quoted to return, so a tiny adverse move between quote
// and inclusion does not revert the whole route. The unspent USDC stays in the router (admin can
// rescueTokens); leg 1's minimum guarantees leg 2 always has its input.
export const SPREAD_LEG2_BUFFER_BPS = 5n;

/** The two steps of an atomic spread, with the router (`self`) receiving every leg. */
export function atomicSpreadSteps(
  venues: BotQuoteVenues,
  quote: AtomicSpreadQuote,
  amountWeth: bigint,
  minimumWethOut: bigint,
  self: Address,
  deadline: bigint
): SwapStep[] {
  const { weth, usdc } = venues;
  const leg2In = (quote.usdcMid * (10_000n - SPREAD_LEG2_BUFFER_BPS)) / 10_000n;
  const leg =
    (venue: SpreadVenue) =>
    (from: Address, to: Address, amountIn: bigint, minimumOut: bigint): SwapStep =>
      venue === "UNISWAP"
        ? v3ExactInputStep(
            venues.uniswapV3Router,
            [from, to],
            [quote.uniswapFee],
            amountIn,
            minimumOut,
            self
          )
        : aerodromeStep(venues, from, to, amountIn, minimumOut, self, deadline);
  return [
    leg(quote.sellVenue)(weth, usdc, amountWeth, leg2In),
    leg(quote.buyVenue)(usdc, weth, leg2In, minimumWethOut),
  ];
}
