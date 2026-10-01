import fs from "node:fs";
import path from "node:path";

import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  type Hex,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const PAIR_ADDRESS: Address = "0x63D504336d01BcCa615B23AD393E5812Dc646BF8";
const SD_TOKEN: Address = "0x051c758521971f5c5a84edaf18eea12854375469";
const WETH_TOKEN: Address = "0x4200000000000000000000000000000000000006";
const USER_ADDRESS: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const PAIR_ABI = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function mint(address to) external returns (uint256 liquidity)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

async function main() {
  const root = process.cwd();
  const envPath = path.resolve(root, ".env.deployer");
  let privateKey: Hex | undefined;

  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, "utf8").match(/PRIVATE_KEY=(0x[0-9a-fA-F]{64})/);
    if (match) privateKey = match[1] as Hex;
  }

  if (!privateKey) {
    throw new Error("Deployer private key not found in .env.deployer");
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  console.log(`Checking SD/WETH Pair (${PAIR_ADDRESS})...\n`);

  const sdBal = await publicClient.readContract({
    address: SD_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [PAIR_ADDRESS],
  });

  const wethBal = await publicClient.readContract({
    address: WETH_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [PAIR_ADDRESS],
  });

  const [r0, r1] = await publicClient.readContract({
    address: PAIR_ADDRESS,
    abi: PAIR_ABI,
    functionName: "getReserves",
  });

  console.log(`Pair Status:`);
  console.log(`  SD in contract   : ${formatEther(sdBal)} SD`);
  console.log(`  WETH in contract : ${formatEther(wethBal)} WETH`);
  console.log(`  Current Reserve0 : ${formatEther(r0)} SD`);
  console.log(`  Current Reserve1 : ${formatEther(r1)} WETH`);

  if (sdBal === 0n) {
    console.log(`\n⏳ Awaiting SD tokens! Transfer any amount of SD tokens (e.g. 10,000 SD) to:`);
    console.log(`   Pair Address: ${PAIR_ADDRESS}`);
    console.log(`   Once received, run this script again to mint LP tokens to ${USER_ADDRESS}!`);
    return;
  }

  if (wethBal === 0n) {
    console.log(`\n⚠️ Pair is missing WETH.`);
    return;
  }

  console.log(`\n🚀 Both SD and WETH are present! Minting LP tokens to ${USER_ADDRESS}...`);

  const hash = await walletClient.writeContract({
    address: PAIR_ADDRESS,
    abi: PAIR_ABI,
    functionName: "mint",
    args: [USER_ADDRESS],
  });

  console.log(`Mint tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Confirmed in block: ${receipt.blockNumber} (Status: ${receipt.status})`);

  const [newR0, newR1] = await publicClient.readContract({
    address: PAIR_ADDRESS,
    abi: PAIR_ABI,
    functionName: "getReserves",
  });

  console.log(`\n🎉 Success! Pool is officially initialized and liquid!`);
  console.log(`  Active Reserves: ${formatEther(newR0)} SD / ${formatEther(newR1)} WETH`);
}

main().catch(console.error);
