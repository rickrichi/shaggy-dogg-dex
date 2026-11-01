import { describe, expect, it } from "vitest";

import { formatUsdPrice } from "./format-price";

describe("formatUsdPrice", () => {
  it("shows a real figure for a price far below a cent", () => {
    expect(formatUsdPrice(0.000000000445)).toBe("$0.000000000445");
    expect(formatUsdPrice(0.000000000445)).not.toBe("$0.000000");
  });

  it("keeps small prices to three significant digits", () => {
    expect(formatUsdPrice(0.004567)).toBe("$0.00457");
  });

  it("uses cents for ordinary prices", () => {
    expect(formatUsdPrice(1)).toBe("$1.00");
    expect(formatUsdPrice(2265.58)).toBe("$2,265.58");
    expect(formatUsdPrice(0.01)).toBe("$0.01");
  });
});
