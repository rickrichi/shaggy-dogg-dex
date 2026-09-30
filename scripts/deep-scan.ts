import { createPublicClient, http, formatEther, type Address } from "viem";
import {
  base,
  baseSepolia,
  sepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygon,
  arbitrum,
  optimism,
} from "viem/chains";

const userAddress: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const scriptDeployer: Address = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";

const list = [
  { name: "Base Sepolia", chain: baseSepolia, rpc: "https://sepolia.base.org" },
  { name: "Ethereum Sepolia", chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  { name: "Arbitrum Sepolia", chain: arbitrumSepolia, rpc: "https://sepolia-rollup.arbitrum.io/rpc" },
  { name: "Optimism Sepolia", chain: optimismSepolia, rpc: "https://sepolia.optimism.io" },
  { name: "Base Mainnet", chain: base, rpc: "https://mainnet.base.org" },
  { name: "Polygon", chain: polygon, rpc: "https://polygon-rpc.com" },
  { name: "Arbitrum One", chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc" },
  { name: "Optimism Mainnet", chain: optimism, rpc: "https://mainnet.optimism.io" },
];

async function scan() {
  for (const item of list) {
    try {
      const c = createPublicClient({ chain: item.chain, transport: http(item.rpc) });
      const [uBal, dBal, uNonce, dNonce] = await Promise.all([
        c.getBalance({ address: userAddress }),
        c.getBalance({ address: scriptDeployer }),
        c.getTransactionCount({ address: userAddress }),
        c.getTransactionCount({ address: scriptDeployer }),
      ]);

      if (uBal > 0n || dBal > 0n || uNonce > 0 || dNonce > 0) {
        console.log(`FOUND ACTIVITY ON ${item.name}:`);
        console.log(`  User: bal=${formatEther(uBal)} nonce=${uNonce}`);
        console.log(`  Deployer: bal=${formatEther(dBal)} nonce=${dNonce}`);
      }
    } catch {
      // ignore rpc timeouts
    }
  }
  console.log("Scan complete.");
}

scan();
