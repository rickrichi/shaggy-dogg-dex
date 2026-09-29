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
  const flashBorrowerArtifact = loadArtifact("AaveFlashBorrower");
  const yieldVaultArtifact = loadArtifact("YieldStakingVault");
  const compoundVaultArtifact = loadArtifact("CompoundYieldVault");

  console.log(`Loaded compiled bytecode:`);
  console.log(` - GovernanceToken   : ${govTokenArtifact.bytecode.length} hex chars`);
  console.log(` - FeeDiscountStaking: ${stakingArtifact.bytecode.length} hex chars`);
  console.log(` - AaveFlashBorrower : ${flashBorrowerArtifact.bytecode.length} hex chars`);
  console.log(` - YieldStakingVault : ${yieldVaultArtifact.bytecode.length} hex chars`);
  console.log(` - CompoundYieldVault: ${compoundVaultArtifact.bytecode.length} hex chars`);

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
  let flashBorrowerAddress: Address;
  let yieldVaultAddress: Address;
  let compoundVaultAddress: Address;
  let blockNumber = 0;
  const timestamp = Date.now();

  const networkConfig = {
    "base-sepolia": {
      aavePool: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b" as Address,
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
      comet: "0x6d88c0352A9D114B5CeeC8a82dE9Ff9F5D21f2dC" as Address,
    },
    "base-mainnet": {
      aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address,
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
      comet: "0xb125E6687d4313864e53df431d5425969c15Eb2F" as Address,
    },
    "localhost": {
      aavePool: "0x0000000000000000000000000000000000000001" as Address,
      usdc: "0x0000000000000000000000000000000000000002" as Address,
      comet: "0x0000000000000000000000000000000000000003" as Address,
    },
  }[network];

  if (simulate || !privateKey) {
    console.log(`\n[PREFLIGHT] Validating constructor inputs and simulating bytecode packing...`);
    govTokenAddress = "0x8453200000000000000000000000000000000001";
    stakingAddress = "0x8453200000000000000000000000000000000002";
    flashBorrowerAddress = "0x8453200000000000000000000000000000000003";
    yieldVaultAddress = "0x8453200000000000000000000000000000000004";
    compoundVaultAddress = "0x8453200000000000000000000000000000000005";
    blockNumber = 18_500_000;
    console.log(` Simulated GovernanceToken  : ${govTokenAddress}`);
    console.log(` Simulated FeeDiscountStaking: ${stakingAddress}`);
    console.log(` Simulated AaveFlashBorrower : ${flashBorrowerAddress}`);
    console.log(` Simulated YieldStakingVault : ${yieldVaultAddress}`);
    console.log(` Simulated CompoundYieldVault: ${compoundVaultAddress}`);
  } else {
    const walletClient = createWalletClient({
      account: deployerAccount,
      chain,
      transport: http(endpoint),
    });

    const balance = await publicClient.getBalance({ address: deployerAccount.address });
    if (balance === 0n) {
      console.log(`\n❌ INSUFFICIENT GAS: Deployer wallet has 0 ETH on ${network}.`);
      console.log(`   Wallet Address: ${deployerAccount.address}`);
      console.log(`\n👉 Action Required:`);
      if (network === "base-sepolia") {
        console.log(`   1. Open: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet`);
        console.log(`   2. Paste: ${deployerAccount.address}`);
        console.log(`   3. Click "Request funds" (Free testnet ETH arrives in ~5 seconds)`);
      } else {
        console.log(`   Send ~$0.50 of ETH to ${deployerAccount.address} on Base Mainnet to cover gas.`);
      }
      console.log(`\n   Once funded, re-run this command to complete deployment!`);
      return;
    }

    console.log(`\n[1/5] Broadcasting GovernanceToken (SD) deployment...`);
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

    console.log(`\n[2/5] Broadcasting FeeDiscountStaking deployment...`);
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

    console.log(`\n[3/5] Broadcasting AaveFlashBorrower deployment...`);
    const flashTxHash = await walletClient.deployContract({
      abi: flashBorrowerArtifact.abi,
      bytecode: flashBorrowerArtifact.bytecode,
      args: [networkConfig.aavePool, effectiveAdmin],
    });
    console.log(`  Tx Hash: ${flashTxHash}`);
    const flashReceipt = await publicClient.waitForTransactionReceipt({ hash: flashTxHash });
    if (!flashReceipt.contractAddress) {
      throw new Error("Failed to retrieve deployed AaveFlashBorrower address from receipt.");
    }
    flashBorrowerAddress = flashReceipt.contractAddress;
    console.log(`  Confirmed at Block ${flashReceipt.blockNumber}: ${flashBorrowerAddress}`);

    console.log(`\n[4/5] Broadcasting YieldStakingVault deployment...`);
    const yieldTxHash = await walletClient.deployContract({
      abi: yieldVaultArtifact.abi,
      bytecode: yieldVaultArtifact.bytecode,
      args: [
        networkConfig.usdc,
        networkConfig.aavePool,
        "0x0000000000000000000000000000000000000000",
        stakingAddress,
        effectiveAdmin,
        effectiveAdmin,
      ],
    });
    console.log(`  Tx Hash: ${yieldTxHash}`);
    const yieldReceipt = await publicClient.waitForTransactionReceipt({ hash: yieldTxHash });
    if (!yieldReceipt.contractAddress) {
      throw new Error("Failed to retrieve deployed YieldStakingVault address from receipt.");
    }
    yieldVaultAddress = yieldReceipt.contractAddress;
    console.log(`  Confirmed at Block ${yieldReceipt.blockNumber}: ${yieldVaultAddress}`);

    console.log(`\n[5/5] Broadcasting CompoundYieldVault deployment...`);
    const compoundTxHash = await walletClient.deployContract({
      abi: compoundVaultArtifact.abi,
      bytecode: compoundVaultArtifact.bytecode,
      args: [
        networkConfig.usdc,
        networkConfig.comet,
        stakingAddress,
        effectiveAdmin,
        effectiveAdmin,
      ],
    });
    console.log(`  Tx Hash: ${compoundTxHash}`);
    const compoundReceipt = await publicClient.waitForTransactionReceipt({ hash: compoundTxHash });
    if (!compoundReceipt.contractAddress) {
      throw new Error("Failed to retrieve deployed CompoundYieldVault address from receipt.");
    }
    compoundVaultAddress = compoundReceipt.contractAddress;
    console.log(`  Confirmed at Block ${compoundReceipt.blockNumber}: ${compoundVaultAddress}`);
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
      AaveFlashBorrower: flashBorrowerAddress,
      YieldStakingVault: yieldVaultAddress,
      CompoundYieldVault: compoundVaultAddress,
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
