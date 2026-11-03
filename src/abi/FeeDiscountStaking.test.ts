import { describe, expect, it } from "vitest";

import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";

import abi from "./FeeDiscountStaking.json";

describe("FeeDiscountStaking ABI file", () => {
  it("matches the contract the launchpad deploys", () => {
    expect(abi).toEqual(LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi);
  });

  it("describes the real staking functions", () => {
    const names = abi.flatMap((item) => (item.type === "function" ? [item.name] : []));
    expect(names).toEqual(expect.arrayContaining(["stake", "unstake", "withdrawFees"]));
    expect(names).not.toContain("depositWithPermit");
  });
});
