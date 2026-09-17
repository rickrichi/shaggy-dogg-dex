#!/usr/bin/env tsx
/**
 * Update contract addresses from deployment artifacts
 * Run after deploying contracts
 */

import { existsSync, readdirSync,readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface DeploymentInfo {
  chainId: number;
  timestamp: number;
  blockNumber: number;
  deployer: string;
  contracts: {
    GovernanceToken: string;
    FeeDiscountStaking: string;
  };
}

type ContractsConfig = Record<number, {
  GovernanceToken: string;
  FeeDiscountStaking: string;
  deployedAt: number;
  deployer: string;
}>;

const DEPLOYMENTS_DIR = './deployments';
const OUTPUT_FILE = './src/lib/contracts.ts';

async function loadDeployments(): Promise<ContractsConfig> {
  console.log('🔍 Loading deployment artifacts...\n');

  if (!existsSync(DEPLOYMENTS_DIR)) {
    console.warn('⚠️  Deployments directory not found');
    return {};
  }

  const files = readdirSync(DEPLOYMENTS_DIR).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.warn('⚠️  No deployment files found');
    return {};
  }

  const config: ContractsConfig = {};

  for (const file of files) {
    try {
      const path = join(DEPLOYMENTS_DIR, file);
      const deployment: DeploymentInfo = JSON.parse(readFileSync(path, 'utf-8'));

      config[deployment.chainId] = {
        GovernanceToken: deployment.contracts.GovernanceToken,
        FeeDiscountStaking: deployment.contracts.FeeDiscountStaking,
        deployedAt: deployment.timestamp,
        deployer: deployment.deployer,
      };

      const chainName = file.replace('.json', '');
      console.log(`✅ Loaded: ${chainName} (Chain ID: ${deployment.chainId})`);
      console.log(`   Token: ${deployment.contracts.GovernanceToken}`);
      console.log(`   Staking: ${deployment.contracts.FeeDiscountStaking}\n`);
    } catch (error) {
      console.error(`❌ Failed to load ${file}:`, (error as Error).message);
    }
  }

  return config;
}

function generateTypeScriptFile(config: ContractsConfig): string {
  const timestamp = new Date().toISOString();

  return `// Auto-generated from deployments/ - DO NOT EDIT MANUALLY
// Last updated: ${timestamp}

import { Address } from 'viem';

export interface DeployedContracts {
  GovernanceToken: Address;
  FeeDiscountStaking: Address;
  deployedAt: number;
  deployer: Address;
}

export const CONTRACTS: Record<number, DeployedContracts> = ${JSON.stringify(config, null, 2)} as const;

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
  return names[chainId] || \`Chain \${chainId}\`;
}
`;
}

async function main() {
  console.log('📝 Contract Address Update Tool\n');
  console.log('='.repeat(50));
  console.log('');

  const config = await loadDeployments();

  if (Object.keys(config).length === 0) {
    console.log('');
    console.log('⚠️  No deployments found!\n');
    console.log('📝 To create deployments:\n');
    console.log('   1. Deploy contracts:');
    console.log('      npm run contracts:deploy:local');
    console.log('      npm run contracts:deploy:sepolia\n');
    console.log('   2. Deployment info will be saved to deployments/\n');
    console.log('   3. Run this script again: npm run contracts:update\n');

    // Create placeholder file
    const placeholder = generateTypeScriptFile({});
    writeFileSync(OUTPUT_FILE, placeholder);
    console.log(`✅ Created placeholder: ${OUTPUT_FILE}\n`);

    process.exit(0);
  }

  const output = generateTypeScriptFile(config);
  writeFileSync(OUTPUT_FILE, output);

  console.log('');
  console.log('='.repeat(50));
  console.log(`✅ Updated: ${OUTPUT_FILE}\n`);
  console.log('📊 Summary:');
  console.log(`   - ${Object.keys(config).length} chain(s) configured`);
  console.log(`   - ${Object.keys(config).length * 2} contract(s) total\n`);
  console.log('💡 Next steps:');
  console.log('   - Verify addresses in src/lib/contracts.ts');
  console.log('   - Update frontend to use new addresses');
  console.log('   - Test with: npm run dev\n');
}

main().catch((error) => {
  console.error('\n❌ Update failed:', error);
  process.exit(1);
});
