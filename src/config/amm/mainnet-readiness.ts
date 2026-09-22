import { getAmmProfile } from "./profiles";

import type { Address } from "viem";

export const MAINNET_READINESS_SCHEMA_VERSION = 1 as const;

export interface MainnetReleaseManifest {
  readonly schemaVersion: typeof MAINNET_READINESS_SCHEMA_VERSION;
  readonly releaseStatus: "BLOCKED";
  readonly protocol: "uniswap-v2";
  readonly execution: "DISABLED";
  readonly publicRpcEnvironmentVariable: "VITE_MAINNET_PUBLIC_RPC_URL";
  readonly factory: Address;
  readonly router: Address;
  readonly wrappedNative: Address;
  readonly sdToken: {
    readonly address: null;
    readonly sourceVerified: false;
    readonly externalAuditReference: null;
  };
  readonly blockers: readonly [
    "SD_TOKEN_NOT_DEPLOYED",
    "SD_TOKEN_SOURCE_NOT_VERIFIED",
    "INDEPENDENT_AUDIT_NOT_RECORDED",
    "MAINNET_EXECUTION_INTENTIONALLY_DISABLED",
  ];
}

/**
 * This manifest records the exact present posture. It must not be changed to
 * active merely by an environment variable, browser setting, or RPC response.
 */
const mainnet = getAmmProfile("mainnet");

if (!mainnet.contracts.factory || !mainnet.contracts.router || !mainnet.contracts.wrappedNative) {
  throw new Error("The mainnet Uniswap V2 profile must contain verified infrastructure addresses.");
}

export const MAINNET_RELEASE_MANIFEST: MainnetReleaseManifest = {
  schemaVersion: MAINNET_READINESS_SCHEMA_VERSION,
  releaseStatus: "BLOCKED",
  protocol: "uniswap-v2",
  execution: "DISABLED",
  publicRpcEnvironmentVariable: "VITE_MAINNET_PUBLIC_RPC_URL",
  factory: mainnet.contracts.factory,
  router: mainnet.contracts.router,
  wrappedNative: mainnet.contracts.wrappedNative,
  sdToken: {
    address: null,
    sourceVerified: false,
    externalAuditReference: null,
  },
  blockers: [
    "SD_TOKEN_NOT_DEPLOYED",
    "SD_TOKEN_SOURCE_NOT_VERIFIED",
    "INDEPENDENT_AUDIT_NOT_RECORDED",
    "MAINNET_EXECUTION_INTENTIONALLY_DISABLED",
  ],
};

export function isMainnetExecutionDisabled(): true {
  return true;
}
