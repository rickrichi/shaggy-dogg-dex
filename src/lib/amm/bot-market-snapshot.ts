// src/lib/amm/bot-market-snapshot.ts
// Live Base quotes for the Auto-Pilot bot, read from the same routers its live handlers trade on:
//   triangular  - Uniswap V2 router, path WETH -> USDC -> DAI -> WETH (handleExecuteLiveTriangular)
//   cross-DEX   - Uniswap V2 and Aerodrome volatile WETH -> USDC (handleExecuteLiveSpreadLeg)
// Quotes include each pool's fee; the bot engine applies fees itself, so the fee is divided back out
// (Uniswap V2 charges exactly 0.30%; Aerodrome's fee is read from its factory for the pool in use).

import { type Address, formatUnits, parseEther, type PublicClient } from "viem";

import { AERODROME_ROUTER_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";

export const UNISWAP_V2_FEE_RATE = 0.003;

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

export interface BotQuoteVenues {
  readonly uniswapV2Router: Address;
  readonly aerodromeRouter: Address;
  readonly aerodromeFactory: Address;
  readonly weth: Address;
  readonly usdc: Address;
  readonly dai: Address;
}

/** Fee-free rates and prices, plus the fee-inclusive outputs the live handlers will enforce. */
export interface LiveBotQuotes {
  readonly wethUsdcPrice: number;
  readonly usdcDaiRate: number;
  readonly daiWethRate: number;
  readonly uniswapEthPrice: number;
  readonly aerodromeEthPrice: number;
  readonly aerodromeFeeRate: number;
  /** WETH out of the full triangular path for `tradeWeth` WETH in, after pool fees. */
  readonly triangularTerminalWeth: number;
  /** USDC per WETH actually received on each venue for `tradeWeth`, after pool fees. */
  readonly uniswapExecutionPrice: number;
  readonly aerodromeExecutionPrice: number;
  readonly tradeWeth: number;
}

const positive = (value: bigint | undefined): value is bigint => value !== undefined && value > 0n;

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
  const { weth, usdc, dai } = venues;

  let results;
  try {
    results = await client.multicall({
      allowFailure: true,
      contracts: [
        {
          address: venues.uniswapV2Router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [amountIn, [weth, usdc, dai, weth]],
        },
        {
          address: venues.uniswapV2Router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [amountIn, [weth, usdc]],
        },
        {
          address: venues.aerodromeRouter,
          abi: AERODROME_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [
            amountIn,
            [{ from: weth, to: usdc, stable: false, factory: venues.aerodromeFactory }],
          ],
        },
        {
          address: venues.aerodromeFactory,
          abi: AERODROME_FACTORY_ABI,
          functionName: "getPool",
          args: [weth, usdc, false],
        },
      ],
    });
  } catch {
    return null;
  }

  const [triangular, uniswap, aerodrome, aeroPool] = results;
  const tri =
    triangular?.status === "success" ? (triangular.result as readonly bigint[]) : undefined;
  const uniOut =
    uniswap?.status === "success" ? (uniswap.result as readonly bigint[]).at(-1) : undefined;
  const aeroOut =
    aerodrome?.status === "success" ? (aerodrome.result as readonly bigint[]).at(-1) : undefined;
  const pool = aeroPool?.status === "success" ? (aeroPool.result as Address) : undefined;
  if (!tri || tri.length !== 4 || !tri.every(positive) || !positive(uniOut) || !positive(aeroOut)) {
    return null;
  }
  if (!pool || pool === ZERO_ADDRESS) return null;

  let aerodromeFeeRate: number;
  try {
    const [fee] = await client.multicall({
      allowFailure: false,
      contracts: [
        {
          address: venues.aerodromeFactory,
          abi: AERODROME_FACTORY_ABI,
          functionName: "getFee",
          args: [pool, false],
        },
      ],
    });
    aerodromeFeeRate = Number(fee) / 10_000; // Aerodrome fees are in basis points
  } catch {
    return null;
  }
  if (!(aerodromeFeeRate >= 0 && aerodromeFeeRate < 0.1)) return null;

  const [wethIn, usdcMid, daiMid, wethOut] = tri as readonly [bigint, bigint, bigint, bigint];
  const weth1 = Number(formatUnits(wethIn, 18));
  const usdc1 = Number(formatUnits(usdcMid, 6));
  const dai1 = Number(formatUnits(daiMid, 18));
  const weth2 = Number(formatUnits(wethOut, 18));
  const deFee = (rate: number, feeRate: number) => rate / (1 - feeRate);

  const uniswapExecutionPrice = Number(formatUnits(uniOut, 6)) / tradeWeth;
  const aerodromeExecutionPrice = Number(formatUnits(aeroOut, 6)) / tradeWeth;
  const uniswapEthPrice = deFee(uniswapExecutionPrice, UNISWAP_V2_FEE_RATE);

  return {
    wethUsdcPrice: deFee(usdc1 / weth1, UNISWAP_V2_FEE_RATE),
    usdcDaiRate: deFee(dai1 / usdc1, UNISWAP_V2_FEE_RATE),
    daiWethRate: deFee(weth2 / dai1, UNISWAP_V2_FEE_RATE),
    uniswapEthPrice,
    aerodromeEthPrice: deFee(aerodromeExecutionPrice, aerodromeFeeRate),
    aerodromeFeeRate,
    triangularTerminalWeth: weth2,
    uniswapExecutionPrice,
    aerodromeExecutionPrice,
    tradeWeth,
  };
}
