// src/lib/mrwd-liquidity.ts
// Turns ETH into a staked full-range MRWD/WETH position on Base (pool 0xa7D4…bDB5, 0.30%):
// swap part of the ETH for MRWD, mint a full-range position with the rest plus the wallet's MRWD,
// then stake the new NFT by transferring it to the UniswapV3Staker with the running quarter's key.
// Pure builders only; the component sends each step from the connected wallet.
import { type Address, encodeAbiParameters, encodeFunctionData, type Hex, parseAbi } from "viem";

import { MRWD } from "@/lib/mrwd-pro";

import type { StakerIncentiveKey } from "@/lib/mrwd-staker";

export const WETH: Address = "0x4200000000000000000000000000000000000006";
export const MRWD_POOL: Address = "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5";
export const SWAP_ROUTER_02: Address = "0x2626664c2603336E57B271c5C0b26F421741e481";
export const QUOTER_V2: Address = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
export const POSITION_MANAGER: Address = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const STAKER: Address = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";
export const POOL_FEE = 3000;
/** Full range at tick spacing 60, the same range as the six staked positions. */
export const TICK_LOWER = -887220;
export const TICK_UPPER = 887220;
/** ETH left in the wallet for Base gas. */
export const GAS_RESERVE = 400_000_000_000_000n; // 0.0004 ETH
/** Swap and mint each refuse to go through more than 2% worse than the preview. */
export const SLIPPAGE_BPS = 200n;

const Q192 = 1n << 192n;

export const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

export const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
]);

export const positionManagerAbi = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function refundETH() payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const minus = (amount: bigint, bps: bigint) => (amount * (10_000n - bps)) / 10_000n;

/**
 * What a full-range mint takes at `sqrtPriceX96` when offered `weth` and `mrwd` (WETH is token0,
 * so price = MRWD per WETH = sqrtPriceX96² / 2¹⁹²). Full range makes the ratio the spot price to
 * within about one part in 10¹³, far below the 2% minimums.
 */
export function fullRangeUse(sqrtPriceX96: bigint, weth: bigint, mrwd: bigint) {
  const p2 = sqrtPriceX96 * sqrtPriceX96;
  const wethForMrwd = (mrwd * Q192) / p2;
  const wethUsed = weth < wethForMrwd ? weth : wethForMrwd;
  return { weth: wethUsed, mrwd: (wethUsed * p2) / Q192 };
}

export interface SwapQuote {
  amountOut: bigint;
  sqrtPriceX96After: bigint;
}

export interface LiquidityPlan {
  /** ETH swapped for MRWD. */
  swapEth: bigint;
  /** MRWD the swap is quoted to return. */
  swapMrwd: bigint;
  /** ETH paired in the position. */
  lpEth: bigint;
  /** MRWD paired in the position: the swap's output plus MRWD already in the wallet. */
  lpMrwd: bigint;
  sqrtPriceX96After: bigint;
}

/**
 * Splits `ethIn` so that, after swapping `swapEth` for MRWD, the remaining ETH and the wallet's
 * MRWD (`mrwdHeld` plus the swap's output) match the pool's post-swap price. Binary search over
 * the quoter, which accounts for the swap's own price impact.
 */
export async function planLiquidity(
  ethIn: bigint,
  mrwdHeld: bigint,
  sqrtPriceNow: bigint,
  quote: (amountIn: bigint) => Promise<SwapQuote>
): Promise<LiquidityPlan> {
  if (ethIn <= 0n) throw new Error("Enter an ETH amount.");
  // The wallet's MRWD may already cover the ETH, or exceed it; then nothing is swapped.
  const held = fullRangeUse(sqrtPriceNow, ethIn, mrwdHeld);
  if (held.weth >= ethIn) {
    return {
      swapEth: 0n,
      swapMrwd: 0n,
      lpEth: ethIn,
      lpMrwd: held.mrwd,
      sqrtPriceX96After: sqrtPriceNow,
    };
  }
  let lo = 0n;
  let hi = ethIn;
  let best: { x: bigint; q: SwapQuote } | null = null;
  // Stops at 0.000001 ETH: finer splits change the position by less than gas costs.
  for (let i = 0; i < 24 && hi - lo > 1_000_000_000_000n; i++) {
    const x = (lo + hi) / 2n;
    const q = await quote(x);
    const mrwdNeeded = ((ethIn - x) * q.sqrtPriceX96After * q.sqrtPriceX96After) / Q192;
    if (mrwdHeld + q.amountOut < mrwdNeeded) {
      lo = x;
    } else {
      hi = x;
      best = { x, q };
    }
  }
  if (!best) best = { x: hi, q: await quote(hi) };
  const use = fullRangeUse(best.q.sqrtPriceX96After, ethIn - best.x, mrwdHeld + best.q.amountOut);
  return {
    swapEth: best.x,
    swapMrwd: best.q.amountOut,
    lpEth: use.weth,
    lpMrwd: use.mrwd,
    sqrtPriceX96After: best.q.sqrtPriceX96After,
  };
}

/** ETH → MRWD on the 0.30% pool. SwapRouter02 wraps the ETH sent as value. */
export function swapCall(
  amountIn: bigint,
  quotedOut: bigint,
  recipient: Address,
  deadline: bigint
) {
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: WETH,
        tokenOut: MRWD,
        fee: POOL_FEE,
        recipient,
        amountIn,
        amountOutMinimum: minus(quotedOut, SLIPPAGE_BPS),
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return {
    address: SWAP_ROUTER_02,
    abi: routerAbi,
    functionName: "multicall" as const,
    args: [deadline, [swap]] as const,
    value: amountIn,
  };
}

/**
 * Full-range mint paid in ETH; refundETH returns any ETH the pool did not take. The minimums are
 * what the mint is expected to take at the current price, less 2%.
 */
export function mintCall(
  sqrtPriceX96: bigint,
  ethAvailable: bigint,
  mrwdAvailable: bigint,
  recipient: Address,
  deadline: bigint
) {
  const use = fullRangeUse(sqrtPriceX96, ethAvailable, mrwdAvailable);
  const mint = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: "mint",
    args: [
      {
        token0: WETH,
        token1: MRWD,
        fee: POOL_FEE,
        tickLower: TICK_LOWER,
        tickUpper: TICK_UPPER,
        amount0Desired: ethAvailable,
        amount1Desired: mrwdAvailable,
        amount0Min: minus(use.weth, SLIPPAGE_BPS),
        amount1Min: minus(use.mrwd, SLIPPAGE_BPS),
        recipient,
        deadline,
      },
    ],
  });
  const refund = encodeFunctionData({ abi: positionManagerAbi, functionName: "refundETH" });
  return {
    address: POSITION_MANAGER,
    abi: positionManagerAbi,
    functionName: "multicall" as const,
    args: [[mint, refund]] as readonly [readonly Hex[]],
    value: ethAvailable,
    expected: use,
  };
}

/**
 * Deposits and stakes in one call: the staker's onERC721Received stakes the NFT in the incentive
 * whose key is ABI-encoded in `data`.
 */
export function stakeNewPositionCall(owner: Address, tokenId: bigint, key: StakerIncentiveKey) {
  const data = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "rewardToken", type: "address" },
          { name: "pool", type: "address" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "refundee", type: "address" },
        ],
      },
    ],
    [key]
  );
  return {
    address: POSITION_MANAGER,
    abi: positionManagerAbi,
    functionName: "safeTransferFrom" as const,
    args: [owner, STAKER, tokenId, data] as const,
  };
}
