import { createPublicClient, http, formatEther, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";

const userAddress: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const scriptDeployer: Address = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";

async function checkAccount(client: ReturnType<typeof createPublicClient>, label: string, address: Address) {
  try {
    const bal = await client.getBalance({ address });
    console.log(`  ${label} (${address}): ${formatEther(bal)} ETH`);
    return bal;
  } catch (err) {
    console.log(`  ${label} check failed: ${(err as Error).message}`);
    return 0n;
  }
}

async function main() {
  console.log(`Checking balances...\n`);

  const sepoliaClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const mainnetClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log("=== Base Sepolia (Chain ID 84532) ===");
  await checkAccount(sepoliaClient, "ShaggyDogg User Account", userAddress);
  await checkAccount(sepoliaClient, "Script Deployer Account ", scriptDeployer);

  console.log("\n=== Base Mainnet (Chain ID 8453) ===");
  await checkAccount(mainnetClient, "ShaggyDogg User Account", userAddress);
  await checkAccount(mainnetClient, "Script Deployer Account ", scriptDeployer);
}

main();
