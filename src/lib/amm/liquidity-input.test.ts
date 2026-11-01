import { describe, expect, it } from "vitest";

import { isPositiveAmount, quoteForInput } from "./liquidity-input";

describe("quoteForInput", () => {
  it("keeps a tiny quote that six decimals would turn into zero", () => {
    expect(quoteForInput(4_041_918_000n, 18)).toBe("0.000000004041918");
  });

  it("keeps whole amounts readable", () => {
    expect(quoteForInput(1_500_000n, 6)).toBe("1.5");
  });
});

describe("isPositiveAmount", () => {
  it("accepts a real amount, however small", () => {
    expect(isPositiveAmount("0.000000000000000001", 18)).toBe(true);
    expect(isPositiveAmount("1", 6)).toBe(true);
  });

  it("refuses zero, empty and malformed text", () => {
    for (const value of ["0", "0.000", "", ".", "abc"]) {
      expect(isPositiveAmount(value, 18)).toBe(false);
    }
  });

  it("refuses an amount the token cannot represent", () => {
    expect(isPositiveAmount("0.0000001", 6)).toBe(false);
  });
});
