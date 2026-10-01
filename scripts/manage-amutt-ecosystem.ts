import { type Address, createPublicClient, formatEther, http, parseAbi } from "viem";
import { base } from "viem/chains";

const AMUTT_TOKEN: Address = "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7";
const STAKING_VAULT: Address = "0x055BB4eD8d5464C25D71391E940ce53CA30845fC";
const _YIELD_VAULT: Address = "0x16a1E9c10B913912b7B7df4649D9596D95ce33E6";
const _FLASH_BORROWER: Address = "0x936a3D52c3037848879F3641dfBc9132aAe51bDF";
const UNISWAP_V2_ROUTER: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const UNISWAP_V2_FACTORY: Address = "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6";
const WETH: Address = "0x4200000000000000000000000000000000000006";
const USER_ADDRESS: Address = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

async function main() {
  const client = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log("=================================================");
  console.log("       Astro Mutt (AMUTT) Ecosystem Status       ");
  console.log("=================================================");

  const ethBalance = await client.getBalance({ address: USER_ADDRESS });
  console.log(`Deployer Address : ${USER_ADDRESS}`);
  console.log(`ETH Balance      : ${formatEther(ethBalance)} ETH`);

  const tokenAbi = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
  ]);

  const [amuttBalance, routerAllowance] = await Promise.all([
    client.readContract({
      address: AMUTT_TOKEN,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [USER_ADDRESS],
    }),
    client.readContract({
      address: AMUTT_TOKEN,
      abi: tokenAbi,
      functionName: "allowance",
      args: [USER_ADDRESS, UNISWAP_V2_ROUTER],
    }),
  ]);

  console.log(`AMUTT Balance    : ${(amuttBalance / 10n ** 18n).toLocaleString()} AMUTT`);
  console.log(`Router Allowance : ${(routerAllowance / 10n ** 18n).toLocaleString()} AMUTT`);

  const factoryAbi = parseAbi([
    "function getPair(address, address) view returns (address)",
  ]);
  const pairAddress = await client.readContract({
    address: UNISWAP_V2_FACTORY,
    abi: factoryAbi,
    functionName: "getPair",
    args: [AMUTT_TOKEN, WETH],
  });

  const pairExists = pairAddress !== "0x0000000000000000000000000000000000000000";
  console.log(`Uniswap V2 Pair  : ${pairExists ? pairAddress : "Not Initialized (Ready to seed)"}`);

  const stakingAbi = parseAbi([
    "function tiersLength() view returns (uint256)",
  ]);
  const tiersLength = await client.readContract({
    address: STAKING_VAULT,
    abi: stakingAbi,
    functionName: "tiersLength",
  });
  console.log(`VIP Staking Tiers: ${tiersLength.toString()} configured`);

  console.log("\n--- Actions Available ---");
  console.log("1. Add Liquidity : Open http://localhost:5173/launchpad and click 'Initialize Liquidity with MetaMask'");
  console.log("2. Set Tiers     : Open http://localhost:5173/launchpad and click 'Activate 4 VIP Tiers with MetaMask'");
}

main().catch(console.error);
