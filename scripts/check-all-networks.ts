import { type Address,createPublicClient, formatEther, http } from "viem";
import { arbitrumSepolia, base, baseSepolia, mainnet, optimismSepolia,sepolia } from "viem/chains";

const userAddress: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const scriptDeployer: Address = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";

const chains = [
  { name: "Base Sepolia", chain: baseSepolia, rpc: "https://sepolia.base.org" },
  { name: "Ethereum Sepolia", chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  { name: "Arbitrum Sepolia", chain: arbitrumSepolia, rpc: "https://sepolia-rollup.arbitrum.io/rpc" },
  { name: "Optimism Sepolia", chain: optimismSepolia, rpc: "https://sepolia.optimism.io" },
  { name: "Base Mainnet", chain: base, rpc: "https://mainnet.base.org" },
  { name: "Ethereum Mainnet", chain: mainnet, rpc: "https://eth.llamarpc.com" },
];

async function main() {
  console.log("Checking balances across common networks...\n");

  for (const item of chains) {
    try {
      const client = createPublicClient({ chain: item.chain, transport: http(item.rpc) });
      const userBal = await client.getBalance({ address: userAddress });
      const deployerBal = await client.getBalance({ address: scriptDeployer });

      if (userBal > 0n || deployerBal > 0n) {
        console.log(`>>> FOUND FUNDS ON ${item.name} (${item.chain.id}):`);
        console.log(`    User (${userAddress}): ${formatEther(userBal)} ETH`);
        console.log(`    Deployer (${scriptDeployer}): ${formatEther(deployerBal)} ETH\n`);
      } else {
        console.log(`  ${item.name} (${item.chain.id}): 0 ETH`);
      }
    } catch (err) {
      console.log(`  ${item.name} (${item.chain.id}): RPC error: ${(err as Error).message}`);
    }
  }
}

main();
