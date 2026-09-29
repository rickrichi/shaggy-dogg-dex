// Auto-generated from deployments/ - DO NOT EDIT MANUALLY
// Last updated: 2026-09-29T09:19:46.599Z

import type { Address } from 'viem';

export interface DeployedContracts {
  GovernanceToken: Address;
  FeeDiscountStaking: Address;
  AaveFlashBorrower?: Address;
  YieldStakingVault?: Address;
  CompoundYieldVault?: Address;
  UniswapV2Pair_SD_WETH?: Address;
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
    "GovernanceToken": "0x051c758521971f5c5a84edaf18eea12854375469",
    "FeeDiscountStaking": "0x42134ccc6c41149cf71c7b4994e33ee66758af20",
    "AaveFlashBorrower": "0xa5b50037a8d2fda22805f750252268adaeb36480",
    "YieldStakingVault": "0x8531807ef36560cd7db230c95db85791aa586dda",
    "CompoundYieldVault": "0x38cccafb4ae96a8ef187f07fb17d18eb63e43782",
    "UniswapV2Pair_SD_WETH": "0x63D504336d01BcCa615B23AD393E5812Dc646BF8",
    "deployedAt": 1790673576071,
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
