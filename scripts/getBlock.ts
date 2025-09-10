import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

// Use a server-side env var so you never leak your RPC key
const RPC = process.env.ALCHEMY_HTTP_URL; // e.g. https://eth-mainnet.g.alchemy.com/v2/<KEY>
if (!RPC) {
  throw new Error('Missing ALCHEMY_HTTP_URL. Set it before running: set "ALCHEMY_HTTP_URL=...".');
}

async function main(): Promise<void> {
  const client = createPublicClient({ chain: mainnet, transport: http(RPC) });
  const block = await client.getBlock({ blockNumber: 123456n });
  // console.log can print BigInt safely in Node:
  console.log(block);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
