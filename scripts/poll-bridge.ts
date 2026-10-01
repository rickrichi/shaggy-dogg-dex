import { type Address,createPublicClient, formatEther, http } from "viem";
import { baseSepolia } from "viem/chains";

const userAddress: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const scriptDeployer: Address = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";

async function main() {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  for (let i = 0; i < 9; i++) {
    const userBal = await client.getBalance({ address: userAddress });
    const deployerBal = await client.getBalance({ address: scriptDeployer });

    if (userBal > 0n || deployerBal > 0n) {
      console.log(`\n🎉 FUNDS ARRIVED ON BASE SEPOLIA!`);
      console.log(`   User (${userAddress}): ${formatEther(userBal)} ETH`);
      console.log(`   Deployer (${scriptDeployer}): ${formatEther(deployerBal)} ETH`);
      return;
    }

    console.log(`[Attempt ${i + 1}/9] Waiting for L1->L2 bridge sequencer confirmation... (0 ETH)`);
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  console.log("Sequencer still processing bridge deposit. Check again in 60s.");
}

main();
