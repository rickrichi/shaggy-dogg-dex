import {
  LUMIORO_MAINNET_RELEASE,
  releaseBlockersFor,
} from "@/config/amm/lumioro-mainnet-release";

/**
 * Static evidence only. No RPC call, wallet read, approval, or transaction is
 * available through this release gate.
 */
export function getLumioroMainnetEvidenceGateReport() {
  return {
    ...LUMIORO_MAINNET_RELEASE,
    blockers: releaseBlockersFor(LUMIORO_MAINNET_RELEASE),
  };
}

export function canSubmitLumioroMainnetLiquidity(): false {
  return false;
}
