import { describe, expect, it } from "vitest";

import { getAmmProfile } from "@/config/amm/profiles";

import { type AmmAsset, buildLiquidityPlan, buildPairPlan } from "./plans";

const WETH: AmmAsset = {
  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  symbol: "WETH",
  decimals: 18,
};

const USDC: AmmAsset = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  symbol: "USDC",
  decimals: 6,
};

describe("AMM planning", () => {
  it("creates a canonical, read-only mainnet pair-discovery plan", () => {
    const plan = buildPairPlan(getAmmProfile("mainnet"), WETH, USDC);

    expect(plan.submission).toBe("DISABLED");
    expect(plan.configurationVersion).toBe(1);
    expect(plan.action).toBe("DISCOVER_EXISTING_PAIR");
    expect(plan.factory).toBe("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");
    expect(plan.canonicalPairKey).toBe(
      "1:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    );
  });

  it("keeps a local plan unconfigured and incapable of pair creation", () => {
    const plan = buildPairPlan(getAmmProfile("local"), WETH, USDC);

    expect(plan.action).toBe("CONFIGURE_PROTOCOL_FIRST");
    expect(plan.submission).toBe("DISABLED");
    expect(plan.factory).toBeUndefined();
  });

  it("uses exact bigint minimums and a stable plan key", () => {
    const input = {
      profile: getAmmProfile("mainnet"),
      tokenA: WETH,
      tokenB: USDC,
      amountADesired: 1_000_000_000_000_000_001n,
      amountBDesired: 2_000_001n,
      slippageBps: 50n,
    };
    const plan = buildLiquidityPlan(input);

    expect(plan.amount0Desired).toBe(2_000_001n);
    expect(plan.amount1Desired).toBe(1_000_000_000_000_000_001n);
    expect(plan.amount0Minimum).toBe(1_990_000n);
    expect(plan.amount1Minimum).toBe(995_000_000_000_000_000n);
    expect(plan.planKey).toBe(buildLiquidityPlan(input).planKey);
    expect(plan.approvals).toEqual([]);
    expect(plan.submission).toBe("DISABLED");
  });

  it("rejects duplicate assets and unsafe slippage", () => {
    expect(() => buildPairPlan(getAmmProfile("mainnet"), WETH, WETH)).toThrow("distinct token");
    expect(() =>
      buildLiquidityPlan({
        profile: getAmmProfile("mainnet"),
        tokenA: WETH,
        tokenB: USDC,
        amountADesired: 1n,
        amountBDesired: 1n,
        slippageBps: 1_001n,
      })
    ).toThrow("Slippage");
  });
});
