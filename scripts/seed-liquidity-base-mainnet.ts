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
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const PAIR_ADDRESS: Address = "0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917";
const SD_TOKEN: Address = "0x051c758521971f5c5a84edaf18eea12854375469";
const WETH_TOKEN: Address = "0x4200000000000000000000000000000000000006";
const USER_ADDRESS: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const WETH_ABI = parseAbi([
  "function deposit() external payable",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
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
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log(`\n======================================================`);
  console.log(`   SHAGGY-DOGG-DEX BASE MAINNET POOL SEEDING PIPELINE `);
  console.log(`======================================================`);
  console.log(`Pair Address : ${PAIR_ADDRESS}`);
  console.log(`Deployer     : ${account.address}`);
  console.log(`LP Recipient : ${USER_ADDRESS}\n`);

  const sdBal = await publicClient.readContract({
    address: SD_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [PAIR_ADDRESS],
  });

  let wethBal = await publicClient.readContract({
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

  console.log(`Current Pair Status:`);
  console.log(`  SD in contract   : ${formatEther(sdBal)} SD`);
  console.log(`  WETH in contract : ${formatEther(wethBal)} WETH`);
  console.log(`  Current Reserve0 : ${formatEther(r0)}`);
  console.log(`  Current Reserve1 : ${formatEther(r1)}`);

  // Step A: Supply WETH if missing
  if (wethBal === 0n) {
    const wethToSupply = parseEther("0.0005");
    console.log(`\n[1/3] Depositing ${formatEther(wethToSupply)} ETH into canonical WETH9...`);
    
    const depositTx = await walletClient.writeContract({
      address: WETH_TOKEN,
      abi: WETH_ABI,
      functionName: "deposit",
      value: wethToSupply,
    });
    console.log(`  Deposit tx: ${depositTx}`);
    await publicClient.waitForTransactionReceipt({ hash: depositTx });

    console.log(`[2/3] Transferring 0.0005 WETH to Uniswap Pair contract...`);
    const transferTx = await walletClient.writeContract({
      address: WETH_TOKEN,
      abi: WETH_ABI,
      functionName: "transfer",
      args: [PAIR_ADDRESS, wethToSupply],
    });
    console.log(`  Transfer tx: ${transferTx}`);
    await publicClient.waitForTransactionReceipt({ hash: transferTx });

    wethBal = await publicClient.readContract({
      address: WETH_TOKEN,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [PAIR_ADDRESS],
    });
    console.log(`  WETH in contract now: ${formatEther(wethBal)} WETH`);
  } else {
    console.log(`\n✅ WETH is already present in Pair contract: ${formatEther(wethBal)} WETH`);
  }

  // Step B: Check SD tokens
  if (sdBal === 0n) {
    console.log(`\n⏳ AWAITING SD TOKENS FROM USER!`);
    console.log(`   Transfer your desired initial SD liquidity (e.g. 500,000 SD) to:`);
    console.log(`   Pair Address: ${PAIR_ADDRESS}`);
    console.log(`\n   Once you send SD from MetaMask, run this script again to mint 100% of the LP tokens to ${USER_ADDRESS}!`);
    return;
  }

  // Step C: Both are present, mint LP tokens to User!
  console.log(`\n[3/3] 🚀 Both SD and WETH are in Pair contract! Minting LP tokens to ${USER_ADDRESS}...`);
  const mintHash = await walletClient.writeContract({
    address: PAIR_ADDRESS,
    abi: PAIR_ABI,
    functionName: "mint",
    args: [USER_ADDRESS],
  });

  console.log(`  Mint tx submitted: ${mintHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`  Confirmed at Block: ${receipt.blockNumber} (Status: ${receipt.status})`);

  const [newR0, newR1] = await publicClient.readContract({
    address: PAIR_ADDRESS,
    abi: PAIR_ABI,
    functionName: "getReserves",
  });

  console.log(`\n🎉 LIQUIDITY POOL SEEDED AND LIVE ON BASE MAINNET!`);
  console.log(`  Active Reserves : ${formatEther(newR0)} SD / ${formatEther(newR1)} WETH`);
  console.log(`  LP Tokens Owner : ${USER_ADDRESS} (100% of Pool)`);
}

main().catch(console.error);
