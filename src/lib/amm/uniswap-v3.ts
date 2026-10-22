// src/lib/amm/uniswap-v3.ts - Uniswap V3 Canonical Base Integration & Math
import { type Address, encodeFunctionData, isAddress, parseAbi, zeroAddress } from "viem";

export const UNISWAP_V3_FACTORY_BASE: Address = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";

export const NONFUNGIBLE_POSITION_MANAGER_BASE: Address =
  "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";

export const WETH_BASE: Address = "0x4200000000000000000000000000000000000006";

export const UNISWAP_V3_ROUTER_BASE: Address = "0x2626664c2603336E57B271c5C0b26F421741e481";

export const V3_FEE_TIERS = [
  { fee: 100, label: "0.01% (Stable)", tickSpacing: 1 },
  { fee: 500, label: "0.05% (Stable / Pegged)", tickSpacing: 10 },
  { fee: 3000, label: "0.3% (Standard Altcoins)", tickSpacing: 60 },
  { fee: 10000, label: "1.0% (Community / High Volatility)", tickSpacing: 200 },
] as const;

export type V3FeeTier = (typeof V3_FEE_TIERS)[number]["fee"];

export const NONFUNGIBLE_POSITION_MANAGER_ABI = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) payable returns (uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) payable returns (uint256 amount0, uint256 amount1)",
  "function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
  "function refundETH() payable",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
]);

export const UNISWAP_V3_FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) returns (address pool)",
]);

export const UNISWAP_V3_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
]);

/**
 * Returns integer square root for BigInt.
 */
export function bigintSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Square root of negative numbers is not defined");
  if (value < 2n) return value;
  let x0 = value;
  let x1 = (x0 + value / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) / 2n;
  }
  return x0;
}

/**
 * Sorts two token addresses canonically (token0 < token1)
 */
export function sortTokens(tokenA: Address, tokenB: Address): [Address, Address] {
  if (
    !isAddress(tokenA) ||
    !isAddress(tokenB) ||
    tokenA.toLowerCase() === tokenB.toLowerCase() ||
    tokenA === zeroAddress ||
    tokenB === zeroAddress
  ) {
    throw new Error("V3 requires two distinct non-zero token addresses");
  }
  return tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
}

/**
 * Calculates sqrtPriceX96 given token0 and token1 raw amounts.
 * sqrtPriceX96 = sqrt((amount1 * 2^192) / amount0)
 */
export function encodeSqrtPriceX96(amount0: bigint, amount1: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) {
    throw new Error("Both reserve amounts must be positive to compute sqrtPriceX96");
  }
  const numerator = amount1 * 2n ** 192n;
  const ratio = numerator / amount0;
  const price = bigintSqrt(ratio);
  if (price < 4295128739n || price >= 1461446703485210103287273052203988822378723970342n) {
    throw new Error("Initial price is outside Uniswap V3 TickMath bounds");
  }
  return price;
}

/**
 * Returns the tick bounds for a Full Range position matching Uniswap V2 behavior.
 */
export function getFullRangeTicks(fee: number): { tickLower: number; tickUpper: number } {
  const tickSpacing = V3_FEE_TIERS.find((tier) => tier.fee === fee)?.tickSpacing;
  if (!tickSpacing) throw new Error("Unsupported V3 fee tier");
  const maxTick = 887272;
  const tickUpper = Math.floor(maxTick / tickSpacing) * tickSpacing;
  const tickLower = -tickUpper;
  return { tickLower, tickUpper };
}

/** Initialize (including an existing uninitialized pool) and mint atomically.
 * Both desired amounts express the user's intended ratio. Reject a deposit if
 * the pool cannot consume at least 99.5% of each; never silently disable protection.
 */
export function buildV3MintCall(
  tokenA: Address,
  tokenB: Address,
  amountA: bigint,
  amountB: bigint,
  fee: number,
  recipient: Address,
  deadline: bigint
) {
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const [amount0Desired, amount1Desired] =
    token0.toLowerCase() === tokenA.toLowerCase() ? [amountA, amountB] : [amountB, amountA];
  const sqrtPriceX96 = encodeSqrtPriceX96(amount0Desired, amount1Desired);
  const minimum = (amount: bigint) => (amount * 9950n + 9999n) / 10000n;
  const mint = {
    token0,
    token1,
    fee,
    ...getFullRangeTicks(fee),
    amount0Desired,
    amount1Desired,
    amount0Min: minimum(amount0Desired),
    amount1Min: minimum(amount1Desired),
    recipient,
    deadline,
  };
  return {
    address: NONFUNGIBLE_POSITION_MANAGER_BASE,
    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
    functionName: "multicall" as const,
    args: [
      [
        encodeFunctionData({
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: "createAndInitializePoolIfNecessary",
          args: [token0, token1, fee, sqrtPriceX96],
        }),
        encodeFunctionData({
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: "mint",
          args: [mint],
        }),
      ],
    ] as const,
  };
}
