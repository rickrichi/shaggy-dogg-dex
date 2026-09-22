import { type Address, getAddress } from "viem";

import { type AmmProfile, hasAmmContractAddresses } from "@/config/amm/profiles";

const BPS_DENOMINATOR = 10_000n;
const MAX_SLIPPAGE_BPS = 1_000n;

export interface AmmAsset {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
}

export interface PairPlan {
  readonly kind: "AMM_PAIR_PLAN";
  readonly version: 1;
  readonly configurationVersion: AmmProfile["configurationVersion"];
  readonly submission: "DISABLED";
  readonly profileId: AmmProfile["id"];
  readonly chainId: AmmProfile["chainId"];
  readonly provider: AmmProfile["provider"];
  readonly canonicalPairKey: string;
  readonly token0: AmmAsset;
  readonly token1: AmmAsset;
  readonly action: "DISCOVER_EXISTING_PAIR" | "CONFIGURE_PROTOCOL_FIRST";
  readonly factory?: Address;
  readonly rationale: string;
}

export interface LiquidityPlan {
  readonly kind: "AMM_LIQUIDITY_PLAN";
  readonly version: 1;
  readonly configurationVersion: AmmProfile["configurationVersion"];
  readonly submission: "DISABLED";
  readonly planKey: string;
  readonly profileId: AmmProfile["id"];
  readonly chainId: AmmProfile["chainId"];
  readonly provider: AmmProfile["provider"];
  readonly pair: PairPlan;
  readonly amount0Desired: bigint;
  readonly amount1Desired: bigint;
  readonly amount0Minimum: bigint;
  readonly amount1Minimum: bigint;
  readonly slippageBps: bigint;
  readonly approvals: readonly [];
  readonly requiredNextStep: string;
}

export interface BuildLiquidityPlanInput {
  readonly profile: AmmProfile;
  readonly tokenA: AmmAsset;
  readonly tokenB: AmmAsset;
  readonly amountADesired: bigint;
  readonly amountBDesired: bigint;
  readonly slippageBps: bigint;
}

function normalizeAsset(asset: AmmAsset): AmmAsset {
  if (!asset.symbol.trim()) throw new Error("AMM asset symbol is required.");
  if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
    throw new Error(`Invalid decimals for ${asset.symbol}.`);
  }

  return { ...asset, address: getAddress(asset.address) };
}

function sortAssets(tokenA: AmmAsset, tokenB: AmmAsset): readonly [AmmAsset, AmmAsset, boolean] {
  const normalizedA = normalizeAsset(tokenA);
  const normalizedB = normalizeAsset(tokenB);
  if (normalizedA.address.toLowerCase() === normalizedB.address.toLowerCase()) {
    throw new Error("An AMM pair requires two distinct token addresses.");
  }

  return BigInt(normalizedA.address) < BigInt(normalizedB.address)
    ? [normalizedA, normalizedB, true]
    : [normalizedB, normalizedA, false];
}

function minimumAfterSlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
}

function assertPlanOnly(profile: AmmProfile): void {
  if (profile.executionMode !== "plan-only") {
    throw new Error("AMM execution is not available through the plan builder.");
  }
  if (profile.supportsPairCreation || profile.supportsLiquiditySubmission) {
    throw new Error(
      "AMM plan profiles must not grant pair-creation or liquidity-submission authority."
    );
  }
}

export function buildPairPlan(profile: AmmProfile, tokenA: AmmAsset, tokenB: AmmAsset): PairPlan {
  assertPlanOnly(profile);
  const [token0, token1] = sortAssets(tokenA, tokenB);
  const contractsConfigured = hasAmmContractAddresses(profile);
  const canonicalPairKey = [
    profile.configurationVersion,
    profile.chainId,
    token0.address.toLowerCase(),
    token1.address.toLowerCase(),
  ].join(":");

  return {
    kind: "AMM_PAIR_PLAN",
    version: 1,
    configurationVersion: profile.configurationVersion,
    submission: "DISABLED",
    profileId: profile.id,
    chainId: profile.chainId,
    provider: profile.provider,
    canonicalPairKey,
    token0,
    token1,
    action:
      profile.supportsPairDiscovery && contractsConfigured
        ? "DISCOVER_EXISTING_PAIR"
        : "CONFIGURE_PROTOCOL_FIRST",
    ...(contractsConfigured ? { factory: profile.contracts.factory } : {}),
    rationale: contractsConfigured
      ? "The plan can perform read-only pair discovery only. It cannot create a pair."
      : "Select and verify an AMM deployment before any pair discovery can be planned.",
  };
}

export function buildLiquidityPlan(input: BuildLiquidityPlanInput): LiquidityPlan {
  const { profile, tokenA, tokenB, amountADesired, amountBDesired, slippageBps } = input;
  assertPlanOnly(profile);
  if (amountADesired <= 0n || amountBDesired <= 0n) {
    throw new Error("Liquidity plan amounts must both be greater than zero.");
  }
  if (slippageBps < 0n || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error(`Slippage must be between 0 and ${MAX_SLIPPAGE_BPS} basis points.`);
  }

  const pair = buildPairPlan(profile, tokenA, tokenB);
  const tokenAIsToken0 =
    pair.token0.address.toLowerCase() === getAddress(tokenA.address).toLowerCase();
  const amount0Desired = tokenAIsToken0 ? amountADesired : amountBDesired;
  const amount1Desired = tokenAIsToken0 ? amountBDesired : amountADesired;
  const amount0Minimum = minimumAfterSlippage(amount0Desired, slippageBps);
  const amount1Minimum = minimumAfterSlippage(amount1Desired, slippageBps);
  const planKey = [
    pair.canonicalPairKey,
    amount0Desired.toString(),
    amount1Desired.toString(),
    amount0Minimum.toString(),
    amount1Minimum.toString(),
    slippageBps.toString(),
  ].join(":");

  return {
    kind: "AMM_LIQUIDITY_PLAN",
    version: 1,
    configurationVersion: profile.configurationVersion,
    submission: "DISABLED",
    planKey,
    profileId: profile.id,
    chainId: profile.chainId,
    provider: profile.provider,
    pair,
    amount0Desired,
    amount1Desired,
    amount0Minimum,
    amount1Minimum,
    slippageBps,
    approvals: [],
    requiredNextStep:
      "Review this deterministic preview. Pair creation, token approvals, and liquidity submission are disabled in every AMM profile.",
  };
}
