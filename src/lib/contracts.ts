// Auto-generated from deployments/ - DO NOT EDIT MANUALLY
// Last updated: 2026-09-29T08:00:00.619Z

import type { Address } from 'viem';

export interface DeployedContracts {
  GovernanceToken: Address;
  FeeDiscountStaking: Address;
  AaveFlashBorrower?: Address;
  YieldStakingVault?: Address;
  CompoundYieldVault?: Address;
  deployedAt: number;
  deployer: Address;
}

export const CONTRACTS: Record<number, DeployedContracts> = {
  "31337": {
    "GovernanceToken": "0x0000000000000000000000000000000000000000",
    "FeeDiscountStaking": "0x0000000000000000000000000000000000000000",
    "deployedAt": 0,
    "deployer": "0x0000000000000000000000000000000000000000"
  },
  "84532": {
    "GovernanceToken": "0x8453200000000000000000000000000000000001",
    "FeeDiscountStaking": "0x8453200000000000000000000000000000000002",
    "AaveFlashBorrower": "0x8453200000000000000000000000000000000003",
    "YieldStakingVault": "0x8453200000000000000000000000000000000004",
    "CompoundYieldVault": "0x8453200000000000000000000000000000000005",
    "deployedAt": 1790668654215,
    "deployer": "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B"
  },
  "11155111": {
    "GovernanceToken": "0x0000000000000000000000000000000000000000",
    "FeeDiscountStaking": "0x0000000000000000000000000000000000000000",
    "deployedAt": 0,
    "deployer": "0x0000000000000000000000000000000000000000"
  }
} as const;

/**
 * Get all deployed contracts for a specific chain
 */
export function getContracts(chainId: number): DeployedContracts | undefined {
  return CONTRACTS[chainId];
}

/**
 * Get a specific contract address for a chain
 */
export function getContractAddress(
  chainId: number,
  contract: keyof Omit<DeployedContracts, 'deployedAt' | 'deployer'>
): Address | undefined {
  return CONTRACTS[chainId]?.[contract] as Address | undefined;
}

/**
 * Check if contracts are deployed on a specific chain
 */
export function isDeployedOnChain(chainId: number): boolean {
  return chainId in CONTRACTS;
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChains(): number[] {
  return Object.keys(CONTRACTS).map(Number);
}

/**
 * Get chain name from ID (common chains)
 */
export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum Mainnet',
    11155111: 'Sepolia Testnet',
    8453: 'Base',
    84532: 'Base Sepolia',
    42161: 'Arbitrum One',
    421614: 'Arbitrum Sepolia',
    31337: 'Localhost',
  };
  return names[chainId] || `Chain ${chainId}`;
}
