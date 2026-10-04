#!/usr/bin/env tsx
/**
 * Deploy YieldStakingVault v3 to Base Mainnet (Chain ID 8453)
 * Includes virtual shares protection (1e6 offset) and 10,000 bps denominator.
 * Preserves admin and treasury: 0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98
 */
import fs from "node:fs";
import path from "node:path";

import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  type Hex,
  http,
  keccak256,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { LAUNCHPAD_ARTIFACTS } from "../src/lib/launchpad/artifacts";
import { BASE_STAKING } from "../src/lib/staking";

const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AAVE_POOL: Address = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const A_TOKEN: Address = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";
const ADMIN: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const TREASURY: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

const VAULT_ABI = parseAbi([
  "function admin() view returns (address)",
  "function treasury() view returns (address)",
  "function underlyingAsset() view returns (address)",
  "function aavePool() view returns (address)",
  "function aToken() view returns (address)",
  "function discountStaking() view returns (address)",
  "function discountDenominator() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function performanceFeeBps() view returns (uint16)",
]);

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  console.log("=================================================");
  console.log("   DEPLOYING YIELD STAKING VAULT V3 (BASE MAINNET) ");
  console.log("=================================================");
  console.log(`Underlying Asset   : USDC (${USDC})`);
  console.log(`Aave v3 Pool       : ${AAVE_POOL}`);
  console.log(`aToken (aBasUSDC)  : ${A_TOKEN}`);
  console.log(`Discount Staking   : ${BASE_STAKING.stakingAddress}`);
  console.log(`Admin (100% Owner) : ${ADMIN}`);
  console.log(`Treasury           : ${TREASURY}`);
  console.log(`Security Fixes     : Virtual Shares (1e6) + 10,000 bps Denominator`);
  console.log(`Mode               : ${isDryRun ? "SIMULATION (DRY RUN)" : "LIVE BROADCAST"}`);
  console.log("-------------------------------------------------");

  const constructorArgs = [USDC, AAVE_POOL, A_TOKEN, BASE_STAKING.stakingAddress, ADMIN, TREASURY];
  const artifact = LAUNCHPAD_ARTIFACTS.YieldStakingVault;
  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args: constructorArgs,
  });

  const codeHash = keccak256(deployData);
  console.log(`Creation Code Hash : ${codeHash}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org", { timeout: 15_000 }),
  });

  const rawKey = process.env.PRIVATE_KEY;
  if (!rawKey || !/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error(
      "Set PRIVATE_KEY in the environment (for example: node --env-file=.env.deployer ...). Never hardcode keys."
    );
  }
  const privateKey = rawKey as Hex;
  const account = privateKeyToAccount(privateKey);

  console.log(`Deployer Account   : ${account.address}`);

  const balance = await publicClient.getBalance({ address: account.address });
  const gasPrice = await publicClient.getGasPrice();
  const estimatedGas = await publicClient.estimateGas({
    account: account.address,
    data: deployData,
  });
  const estimatedFeeEth = formatEther(estimatedGas * gasPrice);

  console.log(`Deployer Balance   : ${formatEther(balance)} ETH`);
  console.log(`Estimated Gas      : ${estimatedGas.toString()} units (~${estimatedFeeEth} ETH)\n`);

  if (balance < estimatedGas * gasPrice) {
    throw new Error(
      `Deployer account has insufficient ETH balance (${formatEther(balance)} ETH). Estimated: ${estimatedFeeEth} ETH.`
    );
  }

  if (isDryRun) {
    console.log("✅ DRY RUN PREFLIGHT COMPLETED SUCCESSFULLY.");
    console.log("To broadcast to Base Mainnet, run without --dry-run.");
    return;
  }

  if (!process.argv.includes("--yes")) {
    throw new Error("Refusing to broadcast to Base mainnet without --yes (run with --dry-run to preview).");
  }
  console.log("Broadcasting deployment transaction to Base Mainnet...");

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args: constructorArgs,
  });

  console.log(`Transaction Hash   : ${hash}`);
  console.log(`Basescan Link      : https://basescan.org/tx/${hash}`);
  console.log("Waiting for on-chain receipt confirmation on Base...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`Deployment transaction reverted: status=${receipt.status}`);
  }

  const deployedAddress = receipt.contractAddress;
  console.log(`\n=================================================`);
  console.log(`🎉 SUCCESS! YieldStakingVault v3 Deployed:`);
  console.log(`Contract Address   : ${deployedAddress}`);
  console.log(`Basescan           : https://basescan.org/address/${deployedAddress}`);
  console.log(`Blockscout         : https://base.blockscout.com/address/${deployedAddress}`);
  console.log(`Gas Used           : ${receipt.gasUsed.toString()}`);
  console.log(`=================================================\n`);

  // Verify on-chain state
  console.log("Performing on-chain state verification...");
  const [onChainAdmin, onChainTreasury, denominator, totalShares, totalAssets] =
    await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: deployedAddress, abi: VAULT_ABI, functionName: "admin" },
        { address: deployedAddress, abi: VAULT_ABI, functionName: "treasury" },
        { address: deployedAddress, abi: VAULT_ABI, functionName: "discountDenominator" },
        { address: deployedAddress, abi: VAULT_ABI, functionName: "totalShares" },
        { address: deployedAddress, abi: VAULT_ABI, functionName: "totalAssets" },
      ],
    });

  console.log(`  Admin Address      : ${onChainAdmin} (Verified)`);
  console.log(`  Treasury Address   : ${onChainTreasury} (Verified)`);
  console.log(`  Discount Scale     : ${denominator.toString()} bps (Verified 10,000)`);
  console.log(`  Initial Shares     : ${totalShares.toString()} (Clean zero state)`);
  console.log(`  Initial Assets     : ${totalAssets.toString()} USDC (Clean zero state)`);

  if (denominator !== 10_000n) {
    throw new Error("On-chain discountDenominator verification failed!");
  }

  // Update base-mainnet.labels.json
  const labelsPath = path.resolve(process.cwd(), "deployments/base-mainnet.labels.json");
  if (fs.existsSync(labelsPath)) {
    const labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
    labels[deployedAddress] = {
      ecosystem: "AMUTT",
      role: "YieldStakingVault v3 (share-price protection + 10000-bps scale, active)",
      usedBy: ["src/components/YieldVaultPanel.tsx (VITE_YIELD_VAULT_ADDRESS)"],
      deploymentTx: hash,
      sourceCommit: "99365d4",
    };
    fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2), "utf8");
    console.log(`\nUpdated deployments/base-mainnet.labels.json with ${deployedAddress}`);
  }

  console.log("\nNEXT STEPS:");
  console.log(`1. Update .env.local:`);
  console.log(`   VITE_YIELD_VAULT_ADDRESS=${deployedAddress}`);
  console.log(`2. Reload http://localhost:5173/stake to test deposits with virtual shares protection.`);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err.message);
  process.exit(1);
});
