import {
  LUMIORO_MAINNET_RELEASE,
  type LumioroReleaseBlocker,
  releaseBlockersFor,
} from "@/config/amm/lumioro-mainnet-release";
import { getAmmProfile } from "@/config/amm/profiles";

import { buildLiquidityPlan } from "./plans";

import type { AmmAsset, LiquidityPlan } from "./plans";

export interface BuildLumioroLiquidityReviewInput {
  readonly wethAmountDesired: bigint;
  readonly slippageBps: 0n;
}

export interface LumioroLiquidityReview {
  readonly kind: "LUMIORO_UNISWAP_V2_LIQUIDITY_REVIEW";
  readonly execution: "DISABLED";
  readonly reviewStatus: "REQUIRES_HUMAN_REVIEW";
  readonly plan: LiquidityPlan;
  readonly blockers: readonly LumioroReleaseBlocker[];
}

const LUMIORO: AmmAsset = {
  address: LUMIORO_MAINNET_RELEASE.token.address,
  symbol: LUMIORO_MAINNET_RELEASE.token.symbol,
  decimals: 18,
};

const WETH: AmmAsset = {
  address: LUMIORO_MAINNET_RELEASE.wrappedNative,
  symbol: "WETH",
  decimals: 18,
};

/**
 * Builds only a deterministic first-pair review artifact. The approved
 * envelope requires the fixed LUMIORO inventory, a selected WETH amount, and
 * zero slippage so the minimums equal the desired amounts.
 */
export function buildLumioroLiquidityReview(
  input: BuildLumioroLiquidityReviewInput
): LumioroLiquidityReview {
  const envelope = LUMIORO_MAINNET_RELEASE.liquidityEnvelope;
  if (
    input.wethAmountDesired < envelope.minimumWethWei ||
    input.wethAmountDesired > envelope.maximumWethWei
  ) {
    throw new Error("LUMIORO/WETH amount must be between 0.02 and 22.5 ETH.");
  }

  return {
    kind: "LUMIORO_UNISWAP_V2_LIQUIDITY_REVIEW",
    execution: "DISABLED",
    reviewStatus: "REQUIRES_HUMAN_REVIEW",
    plan: buildLiquidityPlan({
      profile: getAmmProfile("mainnet"),
      tokenA: LUMIORO,
      tokenB: WETH,
      amountADesired: envelope.lumioroAmountBaseUnits,
      amountBDesired: input.wethAmountDesired,
      slippageBps: input.slippageBps,
    }),
    blockers: releaseBlockersFor(LUMIORO_MAINNET_RELEASE),
  };
}
