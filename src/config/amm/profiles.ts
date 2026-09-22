import { type Address, getAddress } from "viem";

export const AMM_PROFILE_IDS = ["local", "sepolia", "mainnet"] as const;
export type AmmProfileId = (typeof AMM_PROFILE_IDS)[number];

export type AmmProvider = "unconfigured" | "uniswap-v2" | "shaggy-dogg-v2";
export type AmmExecutionMode = "plan-only";

export interface AmmContracts {
  readonly factory?: Address;
  readonly router?: Address;
  readonly wrappedNative?: Address;
}

export interface AmmProfile {
  readonly configurationVersion: 1;
  readonly id: AmmProfileId;
  readonly chainId: 1 | 11155111 | 31337;
  readonly chainName: string;
  readonly provider: AmmProvider;
  readonly executionMode: AmmExecutionMode;
  readonly contracts: AmmContracts;
  readonly supportsPairDiscovery: boolean;
  readonly supportsPairCreation: false;
  readonly supportsLiquiditySubmission: false;
  readonly rpcEnvironmentVariable?: "AMM_FORK_RPC_URL";
  readonly note: string;
}

const address = (value: string): Address => getAddress(value);

/**
 * Public, versioned AMM profiles. Callers must select one explicitly.
 * Every profile is plan-only; addresses never grant execution authority.
 */
export const AMM_PROFILES: Readonly<Record<AmmProfileId, AmmProfile>> = {
  local: {
    configurationVersion: 1,
    id: "local",
    chainId: 31337,
    chainName: "Anvil local fork",
    provider: "shaggy-dogg-v2",
    executionMode: "plan-only",
    contracts: {},
    supportsPairDiscovery: false,
    supportsPairCreation: false,
    supportsLiquiditySubmission: false,
    rpcEnvironmentVariable: "AMM_FORK_RPC_URL",
    note: "Local configuration only. Addresses are produced by an isolated test deployment and must never be promoted automatically.",
  },
  sepolia: {
    configurationVersion: 1,
    id: "sepolia",
    chainId: 11155111,
    chainName: "Ethereum Sepolia",
    provider: "unconfigured",
    executionMode: "plan-only",
    contracts: {},
    supportsPairDiscovery: false,
    supportsPairCreation: false,
    supportsLiquiditySubmission: false,
    note: "No AMM address is trusted by default. Choose a protocol and verify its deployment record before enabling read-only discovery.",
  },
  mainnet: {
    configurationVersion: 1,
    id: "mainnet",
    chainId: 1,
    chainName: "Ethereum Mainnet",
    provider: "uniswap-v2",
    executionMode: "plan-only",
    contracts: {
      factory: address("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"),
      router: address("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"),
      wrappedNative: address("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    },
    supportsPairDiscovery: true,
    supportsPairCreation: false,
    supportsLiquiditySubmission: false,
    rpcEnvironmentVariable: "AMM_FORK_RPC_URL",
    note: "Read-only reference to the canonical Uniswap V2 deployment. Pair creation and liquidity submission are intentionally disabled.",
  },
} as const;

export function isAmmProfileId(value: unknown): value is AmmProfileId {
  return typeof value === "string" && AMM_PROFILE_IDS.includes(value as AmmProfileId);
}

export function getAmmProfile(profileId: AmmProfileId): AmmProfile {
  return AMM_PROFILES[profileId];
}

export function hasAmmContractAddresses(profile: AmmProfile): profile is AmmProfile & {
  readonly contracts: Required<AmmContracts>;
} {
  return Boolean(
    profile.contracts.factory && profile.contracts.router && profile.contracts.wrappedNative
  );
}
