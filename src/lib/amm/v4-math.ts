// src/lib/amm/v4-math.ts — exact ports of Uniswap v4 TickMath.getSqrtPriceAtTick and
// v4-periphery LiquidityAmounts (constants copied from Uniswap/v4-core main, 2026-11-06), plus the
// inverse amount helpers used to show what a position holds and to set withdrawal minimums.

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
export const Q96 = 1n << 96n;
const MAX_U256 = (1n << 256n) - 1n;

const STEPS: ReadonlyArray<[number, bigint]> = [
  [0x2, 0xfff97272373d413259a46990580e213an],
  [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000, 0x48a170391f7dc42444e8fa2n],
];

/** sqrt(1.0001^tick) * 2^96, rounded up, exactly as TickMath.getSqrtPriceAtTick. */
export function getSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK)
    throw new Error(`Tick ${tick} out of range`);
  const abs = Math.abs(tick);
  let price = abs & 1 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 1n << 128n;
  for (const [bit, factor] of STEPS) if (abs & bit) price = (price * factor) >> 128n;
  if (tick > 0) price = MAX_U256 / price;
  return (price + (1n << 32n) - 1n) >> 32n;
}

/** Largest tick whose sqrt price is <= sqrtPriceX96 (binary search over the exact forward map). */
export function getTickAtSqrtPrice(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 < MIN_SQRT_PRICE || sqrtPriceX96 >= MAX_SQRT_PRICE)
    throw new Error("sqrt price out of range");
  let lo = MIN_TICK;
  let hi = MAX_TICK;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (getSqrtPriceAtTick(mid) <= sqrtPriceX96) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Nearest usable tick for a spacing, clamped to the range (TickMath.minUsableTick/maxUsableTick). */
export function usableTick(tick: number, spacing: number): number {
  const min = Math.ceil(MIN_TICK / spacing) * spacing;
  const max = Math.floor(MAX_TICK / spacing) * spacing;
  const t = Math.round(tick / spacing) * spacing;
  return Math.min(max, Math.max(min, t));
}

export const fullRange = (spacing: number) => ({
  tickLower: Math.ceil(MIN_TICK / spacing) * spacing,
  tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
});

const sort = (a: bigint, b: bigint): [bigint, bigint] => (a > b ? [b, a] : [a, b]);

export function getLiquidityForAmount0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  [sqrtA, sqrtB] = sort(sqrtA, sqrtB);
  const intermediate = (sqrtA * sqrtB) / Q96;
  return (amount0 * intermediate) / (sqrtB - sqrtA);
}

export function getLiquidityForAmount1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  [sqrtA, sqrtB] = sort(sqrtA, sqrtB);
  return (amount1 * Q96) / (sqrtB - sqrtA);
}

/** LiquidityAmounts.getLiquidityForAmounts. */
export function getLiquidityForAmounts(
  sqrtP: bigint,
  sqrtA: bigint,
  sqrtB: bigint,
  amount0: bigint,
  amount1: bigint
): bigint {
  [sqrtA, sqrtB] = sort(sqrtA, sqrtB);
  if (sqrtP <= sqrtA) return getLiquidityForAmount0(sqrtA, sqrtB, amount0);
  if (sqrtP < sqrtB) {
    const l0 = getLiquidityForAmount0(sqrtP, sqrtB, amount0);
    const l1 = getLiquidityForAmount1(sqrtA, sqrtP, amount1);
    return l0 < l1 ? l0 : l1;
  }
  return getLiquidityForAmount1(sqrtA, sqrtB, amount1);
}

/** Token amounts a position of `liquidity` holds at sqrtP (rounded down, like a withdrawal). */
export function getAmountsForLiquidity(
  sqrtP: bigint,
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint
) {
  [sqrtA, sqrtB] = sort(sqrtA, sqrtB);
  const amount0For = (lo: bigint, hi: bigint) => (liquidity * Q96 * (hi - lo)) / hi / lo;
  const amount1For = (lo: bigint, hi: bigint) => (liquidity * (hi - lo)) / Q96;
  if (sqrtP <= sqrtA) return { amount0: amount0For(sqrtA, sqrtB), amount1: 0n };
  if (sqrtP < sqrtB)
    return { amount0: amount0For(sqrtP, sqrtB), amount1: amount1For(sqrtA, sqrtP) };
  return { amount0: 0n, amount1: amount1For(sqrtA, sqrtB) };
}

/**
 * Human price (token1 per token0, in whole units) <-> sqrtPriceX96. Uses decimal strings and
 * bigint math so large/small prices keep precision; for display and pool creation only.
 */
export function priceToSqrtPriceX96(price: number, decimals0: number, decimals1: number): bigint {
  if (!(price > 0) || !Number.isFinite(price)) throw new Error("Price must be positive");
  // raw ratio = price * 10^(d1 - d0); sqrt(ratio) * 2^96 = sqrt(ratio * 2^192)
  const SCALE = 10n ** 36n;
  const scaled = BigInt(Math.round(price * 1e18)) * 10n ** 18n; // price * 1e36
  const exp = decimals1 - decimals0;
  let num = scaled * (1n << 192n);
  let den = SCALE;
  if (exp >= 0) num *= 10n ** BigInt(exp);
  else den *= 10n ** BigInt(-exp);
  return bigSqrt(num / den);
}

export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  const ratioX192 = sqrtPriceX96 * sqrtPriceX96;
  const exp = decimals0 - decimals1;
  const scaled = (ratioX192 * 10n ** 18n) / (1n << 192n);
  return (Number(scaled) / 1e18) * 10 ** exp;
}

function bigSqrt(v: bigint): bigint {
  if (v < 2n) return v;
  let x = v;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + v / x) / 2n;
  }
  return x;
}
