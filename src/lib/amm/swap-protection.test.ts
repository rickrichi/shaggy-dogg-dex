import { describe, expect, it } from "vitest";

import {
  calculateMinimumAmountOut,
  INITIAL_SWAP_SLIPPAGE_BPS,
  MAX_SWAP_SLIPPAGE_BPS,
} from "./swap-protection";

describe("swap protection", () => {
  it("derives a non-zero minimum output from the router quote", () => {
    const quote = 4_500_000n * 10n ** 18n;

    expect(calculateMinimumAmountOut(quote, INITIAL_SWAP_SLIPPAGE_BPS)).toBe(
      4_477_500n * 10n ** 18n
    );
  });

  it("rejects quotes and slippage settings that could make execution unsafe", () => {
    expect(() => calculateMinimumAmountOut(0n, INITIAL_SWAP_SLIPPAGE_BPS)).toThrow(
      "positive output"
    );
    expect(() => calculateMinimumAmountOut(1n, 1n)).toThrow("non-zero minimum");
    expect(() => calculateMinimumAmountOut(100n, MAX_SWAP_SLIPPAGE_BPS + 1n)).toThrow("Slippage");
  });
});
