#!/usr/bin/env tsx
/**
 * Deploy V3PositionTimelock to Base Mainnet (Chain ID 8453)
 * Non-custodial sovereign timelock for Uniswap V3 Position NFTs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  type Hex,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const V3_POSITION_MANAGER: Address = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const ADMIN: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  console.log("=================================================");
  console.log("   DEPLOYING V3 POSITION TIMELOCK (BASE MAINNET) ");
  console.log("=================================================");
  console.log(`Position Manager   : ${V3_POSITION_MANAGER}`);
  console.log(`Deployer / Owner   : ${ADMIN}`);
  console.log(`Mode               : ${isDryRun ? "SIMULATION (DRY RUN)" : "LIVE BROADCAST"}`);
  console.log("-------------------------------------------------");

  const artifactPath = path.resolve(__dirname, "../contracts/out/V3PositionTimelock.sol/V3PositionTimelock.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Run 'forge build --root contracts' first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as Hex,
    args: [V3_POSITION_MANAGER],
  });

  const codeHash = keccak256(deployData);
  console.log(`Creation Code Hash : ${codeHash}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org", { timeout: 15_000 }),
  });

  let rawKey = process.env.PRIVATE_KEY;
  if (!rawKey) {
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, "utf-8").match(/PRIVATE_KEY=([0-9a-fA-F]{64}|0x[0-9a-fA-F]{64})/);
      if (match) {
        rawKey = match[1];
      }
    }
  }

  if (!rawKey) {
    throw new Error("PRIVATE_KEY not found in environment or .env file.");
  }

  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
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
    console.log("To broadcast to Base Mainnet, run with --yes.");
    return;
  }

  if (!process.argv.includes("--yes")) {
    throw new Error("Refusing to broadcast to Base mainnet without --yes (run with --dry-run to preview).");
  }

  console.log("Broadcasting deployment transaction to Base Mainnet...");

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org", { timeout: 15_000 }),
  });

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as Hex,
    args: [V3_POSITION_MANAGER],
  });

  console.log(`Transaction Hash   : ${hash}`);
  console.log(`View on Blockscout : https://base.blockscout.com/tx/${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`Deployment failed or missing contract address. Status: ${receipt.status}`);
  }

  console.log("\n🎉 DEPLOYMENT SUCCESSFUL!");
  console.log(`Contract Address   : ${receipt.contractAddress}`);
  console.log(`Block Number       : ${receipt.blockNumber.toString()}`);
  console.log(`Gas Used           : ${receipt.gasUsed.toString()}`);
  console.log(`View on BaseScan   : https://basescan.org/address/${receipt.contractAddress}`);
  console.log(`View on Blockscout : https://base.blockscout.com/address/${receipt.contractAddress}`);

  // Save deployment artifact to config
  const deployedInfo = {
    address: receipt.contractAddress,
    transactionHash: hash,
    blockNumber: Number(receipt.blockNumber),
    deployedAt: new Date().toISOString(),
    network: "base",
    chainId: 8453,
    positionManager: V3_POSITION_MANAGER,
    deployer: account.address,
  };

  const outDir = path.resolve(__dirname, "../src/config/dex");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(path.resolve(outDir, "timelock-deployment.json"), JSON.stringify(deployedInfo, null, 2));
  console.log(`Saved deployment info to src/config/dex/timelock-deployment.json`);
}

main().catch((err) => {
  console.error("❌ Deployment error:", err);
  process.exit(1);
});
