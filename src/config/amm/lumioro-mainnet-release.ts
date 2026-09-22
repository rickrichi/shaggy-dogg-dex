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

export type IndependentAuditEvidence = PassedIndependentAudit | UnlinkedIndependentAudit;

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
  independentAudit: {
    status: "ASSERTED_REPORT_NOT_LINKED",
    claimedAuditor: "Tanaka Minato",
    reportUrl: null,
    reportSha256: null,
    scopedSourceCommit: null,
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
