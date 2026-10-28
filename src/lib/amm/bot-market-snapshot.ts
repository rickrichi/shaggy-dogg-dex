// src/lib/amm/bot-market-snapshot.ts
// Live Base quotes for the Auto-Pilot bot, read from the venues its live handlers trade on:
//   triangular  - Uniswap V3, WETH -> USDC -> cbBTC -> WETH, best of every fee-tier combination
//                 (executed with SwapRouter02.exactInput on exactly the quoted path)
//                 cbBTC replaced DAI here: Base's USDC/DAI and DAI/WETH pools hold low
//                 hundreds to low thousands of dollars at every fee tier (checked on-chain),
//                 making any realistic trade size pure price-impact loss. cbBTC/USDC and
//                 cbBTC/WETH each run into eight figures of liquidity on Base.
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
// cbBTC isn't a pegged pair like DAI was, and its deepest tier is 0.05% rather than the usual
// stablecoin tiers — quote every tier on every leg, same as the WETH/USDC legs.

export interface BotQuoteVenues {
  readonly uniswapV3Quoter: Address;
  readonly uniswapV3Router: Address;
  readonly aerodromeRouter: Address;
  readonly aerodromeFactory: Address;
  readonly weth: Address;
  readonly usdc: Address;
  readonly cbbtc: Address;
}

/** A Uniswap V3 multi-hop path: tokens[i] -> tokens[i + 1] through the pool with fees[i]. */
export interface V3Path {
  readonly tokens: readonly [Address, Address, Address, Address];
  readonly fees: readonly [number, number, number];
}

export interface LiveBotQuotes {
  /** Fee-inclusive rates along `triangularPath`; their product is the path's real output. */
  readonly wethUsdcPrice: number;
  readonly usdcCbbtcRate: number;
  readonly cbbtcWethRate: number;
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

/**
 * Quote the bot's legs at its trade size. Returns null when any leg cannot be quoted (RPC failure,
 * missing pool, zero output): the caller must skip the tick rather than evaluate made-up numbers.
 */
export async function fetchLiveBotQuotes(
  client: Pick<PublicClient, "multicall">,
  venues: BotQuoteVenues,
  tradeWeth: number
): Promise<LiveBotQuotes | null> {
  if (!(tradeWeth > 0)) return null;
  const amountIn = parseEther(tradeWeth.toString());
  const { weth, usdc, cbbtc } = venues;
  const quoter = { address: venues.uniswapV3Quoter, abi: UNISWAP_V3_QUOTER_V2_ABI as Abi };

  const paths: V3Path[] = ALL_TIERS.flatMap((f1) =>
    ALL_TIERS.flatMap((f2) =>
      ALL_TIERS.map((f3): V3Path => ({ tokens: [weth, usdc, cbbtc, weth], fees: [f1, f2, f3] }))
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
          args: [encodeV3Path([weth, usdc, cbbtc], [f1, f2]), amountIn],
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
  const cbbtcMid = quotedAmount(second[1]);
  const feeResult = second[2];
  const aeroFeeBps = feeResult?.status === "success" ? (feeResult.result as bigint) : undefined;
  if (!positive(usdcMid) || !positive(cbbtcMid) || aeroFeeBps === undefined) return null;

  const aerodromeFeeRate = Number(aeroFeeBps) / 10_000; // Aerodrome fees are in basis points
  if (!(aerodromeFeeRate >= 0 && aerodromeFeeRate < 0.1)) return null;
  const uniswapFeeRate = uni.fee / 1_000_000; // V3 fees are in hundredths of a basis point

  const usdc1 = Number(formatUnits(usdcMid, 6));
  // cbBTC uses 8 decimals, not DAI's 18 — getting this wrong would be off by 10 orders of
  // magnitude, not a rounding error.
  const cbbtc1 = Number(formatUnits(cbbtcMid, 8));
  const weth2 = Number(formatUnits(chosen.out, 18));
  const uniswapExecutionPrice = Number(formatUnits(uni.out, 6)) / tradeWeth;
  const aerodromeExecutionPrice = Number(formatUnits(aeroOut, 6)) / tradeWeth;

  return {
    wethUsdcPrice: usdc1 / tradeWeth,
    usdcCbbtcRate: cbbtc1 / usdc1,
    cbbtcWethRate: weth2 / cbbtc1,
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
