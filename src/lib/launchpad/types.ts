// src/lib/launchpad/types.ts
import type { Address } from "viem";

export type ArchetypeId =
  | "standard_governance"
  | "staking_rewards"
  | "moonwell_lending"
  | "morpho_blue_isolated"
  | "silo_isolated_vault"
  | "aave_v3_yield"
  | "fluid_hybrid_amm"
  | "full_defi_suite";

export type DexVenueId = "uniswap_v2" | "pancakeswap_v2" | "aerodrome";

export type DeploymentExecutionMode = "metamask" | "deployer_worker";

export interface ArchetypeDefinition {
  id: ArchetypeId;
  name: string;
  category: "Standard" | "Staking & Loyalty" | "Next-Gen Lending" | "Isolated Risk" | "Full Suite";
  badge: string;
  description: string;
  architectureDetails: string;
  protocolsReferenced: string[];
  contractsDeployed: string[];
  riskContagionModel: "Pooled" | "Isolated" | "Sovereign" | "None";
}

export interface DexVenueDefinition {
  id: DexVenueId;
  name: string;
  routerAddress: Address;
  factoryAddress: Address;
  network: "Base Mainnet";
  description: string;
}

export interface LaunchpadFormState {
  // Step 1: Token Identity
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  initialSupply: string;
  description: string;

  // Step 2 & 3: Archetype & Money Market
  selectedArchetype: ArchetypeId;
  lendingMarketTarget?: string;
  performanceFeeBps: number;
  stakingLockDays: number;
  earlyUnstakeFeeBps: number;

  // Step 4: Multi-DEX Liquidity Seeding
  enableDexSeeding: boolean;
  selectedDex: DexVenueId;
  pairAsset: "ETH" | "USDC";
  initialEthLiquidity: string;
  initialTokenLiquidityPercent: number; // e.g. 50%

  // Step 5: Execution Mode
  executionMode: DeploymentExecutionMode;
  recipientAdminAddress: string;
}

export interface DeployedEcosystemResult {
  tokenAddress: Address;
  stakingAddress?: Address | undefined;
  vaultAddress?: Address | undefined;
  borrowerAddress?: Address | undefined;
  pairAddress?: Address | undefined;
  txHash: string;
  deploymentMode: DeploymentExecutionMode;
  archetype: ArchetypeId;
}
