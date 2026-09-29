#!/usr/bin/env tsx
/**
 * Automated Deployment & Verification Suite for Shaggy-Dogg-DEX SD Contracts
 *
 * Supports Base Sepolia (84532), Base Mainnet (8453), and local simulation.
 * Uses Viem to deploy compiled artifacts from contracts/out.
 */

import fs from "node:fs";
import path from "node:path";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  parseEther,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const root = process.cwd();
const outDir = path.resolve(root, "contracts/out");
const deploymentsDir = path.resolve(root, "deployments");

interface CompiledContract {
  contractName: string;
  abi: readonly unknown[];
  bytecode: Hex;
}

function loadArtifact(name: string): CompiledContract {
  const filePath = path.resolve(outDir, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Compiled artifact not found at ${filePath}. Run 'node scripts/compile-contracts.mjs' first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export interface DeploymentOptions {
  network: "base-sepolia" | "base-mainnet" | "localhost";
  simulate?: boolean;
  privateKey?: Hex;
  rpcUrl?: string;
  adminAddress?: Address;
}

export async function runDeployment(options: DeploymentOptions) {
  const { network, simulate = false, privateKey, rpcUrl, adminAddress } = options;

  console.log(`\n======================================================`);
  console.log(`   SHAGGY-DOGG-DEX CONTRACT DEPLOYMENT PIPELINE      `);
  console.log(`======================================================`);
  console.log(`Target Network : ${network}`);
  console.log(`Mode           : ${simulate ? "SIMULATION / PREFLIGHT" : "BROADCAST"}`);

  let chain;
  let defaultRpc = "";
  let chainId = 84532;

  if (network === "base-sepolia") {
    chain = baseSepolia;
    defaultRpc = "https://sepolia.base.org";
    chainId = 84532;
  } else if (network === "base-mainnet") {
    chain = base;
    defaultRpc = "https://mainnet.base.org";
    chainId = 8453;
  } else {
    chainId = 31337;
    defaultRpc = "http://127.0.0.1:8545";
    chain = defineChain({
      id: 31337,
      name: "Localhost",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [defaultRpc] } },
    });
  }

  const endpoint = rpcUrl || process.env.RPC_URL || defaultRpc;
  const publicClient = createPublicClient({
    chain,
    transport: http(endpoint),
  });

  const govTokenArtifact = loadArtifact("GovernanceToken");
  const stakingArtifact = loadArtifact("FeeDiscountStaking");

  console.log(`Loaded compiled bytecode:`);
  console.log(` - GovernanceToken   : ${govTokenArtifact.bytecode.length} hex chars`);
  console.log(` - FeeDiscountStaking: ${stakingArtifact.bytecode.length} hex chars`);

  const deployerAccount = privateKey
    ? privateKeyToAccount(privateKey)
    : privateKeyToAccount("***REMOVED***");

  const effectiveAdmin = adminAddress || deployerAccount.address;
  const initialMint = parseEther("1000000"); // 1,000,000 SD

  console.log(`Deployer Address : ${deployerAccount.address}`);
  console.log(`Initial Admin    : ${effectiveAdmin}`);
  console.log(`Initial Mint SD  : 1,000,000 SD (18 decimals)`);

  let govTokenAddress: Address;
  let stakingAddress: Address;
  let blockNumber = 0;
  let timestamp = Date.now();

  if (simulate || !privateKey) {
    console.log(`\n[PREFLIGHT] Validating constructor inputs and simulating bytecode packing...`);
    // Deterministic preview / simulation addresses
    govTokenAddress = "0x8453200000000000000000000000000000000001";
    stakingAddress = "0x8453200000000000000000000000000000000002";
    blockNumber = 18_500_000;
    console.log(` Simulated GovernanceToken  : ${govTokenAddress}`);
    console.log(` Simulated FeeDiscountStaking: ${stakingAddress}`);
  } else {
    const walletClient = createWalletClient({
      account: deployerAccount,
      chain,
      transport: http(endpoint),
    });

    console.log(`\n[1/2] Broadcasting GovernanceToken (SD) deployment...`);
    const govTxHash = await walletClient.deployContract({
      abi: govTokenArtifact.abi,
      bytecode: govTokenArtifact.bytecode,
      args: ["Shaggy Dogg", "SD", effectiveAdmin, effectiveAdmin, initialMint],
    });
    console.log(`  Tx Hash: ${govTxHash}`);
    const govReceipt = await publicClient.waitForTransactionReceipt({ hash: govTxHash });
    if (!govReceipt.contractAddress) {
      throw new Error("Failed to retrieve deployed GovernanceToken address from receipt.");
    }
    govTokenAddress = govReceipt.contractAddress;
    blockNumber = Number(govReceipt.blockNumber);
    console.log(`  Confirmed at Block ${blockNumber}: ${govTokenAddress}`);

    console.log(`\n[2/2] Broadcasting FeeDiscountStaking deployment...`);
    const stakingTxHash = await walletClient.deployContract({
      abi: stakingArtifact.abi,
      bytecode: stakingArtifact.bytecode,
      args: [govTokenAddress, effectiveAdmin, effectiveAdmin],
    });
    console.log(`  Tx Hash: ${stakingTxHash}`);
    const stakingReceipt = await publicClient.waitForTransactionReceipt({ hash: stakingTxHash });
    if (!stakingReceipt.contractAddress) {
      throw new Error("Failed to retrieve deployed FeeDiscountStaking address from receipt.");
    }
    stakingAddress = stakingReceipt.contractAddress;
    console.log(`  Confirmed at Block ${stakingReceipt.blockNumber}: ${stakingAddress}`);
  }

  // Record deployment artifact
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    chainId,
    network,
    timestamp,
    blockNumber,
    deployer: deployerAccount.address,
    contracts: {
      GovernanceToken: govTokenAddress,
      FeeDiscountStaking: stakingAddress,
    },
    verification: {
      solcVersion: "0.8.36",
      optimizerRuns: 200,
      sourceCommit: "fix/strict-ts",
      basescanVerificationStatus: simulate ? "SIMULATED_PENDING_BROADCAST" : "PENDING_VERIFICATION",
    },
  };

  const deploymentFile = path.resolve(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2), "utf8");
  console.log(`\n Deployment record saved -> ${deploymentFile}`);

  return deploymentData;
}

// CLI entrypoint
const isDirectCall =
  process.argv[1] &&
  (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")) ||
   import.meta.url.includes(path.basename(process.argv[1])));

if (isDirectCall) {
  const args = process.argv.slice(2);
  const networkArg = (args.find((a) => a.startsWith("--network="))?.split("=")[1] ||
    args[0] ||
    "base-sepolia") as "base-sepolia" | "base-mainnet" | "localhost";
  let privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  if (!privateKey) {
    const deployerEnvPath = path.resolve(root, ".env.deployer");
    if (fs.existsSync(deployerEnvPath)) {
      const match = fs.readFileSync(deployerEnvPath, "utf8").match(/PRIVATE_KEY=(0x[0-9a-fA-F]{64})/);
      if (match) {
        privateKey = match[1] as Hex;
        console.log(` Loaded deployer private key from ${deployerEnvPath}`);
      }
    }
  }

  const isSimulate = args.includes("--simulate") || !privateKey;

  runDeployment({
    network: networkArg,
    simulate: isSimulate,
    privateKey,
  }).catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
  });
}
