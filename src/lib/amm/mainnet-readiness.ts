import {
  type Address,
  getAddress,
  type PublicClient,
  zeroAddress,
} from "viem";

import {
  MAINNET_RELEASE_MANIFEST,
  type MainnetReleaseManifest,
} from "@/config/amm/mainnet-readiness";
import { getAmmProfile } from "@/config/amm/profiles";

import {
  type AmmAsset,
  buildLiquidityPlan,
  type LiquidityPlan,
} from "./plans";

const UNISWAP_V2_FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    outputs: [{ name: "pair", type: "address" }],
  },
] as const;

export interface MainnetReadinessReport {
  readonly releaseStatus: MainnetReleaseManifest["releaseStatus"];
  readonly execution: MainnetReleaseManifest["execution"];
  readonly protocol: MainnetReleaseManifest["protocol"];
  readonly blockers: MainnetReleaseManifest["blockers"];
  readonly publicRpcEnvironmentVariable: MainnetReleaseManifest["publicRpcEnvironmentVariable"];
}

export interface ReadOnlyPairDiscovery {
  readonly kind: "UNISWAP_V2_PAIR_DISCOVERY";
  readonly execution: "DISABLED";
  readonly factory: Address;
  readonly token0: Address;
  readonly token1: Address;
  readonly pair: Address | null;
}

export interface SdLiquidityReview {
  readonly kind: "SD_UNISWAP_V2_LIQUIDITY_REVIEW";
  readonly execution: "DISABLED";
  readonly plan: LiquidityPlan;
  readonly reviewStatus: "REQUIRES_HUMAN_REVIEW";
  readonly blockers: MainnetReleaseManifest["blockers"];
}

export interface BuildSdLiquidityReviewInput {
  readonly sdToken: AmmAsset;
  readonly wethAmountDesired: bigint;
  readonly sdAmountDesired: bigint;
  readonly slippageBps: bigint;
}

const WETH: AmmAsset = {
  address: MAINNET_RELEASE_MANIFEST.wrappedNative,
  symbol: "WETH",
  decimals: 18,
};

function canonicalOrder(tokenA: Address, tokenB: Address): readonly [Address, Address] {
  const normalizedA = getAddress(tokenA);
  const normalizedB = getAddress(tokenB);
  if (normalizedA.toLowerCase() === normalizedB.toLowerCase()) {
    throw new Error("Pair discovery requires two distinct token addresses.");
  }

  return BigInt(normalizedA) < BigInt(normalizedB)
    ? [normalizedA, normalizedB]
    : [normalizedB, normalizedA];
}

/** A static report: no RPC call and no environment flag can remove these blocks. */
export function getMainnetReadinessReport(): MainnetReadinessReport {
  return {
    releaseStatus: MAINNET_RELEASE_MANIFEST.releaseStatus,
    execution: MAINNET_RELEASE_MANIFEST.execution,
    protocol: MAINNET_RELEASE_MANIFEST.protocol,
    blockers: MAINNET_RELEASE_MANIFEST.blockers,
    publicRpcEnvironmentVariable: MAINNET_RELEASE_MANIFEST.publicRpcEnvironmentVariable,
  };
}

/** Performs one view call only. It cannot create a pair, approve a token, or submit liquidity. */
export async function discoverUniswapV2Pair(
  publicClient: PublicClient,
  tokenA: Address,
  tokenB: Address
): Promise<ReadOnlyPairDiscovery> {
  const profile = getAmmProfile("mainnet");
  const [token0, token1] = canonicalOrder(tokenA, tokenB);

  if (!profile.contracts.factory) {
    throw new Error("Mainnet Uniswap V2 factory configuration is missing.");
  }

  const pair = await publicClient.readContract({
    address: profile.contracts.factory,
    abi: UNISWAP_V2_FACTORY_ABI,
    functionName: "getPair",
    args: [token0, token1],
  });

  return {
    kind: "UNISWAP_V2_PAIR_DISCOVERY",
    execution: "DISABLED",
    factory: profile.contracts.factory,
    token0,
    token1,
    pair: pair === zeroAddress ? null : pair,
  };
}

/**
 * Produces an exact, deterministic review artifact. It does not inspect a
 * wallet, request an approval, or construct a transaction.
 */
export function buildSdLiquidityReview(
  input: BuildSdLiquidityReviewInput
): SdLiquidityReview {
  const plan = buildLiquidityPlan({
    profile: getAmmProfile("mainnet"),
    tokenA: input.sdToken,
    tokenB: WETH,
    amountADesired: input.sdAmountDesired,
    amountBDesired: input.wethAmountDesired,
    slippageBps: input.slippageBps,
  });

  return {
    kind: "SD_UNISWAP_V2_LIQUIDITY_REVIEW",
    execution: "DISABLED",
    plan,
    reviewStatus: "REQUIRES_HUMAN_REVIEW",
    blockers: MAINNET_RELEASE_MANIFEST.blockers,
  };
}
