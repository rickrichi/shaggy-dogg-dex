import { describe, expect, it } from "vitest";

import { impliedLaunchPricing, MIN_SEED_ETH, seedingProblem } from "./seeding";

import type { LaunchpadFormState } from "./types";

const form = {
  initialSupply: "1000000000",
  enableDexSeeding: true,
  initialEthLiquidity: MIN_SEED_ETH,
  initialTokenLiquidityPercent: 50,
} as LaunchpadFormState;

describe("launch seeding floor", () => {
  it("allows the minimum seed and any launch that does not seed", () => {
    expect(seedingProblem(form)).toBeNull();
    expect(
      seedingProblem({ ...form, enableDexSeeding: false, initialEthLiquidity: "0" })
    ).toBeNull();
  });

  it("refuses the old 0.0005 ETH default and malformed amounts", () => {
    expect(seedingProblem({ ...form, initialEthLiquidity: "0.0005" })).toMatch(/at least 0.05 ETH/);
    expect(seedingProblem({ ...form, initialEthLiquidity: "0.0499999" })).toMatch(/at least/);
    expect(seedingProblem({ ...form, initialEthLiquidity: "abc" })).toMatch(/Enter the ETH/);
    expect(seedingProblem({ ...form, initialTokenLiquidityPercent: 0 })).toMatch(/1% and 100%/);
    expect(seedingProblem({ ...form, initialTokenLiquidityPercent: 101 })).toMatch(/1% and 100%/);
  });

  it("shows the price and whole-supply value the deposit ratio sets", () => {
    const pricing = impliedLaunchPricing(form)!;
    expect(pricing.pricePerToken).toBeCloseTo(0.05 / 500_000_000, 20);
    expect(pricing.supplyValueEth).toBeCloseTo(0.1, 12);
    expect(pricing.poolEth).toBeCloseTo(0.1, 12);
    expect(impliedLaunchPricing({ ...form, initialSupply: "" })).toBeNull();
  });
});
