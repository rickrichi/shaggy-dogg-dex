import { describe, expect, it } from "vitest";

import {
  isMainnetExecutionDisabled,
  MAINNET_RELEASE_MANIFEST,
} from "@/config/amm/mainnet-readiness";

import {
  buildSdLiquidityReview,
  getMainnetReadinessReport,
} from "./mainnet-readiness";

describe("Uniswap V2 mainnet readiness", () => {
  it("starts blocked with mainnet execution structurally disabled", () => {
    const report = getMainnetReadinessReport();

    expect(report.releaseStatus).toBe("BLOCKED");
    expect(report.execution).toBe("DISABLED");
    expect(isMainnetExecutionDisabled()).toBe(true);
    expect(report.blockers).toEqual([
      "SD_TOKEN_NOT_DEPLOYED",
      "SD_TOKEN_SOURCE_NOT_VERIFIED",
      "INDEPENDENT_AUDIT_NOT_RECORDED",
      "MAINNET_EXECUTION_INTENTIONALLY_DISABLED",
    ]);
  });

  it("pins the read-only profile to the reviewed Uniswap V2 infrastructure", () => {
    expect(MAINNET_RELEASE_MANIFEST.factory).toBe(
      "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"
    );
    expect(MAINNET_RELEASE_MANIFEST.router).toBe(
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    expect(MAINNET_RELEASE_MANIFEST.wrappedNative).toBe(
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    );
  });

  it("builds a deterministic SD/WETH review without an approval or transaction", () => {
    const input = {
      sdToken: {
        address: "0x1111111111111111111111111111111111111111",
        symbol: "SD",
        decimals: 18,
      },
      sdAmountDesired: 5_000_000_000_000_000_000n,
      wethAmountDesired: 1_000_000_000_000_000n,
      slippageBps: 50n,
    } as const;

    const review = buildSdLiquidityReview(input);

    expect(review.execution).toBe("DISABLED");
    expect(review.reviewStatus).toBe("REQUIRES_HUMAN_REVIEW");
    expect(review.plan.approvals).toEqual([]);
    expect(review.plan.planKey).toBe(buildSdLiquidityReview(input).plan.planKey);
  });
});
