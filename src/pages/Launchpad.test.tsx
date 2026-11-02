import { describe, expect, it } from "vitest";

import { liquidityOwnershipLabel, stakingTierSummary, walletSupplyLabel } from "./Launchpad";

import type { LaunchpadFormState } from "@/lib/launchpad/types";

const form = (over: Partial<LaunchpadFormState>) =>
  ({
    initialSupply: "1000000",
    tokenSymbol: "FRK",
    enableDexSeeding: true,
    initialTokenLiquidityPercent: 50,
    ...over,
  }) as LaunchpadFormState;

describe("walletSupplyLabel", () => {
  it("shows what stays in the wallet after seeding", () => {
    expect(walletSupplyLabel(form({}))).toBe("500,000 FRK (50% seeded)");
  });

  it("shows the whole supply when seeding is off", () => {
    expect(walletSupplyLabel(form({ enableDexSeeding: false }))).toBe("1,000,000 FRK");
  });

  it("shows a dash until a supply is entered", () => {
    expect(walletSupplyLabel(form({ initialSupply: "" }))).toBe("—");
  });
});

describe("liquidityOwnershipLabel", () => {
  it("describes the Uniswap V3 position as an NFT", () => {
    expect(liquidityOwnershipLabel("uniswap_v3")).toContain("NFT liquidity position");
    expect(liquidityOwnershipLabel("uniswap_v3")).not.toContain("LP tokens");
  });

  it.each(["uniswap_v2", "pancakeswap_v2", "aerodrome"] as const)(
    "describes %s ownership as fungible LP tokens",
    (venue) => {
      expect(liquidityOwnershipLabel(venue)).toContain("fungible LP tokens");
    }
  );
});

describe("stakingTierSummary", () => {
  it("does not claim the staking-only package applies discounts", () => {
    const summary = stakingTierSummary("staking_rewards");
    expect(summary).toContain("tier signal");
    expect(summary).toContain("does not apply a discount by itself");
    expect(summary).not.toContain("vault performance fees");
  });

  it("describes vault discounts only for an archetype that deploys a vault", () => {
    expect(stakingTierSummary("aave_v3_yield")).toContain("vault performance fees");
  });
});
