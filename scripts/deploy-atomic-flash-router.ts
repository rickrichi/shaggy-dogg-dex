#!/usr/bin/env tsx
/**
 * Deploy AtomicFlashArbitrageRouter to Base Mainnet
 * Sets admin = 0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98 (User's Wallet)
 */

import fs from "node:fs";
import path from "node:path";

import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const BASE_AAVE_POOL: Address = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const USER_ADMIN: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

async function main() {
  console.log("=================================================");
  console.log("   DEPLOYING ATOMIC FLASH ARBITRAGE ROUTER       ");
  console.log("   Network: Base Mainnet (Chain ID 8453)         ");
  console.log("=================================================\n");

  const artifactPath = path.resolve(process.cwd(), "contracts/out/AtomicFlashArbitrageRouter.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Run 'npm run contracts:compile' first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Check private key
  const rawKey = process.env.PRIVATE_KEY;
  if (!rawKey || !/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error(
      "Set PRIVATE_KEY in the environment (for example: node --env-file=.env.deployer ...). Never hardcode keys."
    );
  }
  const privateKey = rawKey as Hex;
  const account = privateKeyToAccount(privateKey);

  console.log(`Deployer Account : ${account.address}`);
  console.log(`Assigned Admin   : ${USER_ADMIN}`);
  console.log(`Aave v3 Pool     : ${BASE_AAVE_POOL}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer Balance : ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer account has 0 ETH. Fund with ~$0.50 ETH on Base.");
  }

  console.log("\nBroadcasting deployment transaction to Base L2...");

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args: [BASE_AAVE_POOL, USER_ADMIN],
  });

  console.log(`Transaction broadcast: https://basescan.org/tx/${hash}`);
  console.log("Waiting for receipt confirmation on Base...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("Deployment transaction reverted or failed to return contract address.");
  }

  const deployedAddress = receipt.contractAddress;
  console.log(`\n=================================================`);
  console.log(`🎉 SUCCESS! AtomicFlashArbitrageRouter deployed:`);
  console.log(`Contract Address : ${deployedAddress}`);
  console.log(`Basescan Link    : https://basescan.org/address/${deployedAddress}`);
  console.log(`Admin (100% Owner): ${USER_ADMIN}`);
  console.log(`Gas Used         : ${receipt.gasUsed.toString()} gas`);
  console.log(`=================================================\n`);

  // Update default in Arbitrage.tsx if desired or print instructions
  return deployedAddress;
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err.message);
  process.exit(1);
});
