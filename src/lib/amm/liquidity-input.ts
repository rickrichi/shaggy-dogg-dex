// src/lib/amm/liquidity-input.ts
import { formatUnits, parseUnits } from "viem";

/**
 * A pool quote as form text, at the token's full precision. Rounding here would turn a small but
 * real amount into 0 in pools with a very low price.
 */
export const quoteForInput = (amount: bigint, decimals: number) => formatUnits(amount, decimals);

/** False for empty, malformed or zero text, and for amounts too small for the token to hold. */
export function isPositiveAmount(value: string, decimals: number) {
  try {
    return parseUnits(value.trim(), decimals) > 0n;
  } catch {
    return false;
  }
}
