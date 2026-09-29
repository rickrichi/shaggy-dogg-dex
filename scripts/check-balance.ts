import { createPublicClient, http, formatEther } from "viem";
import { base, baseSepolia } from "viem/chains";

const address = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";

async function main() {
  console.log(`Checking balance for deployer: ${address}\n`);

  const sepoliaClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const mainnetClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  try {
    const sepoliaBalance = await sepoliaClient.getBalance({ address });
    console.log(`Base Sepolia (84532): ${formatEther(sepoliaBalance)} ETH`);
  } catch (err) {
    console.log(`Base Sepolia check failed: ${(err as Error).message}`);
  }

  try {
    const mainnetBalance = await mainnetClient.getBalance({ address });
    console.log(`Base Mainnet (8453) : ${formatEther(mainnetBalance)} ETH`);
  } catch (err) {
    console.log(`Base Mainnet check failed: ${(err as Error).message}`);
  }
}

main();
