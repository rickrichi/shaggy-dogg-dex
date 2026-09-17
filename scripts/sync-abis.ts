#!/usr/bin/env tsx
/**
 * Sync ABIs from Foundry artifacts to src/abi directory
 * Run after compiling contracts: npm run contracts:compile
 */

import { existsSync, mkdirSync, readdirSync,readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface ContractArtifact {
  abi: unknown[];
  bytecode: { object: string };
  deployedBytecode: { object: string };
  metadata?: string;
}

const CONTRACTS = ['GovernanceToken', 'FeeDiscountStaking'];
const FOUNDRY_OUT = './contracts/out';
const REMIX_SOURCE = './shaggy-dogg-sol_files'; // Fallback for Remix workflow
const TARGET_DIR = './src/abi';

async function syncFromFoundry() {
  console.log('🔍 Looking for Foundry artifacts...\n');

  let foundAny = false;

  for (const contract of CONTRACTS) {
    try {
      const artifactPath = join(FOUNDRY_OUT, `${contract}.sol`, `${contract}.json`);

      if (!existsSync(artifactPath)) {
        console.warn(`⏭️  ${contract}: No Foundry artifact found`);
        continue;
      }

      const artifact: ContractArtifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

      const targetPath = join(TARGET_DIR, `${contract}.json`);
      writeFileSync(targetPath, JSON.stringify(artifact.abi, null, 2));

      console.log(`✅ ${contract}: Synced from Foundry artifact`);
      foundAny = true;
    } catch (error) {
      console.error(`❌ ${contract}: Failed -`, (error as Error).message);
    }
  }

  return foundAny;
}

async function syncFromRemix() {
  console.log('🔍 Looking for Remix-compiled ABIs...\n');

  if (!existsSync(REMIX_SOURCE)) {
    console.warn('⚠️  No Remix source directory found');
    return false;
  }

  let foundAny = false;

  // Check if ABIs already exist in shaggy-dogg-sol_files
  for (const contract of CONTRACTS) {
    try {
      // Look for pre-compiled ABI in Remix folder
      const possiblePaths = [
        join(REMIX_SOURCE, `${contract}.abi.json`),
        join(REMIX_SOURCE, 'artifacts', `${contract}.json`),
      ];

      let abiData = null;

      for (const path of possiblePaths) {
        if (existsSync(path)) {
          const data = JSON.parse(readFileSync(path, 'utf-8'));
          abiData = Array.isArray(data) ? data : data.abi;
          break;
        }
      }

      if (!abiData) {
        console.warn(`⏭️  ${contract}: No Remix ABI found`);
        continue;
      }

      const targetPath = join(TARGET_DIR, `${contract}.json`);
      writeFileSync(targetPath, JSON.stringify(abiData, null, 2));

      console.log(`✅ ${contract}: Synced from Remix`);
      foundAny = true;
    } catch (error) {
      console.error(`❌ ${contract}: Failed -`, (error as Error).message);
    }
  }

  return foundAny;
}

async function syncExistingABIs() {
  console.log('🔍 Checking existing ABIs in src/abi...\n');

  if (!existsSync(TARGET_DIR)) {
    return false;
  }

  const files = readdirSync(TARGET_DIR).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.warn('⚠️  No existing ABIs found');
    return false;
  }

  console.log(`📝 Found ${files.length} existing ABI(s):`);
  files.forEach((f) => console.log(`   - ${f}`));
  console.log('');

  return true;
}

async function main() {
  console.log('🔄 ABI Synchronization Tool\n');
  console.log('='.repeat(50));
  console.log('');

  // Ensure target directory exists
  if (!existsSync(TARGET_DIR)) {
    mkdirSync(TARGET_DIR, { recursive: true });
    console.log(`📁 Created ${TARGET_DIR}\n`);
  }

  // Try each source in order
  let synced = false;

  // 1. Try Foundry first (recommended)
  if (existsSync(FOUNDRY_OUT)) {
    synced = await syncFromFoundry();
  }

  // 2. Fall back to Remix
  if (!synced) {
    console.log('\n💡 Foundry artifacts not found, trying Remix workflow...\n');
    synced = await syncFromRemix();
  }

  // 3. Check if ABIs already exist
  if (!synced) {
    console.log('\n💡 No new ABIs to sync, checking existing...\n');
    const hasExisting = await syncExistingABIs();

    if (!hasExisting) {
      console.log('');
      console.log('⚠️  No ABIs found from any source!\n');
      console.log('📝 To generate ABIs:\n');
      console.log('   Option 1 (Foundry):');
      console.log('     1. npm run contracts:compile');
      console.log('     2. npm run abi:sync\n');
      console.log('   Option 2 (Remix):');
      console.log('     1. Compile contracts in Remix');
      console.log('     2. Download ABIs to shaggy-dogg-sol_files/');
      console.log('     3. npm run abi:sync\n');
      process.exit(1);
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('✨ ABI sync complete!\n');
  console.log('💡 Next steps:');
  console.log('   - npm run abi:generate  (Generate Wagmi hooks)');
  console.log('   - npm run dev          (Start development)\n');
}

main().catch((error) => {
  console.error('\n❌ Sync failed:', error);
  process.exit(1);
});
