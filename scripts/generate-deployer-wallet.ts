import fs from "node:fs";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = process.cwd();
const envDeployerPath = path.resolve(root, ".env.deployer");

// Check if a deployer wallet already exists to avoid overwriting
if (fs.existsSync(envDeployerPath)) {
  const existing = fs.readFileSync(envDeployerPath, "utf8");
  const matchAddr = existing.match(/DEPLOYER_ADDRESS=(0x[0-9a-fA-F]{40})/);
  if (matchAddr) {
    console.log("\n=======================================================");
    console.log("   EXISTING DEPLOYER WALLET FOUND                     ");
    console.log("=======================================================");
    console.log(`Public Address : ${matchAddr[1]}`);
    console.log(`File Location  : ${envDeployerPath}`);
    console.log("=======================================================\n");
    process.exit(0);
  }
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

const content = `# ShaggyDogg DEX Deployer Wallet (DO NOT COMMIT TO GIT)
DEPLOYER_ADDRESS=${account.address}
PRIVATE_KEY=${privateKey}
CREATED_AT=${new Date().toISOString()}
`;

fs.writeFileSync(envDeployerPath, content, "utf8");

console.log("\n=======================================================");
console.log("   NEW DEDICATED DEPLOYER WALLET CREATED               ");
console.log("=======================================================");
console.log(`Public Address : ${account.address}`);
console.log(`File Saved To  : ${envDeployerPath} (Git-Ignored)`);
console.log("=======================================================");
console.log("\nNext Steps to Fund with Free Testnet ETH:");
console.log(`1. Copy your address: ${account.address}`);
console.log("2. Open the Base Sepolia Faucet:");
console.log("   https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
console.log("   (or https://faucets.chain.link/)");
console.log("3. Paste your address and request free testnet ETH.");
console.log("4. Run: npx tsx scripts/deploy-sd-contracts.ts --network=base-sepolia\n");
