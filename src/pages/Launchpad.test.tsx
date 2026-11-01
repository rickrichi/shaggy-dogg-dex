import { describe, expect, it } from "vitest";

import { walletSupplyLabel } from "./Launchpad";

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
