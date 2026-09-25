import { getAmmProfile } from "./profiles";

import type { Address, Hex } from "viem";

export const LUMIORO_DEPLOYED_RUNTIME_BYTECODE_SHA256 =
  "0x60df844cb24eebe0468c53a079a326d77f6769ee75905760ecf9602a2622e696" as Hex;

export type LumioroReleaseBlocker =
  | "EXPLORER_SOURCE_PUBLICATION_NOT_EVIDENCED"
  | "INDEPENDENT_AUDIT_REPORT_NOT_LINKED"
  | "EXACT_LIQUIDITY_PLAN_AND_HUMAN_REVIEW_PENDING"
  | "MAINNET_EXECUTION_INTENTIONALLY_DISABLED";

export interface PassedIndependentAudit {
  readonly status: "PASSED";
  readonly auditor: string;
  readonly reportUrl: string;
  readonly reportSha256: Hex;
  readonly scopedSourceCommit: string;
  readonly deployedRuntimeBytecodeSha256: Hex;
  readonly finalVerdict: "PASSED" | "PASSED_WITH_RESOLVED_FINDINGS";
}

export interface UnlinkedIndependentAudit {
  readonly status: "ASSERTED_REPORT_NOT_LINKED";
  readonly claimedAuditor: string;
  readonly reportUrl: null;
  readonly reportSha256: null;
  readonly scopedSourceCommit: null;
}

/**
 * A completed independent review that PASSED and is cryptographically
 * authenticated, but whose report is a repository memorandum rather than a
 * published URL.
 *
 * This is deliberately distinct from both neighbours. It is not
 * `ASSERTED_REPORT_NOT_LINKED`, because nothing here is merely asserted: the
 * memorandum is hash-bound and the reviewer's own EIP-191 signature verifies
 * over the record. It is not `PASSED` either, because a consumer of this API
 * cannot fetch the report and check it, and an evidence gate should not call
 * unfetchable evidence linked.
 *
 * It therefore does NOT clear `INDEPENDENT_AUDIT_REPORT_NOT_LINKED` on its own
 * — that blocker is named for linkage, and the report genuinely is not linked.
 * Publish the memorandum at an HTTPS URL and promote this to
 * `PassedIndependentAudit` to clear it.
 */
export interface PassedUnpublishedIndependentAudit {
  readonly status: "PASSED_REPORT_NOT_PUBLISHED";
  readonly auditor: string;
  readonly reviewedAt: string;
  readonly memorandumPath: string;
  readonly memorandumSha256: Hex;
  readonly authenticationRecord: string;
  readonly scopedSourceCommit: string;
  readonly deployedRuntimeBytecodeSha256: Hex;
  readonly unresolvedCriticalHighOrMedium: number;
  readonly finalVerdict: "PASSED";
}

export type IndependentAuditEvidence =
  | PassedIndependentAudit
  | PassedUnpublishedIndependentAudit
  | UnlinkedIndependentAudit;

export interface ApprovedLiquidityPlan {
  readonly status: "EXACT_PLAN_HUMAN_APPROVED";
  readonly lumioroAmountBaseUnits: bigint;
  readonly minimumWethWei: bigint;
  readonly maximumWethWei: bigint;
  readonly wethAmountWei: bigint;
  readonly exactPlanKey: string;
  readonly reviewer: {
    readonly name: string;
    readonly role: string;
    readonly reviewedAtUtc: string;
    readonly evidencePath: string;
  };
}

export interface PendingLiquidityPlan {
  readonly status: "APPROVED_RANGE_EXACT_PLAN_PENDING";
  readonly lumioroAmountBaseUnits: bigint;
  readonly minimumWethWei: bigint;
  readonly maximumWethWei: bigint;
  readonly wethAmountWei: null;
  readonly exactPlanKey: null;
  readonly reviewer: null;
}

export type LiquidityEnvelopeEvidence = ApprovedLiquidityPlan | PendingLiquidityPlan;

export interface LumioroMainnetRelease {
  readonly releaseStatus: "BLOCKED";
  readonly execution: "DISABLED";
  readonly chainId: 1;
  readonly token: {
    readonly address: Address;
    readonly symbol: "LUMIORO";
    readonly deploymentTransaction: Hex;
    readonly deploymentBlock: 25_939_316;
    readonly repositoryVerification: "RECORDED_20_OF_20";
    readonly runtimeBytecodeSha256: Hex;
  };
  readonly sourcePublication: "NOT_EVIDENCED" | "EVIDENCED";
  readonly independentAudit: IndependentAuditEvidence;
  readonly liquidityEnvelope: LiquidityEnvelopeEvidence;
  readonly factory: Address;
  readonly router: Address;
  readonly wrappedNative: Address;
}

const profile = getAmmProfile("mainnet");
if (!profile.contracts.factory || !profile.contracts.router || !profile.contracts.wrappedNative) {
  throw new Error("The mainnet Uniswap V2 profile is incomplete.");
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isSha256(value: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(value);
}

function isGitCommit(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function hasValidIndependentAuditEvidence(
  audit: IndependentAuditEvidence,
  expectedRuntimeDigest: Hex = LUMIORO_DEPLOYED_RUNTIME_BYTECODE_SHA256
): audit is PassedIndependentAudit {
  return (
    audit.status === "PASSED" &&
    isNonEmpty(audit.auditor) &&
    isHttpsUrl(audit.reportUrl) &&
    isSha256(audit.reportSha256) &&
    isGitCommit(audit.scopedSourceCommit) &&
    audit.deployedRuntimeBytecodeSha256.toLowerCase() === expectedRuntimeDigest.toLowerCase() &&
    (audit.finalVerdict === "PASSED" || audit.finalVerdict === "PASSED_WITH_RESOLVED_FINDINGS")
  );
}

/**
 * True when an independent review has actually been completed and passed,
 * whether or not its report is published at a fetchable URL.
 *
 * Use this to answer "has this been audited?". Use
 * `hasValidIndependentAuditEvidence` to answer the narrower release-gate
 * question "is a passing report linked and verifiable by a third party?".
 * Conflating the two is what let this config report a signed PASS as an
 * unevidenced assertion.
 */
export function hasAuthenticatedIndependentAuditPass(
  audit: IndependentAuditEvidence,
  expectedRuntimeDigest: Hex = LUMIORO_DEPLOYED_RUNTIME_BYTECODE_SHA256
): audit is PassedIndependentAudit | PassedUnpublishedIndependentAudit {
  if (hasValidIndependentAuditEvidence(audit, expectedRuntimeDigest)) {
    return true;
  }
  return (
    audit.status === "PASSED_REPORT_NOT_PUBLISHED" &&
    isNonEmpty(audit.auditor) &&
    isSha256(audit.memorandumSha256) &&
    isNonEmpty(audit.memorandumPath) &&
    isGitCommit(audit.scopedSourceCommit) &&
    audit.deployedRuntimeBytecodeSha256.toLowerCase() === expectedRuntimeDigest.toLowerCase() &&
    audit.unresolvedCriticalHighOrMedium === 0 &&
    audit.finalVerdict === "PASSED"
  );
}

export function hasValidHumanApprovedLiquidityPlan(
  envelope: LiquidityEnvelopeEvidence
): envelope is ApprovedLiquidityPlan {
  return (
    envelope.status === "EXACT_PLAN_HUMAN_APPROVED" &&
    envelope.wethAmountWei >= envelope.minimumWethWei &&
    envelope.wethAmountWei <= envelope.maximumWethWei &&
    isNonEmpty(envelope.exactPlanKey) &&
    isNonEmpty(envelope.reviewer.name) &&
    isNonEmpty(envelope.reviewer.role) &&
    isNonEmpty(envelope.reviewer.evidencePath) &&
    !Number.isNaN(Date.parse(envelope.reviewer.reviewedAtUtc))
  );
}

export function releaseBlockersFor(
  release: LumioroMainnetRelease
): readonly LumioroReleaseBlocker[] {
  const blockers: LumioroReleaseBlocker[] = [];
  if (release.sourcePublication !== "EVIDENCED") {
    blockers.push("EXPLORER_SOURCE_PUBLICATION_NOT_EVIDENCED");
  }
  if (
    !hasValidIndependentAuditEvidence(release.independentAudit, release.token.runtimeBytecodeSha256)
  ) {
    blockers.push("INDEPENDENT_AUDIT_REPORT_NOT_LINKED");
  }
  if (!hasValidHumanApprovedLiquidityPlan(release.liquidityEnvelope)) {
    blockers.push("EXACT_LIQUIDITY_PLAN_AND_HUMAN_REVIEW_PENDING");
  }
  blockers.push("MAINNET_EXECUTION_INTENTIONALLY_DISABLED");
  return blockers;
}

/**
 * Evidence copied from the companion LUMIORO deployment record. This model
 * accepts a final audit and an approved review record only when their fields
 * are complete and the audit runtime digest matches the deployed digest.
 * It does not infer source publication, approval, or execution authority.
 */
export const LUMIORO_MAINNET_RELEASE: LumioroMainnetRelease = {
  releaseStatus: "BLOCKED",
  execution: "DISABLED",
  chainId: 1,
  token: {
    address: "0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E" as Address,
    symbol: "LUMIORO",
    deploymentTransaction:
      "0x0ec287f5fb036f12e68559be1b9a47244553807962e12787d5daee28ca90a201" as Hex,
    deploymentBlock: 25_939_316,
    repositoryVerification: "RECORDED_20_OF_20",
    runtimeBytecodeSha256: LUMIORO_DEPLOYED_RUNTIME_BYTECODE_SHA256,
  },
  sourcePublication: "NOT_EVIDENCED",
  // Transcribed from deployments/lumioro-token-build-2026-08-30.json in the
  // lumioro registry repository, authenticated 2026-09-19T08:19:19Z by Tanaka
  // Minato's EIP-191 signature over that record and the memorandum hash below.
  // The memorandum is a repository file, not a published URL, so this is
  // PASSED_REPORT_NOT_PUBLISHED and the release gate still reports
  // INDEPENDENT_AUDIT_REPORT_NOT_LINKED. That blocker is about linkage, not
  // about whether the review happened — it did, and it passed.
  independentAudit: {
    status: "PASSED_REPORT_NOT_PUBLISHED",
    auditor: "Tanaka Minato",
    reviewedAt: "2026-09-19",
    memorandumPath: "docs/INDEPENDENT-REVIEW-MEMORANDUM-LUMIORO-TOKEN.md",
    memorandumSha256:
      "0x828b2ddeee5521bd4e4ebf6b2e68b8d642dc4245fc2f883e6fd6442a8f5ba3c7" as Hex,
    authenticationRecord: "deployments/lumioro-token-build-2026-08-30.json",
    scopedSourceCommit: "7f359ab44a8636632ea8d07e36ba3a174271d26c",
    deployedRuntimeBytecodeSha256: LUMIORO_DEPLOYED_RUNTIME_BYTECODE_SHA256,
    unresolvedCriticalHighOrMedium: 0,
    finalVerdict: "PASSED",
  },
  liquidityEnvelope: {
    status: "APPROVED_RANGE_EXACT_PLAN_PENDING",
    lumioroAmountBaseUnits: 250_000_000_000_000_000_000_000_000n,
    minimumWethWei: 20_000_000_000_000_000n,
    maximumWethWei: 22_500_000_000_000_000_000n,
    wethAmountWei: null,
    exactPlanKey: null,
    reviewer: null,
  },
  factory: profile.contracts.factory,
  router: profile.contracts.router,
  wrappedNative: profile.contracts.wrappedNative,
};
