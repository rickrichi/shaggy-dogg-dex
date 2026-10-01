import { describe, expect, it } from "vitest";

import {
  hasAuthenticatedIndependentAuditPass,
  hasValidHumanApprovedLiquidityPlan,
  hasValidIndependentAuditEvidence,
  LUMIORO_MAINNET_RELEASE,
  type LumioroMainnetRelease,
  releaseBlockersFor,
} from "@/config/amm/lumioro-mainnet-release";

import {
  canSubmitLumioroMainnetLiquidity,
  getLumioroMainnetEvidenceGateReport,
} from "./lumioro-evidence-gate";
import { buildLumioroLiquidityReview } from "./lumioro-liquidity-review";

function candidateRelease(overrides: Partial<LumioroMainnetRelease>): LumioroMainnetRelease {
  return { ...LUMIORO_MAINNET_RELEASE, ...overrides };
}

describe("LUMIORO mainnet evidence gate", () => {
  it("records the repository-verified deployment while remaining blocked", () => {
    const report = getLumioroMainnetEvidenceGateReport();

    expect(report.releaseStatus).toBe("BLOCKED");
    expect(report.execution).toBe("DISABLED");
    expect(report.token.address).toBe("0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E");
    expect(report.token.repositoryVerification).toBe("RECORDED_20_OF_20");
  });

  it("records the authenticated 2026-09-19 review pass", () => {
    const report = getLumioroMainnetEvidenceGateReport();

    expect(report.independentAudit).toEqual({
      status: "PASSED_REPORT_NOT_PUBLISHED",
      auditor: "Tanaka Minato",
      reviewedAt: "2026-09-19",
      memorandumPath: "docs/INDEPENDENT-REVIEW-MEMORANDUM-LUMIORO-TOKEN.md",
      memorandumSha256: "0x828b2ddeee5521bd4e4ebf6b2e68b8d642dc4245fc2f883e6fd6442a8f5ba3c7",
      authenticationRecord: "deployments/lumioro-token-build-2026-08-30.json",
      scopedSourceCommit: "7f359ab44a8636632ea8d07e36ba3a174271d26c",
      deployedRuntimeBytecodeSha256: LUMIORO_MAINNET_RELEASE.token.runtimeBytecodeSha256,
      unresolvedCriticalHighOrMedium: 0,
      finalVerdict: "PASSED",
    });
    expect(hasAuthenticatedIndependentAuditPass(report.independentAudit)).toBe(true);
  });

  it("still withholds the release: a signed pass is not a linked report", () => {
    const report = getLumioroMainnetEvidenceGateReport();

    // The review passed, but its memorandum is a repository file rather than a
    // fetchable URL, so the linkage blocker correctly stays up.
    expect(hasValidIndependentAuditEvidence(report.independentAudit)).toBe(false);
    expect(report.liquidityEnvelope.status).toBe("APPROVED_RANGE_EXACT_PLAN_PENDING");
    expect(report.blockers).toContain("INDEPENDENT_AUDIT_REPORT_NOT_LINKED");
    expect(report.blockers).toContain("EXACT_LIQUIDITY_PLAN_AND_HUMAN_REVIEW_PENDING");
    expect(report.blockers).toContain("MAINNET_EXECUTION_INTENTIONALLY_DISABLED");
    expect(canSubmitLumioroMainnetLiquidity()).toBe(false);
  });

  it("does not treat an asserted auditor name as an audit pass", () => {
    const asserted = {
      status: "ASSERTED_REPORT_NOT_LINKED" as const,
      claimedAuditor: "Tanaka Minato",
      reportUrl: null,
      reportSha256: null,
      scopedSourceCommit: null,
    };

    expect(hasAuthenticatedIndependentAuditPass(asserted)).toBe(false);
    expect(hasValidIndependentAuditEvidence(asserted)).toBe(false);
    expect(releaseBlockersFor(candidateRelease({ independentAudit: asserted }))).toContain(
      "INDEPENDENT_AUDIT_REPORT_NOT_LINKED"
    );
  });

  it("rejects an unpublished pass whose runtime digest does not match the deployment", () => {
    const wrongDigest = {
      ...LUMIORO_MAINNET_RELEASE.independentAudit,
      status: "PASSED_REPORT_NOT_PUBLISHED" as const,
      auditor: "Tanaka Minato",
      reviewedAt: "2026-09-19",
      memorandumPath: "docs/INDEPENDENT-REVIEW-MEMORANDUM-LUMIORO-TOKEN.md",
      memorandumSha256:
        "0x828b2ddeee5521bd4e4ebf6b2e68b8d642dc4245fc2f883e6fd6442a8f5ba3c7" as const,
      authenticationRecord: "deployments/lumioro-token-build-2026-08-30.json",
      scopedSourceCommit: "7f359ab44a8636632ea8d07e36ba3a174271d26c",
      deployedRuntimeBytecodeSha256:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const,
      unresolvedCriticalHighOrMedium: 0,
      finalVerdict: "PASSED" as const,
    };

    expect(hasAuthenticatedIndependentAuditPass(wrongDigest)).toBe(false);
  });

  it("accepts complete final-audit evidence only when it binds to the deployed runtime", () => {
    const passedAudit = {
      status: "PASSED" as const,
      auditor: "Example Security LLC",
      reportUrl: "https://auditor.example/lumioro-final.pdf",
      reportSha256: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as const,
      scopedSourceCommit: "ef6ef651999c17289b26ebc29b36acd50f8f6fb7",
      deployedRuntimeBytecodeSha256: LUMIORO_MAINNET_RELEASE.token.runtimeBytecodeSha256,
      finalVerdict: "PASSED_WITH_RESOLVED_FINDINGS" as const,
    };
    const release = candidateRelease({ independentAudit: passedAudit });

    expect(hasValidIndependentAuditEvidence(passedAudit)).toBe(true);
    expect(releaseBlockersFor(release)).not.toContain("INDEPENDENT_AUDIT_REPORT_NOT_LINKED");
  });

  it("rejects a final audit whose runtime digest does not match the deployment", () => {
    const invalidAudit = {
      status: "PASSED" as const,
      auditor: "Example Security LLC",
      reportUrl: "https://auditor.example/lumioro-final.pdf",
      reportSha256: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as const,
      scopedSourceCommit: "ef6ef651999c17289b26ebc29b36acd50f8f6fb7",
      deployedRuntimeBytecodeSha256:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const,
      finalVerdict: "PASSED" as const,
    };

    expect(hasValidIndependentAuditEvidence(invalidAudit)).toBe(false);
  });

  it("requires exact plan amounts and named human evidence before clearing its gate", () => {
    const approvedEnvelope = {
      status: "EXACT_PLAN_HUMAN_APPROVED" as const,
      lumioroAmountBaseUnits: 250_000_000_000_000_000_000_000_000n,
      minimumWethWei: 20_000_000_000_000_000n,
      maximumWethWei: 22_500_000_000_000_000_000n,
      wethAmountWei: 100_000_000_000_000_000n,
      exactPlanKey: "reviewed-plan-key",
      reviewer: {
        name: "Treasury Reviewer",
        role: "Treasury",
        reviewedAtUtc: "2026-09-16T00:00:00Z",
        evidencePath: "docs/releases/example.md",
      },
    };
    const release = candidateRelease({ liquidityEnvelope: approvedEnvelope });

    expect(hasValidHumanApprovedLiquidityPlan(approvedEnvelope)).toBe(true);
    expect(releaseBlockersFor(release)).not.toContain(
      "EXACT_LIQUIDITY_PLAN_AND_HUMAN_REVIEW_PENDING"
    );
  });

  it("builds only an exact review plan inside the approved envelope", () => {
    const review = buildLumioroLiquidityReview({
      wethAmountDesired: 20_000_000_000_000_000n,
      slippageBps: 0n,
    });

    expect(review.execution).toBe("DISABLED");
    expect(review.plan.approvals).toEqual([]);
    expect(review.plan.amount0Minimum).toBe(review.plan.amount0Desired);
    expect(review.plan.amount1Minimum).toBe(review.plan.amount1Desired);
  });

  it("rejects a liquidity amount outside the approved envelope", () => {
    expect(() =>
      buildLumioroLiquidityReview({
        wethAmountDesired: 19_999_999_999_999_999n,
        slippageBps: 0n,
      })
    ).toThrow("between 0.02 and 22.5 ETH");
  });
});
