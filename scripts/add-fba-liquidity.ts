// Add FBA/WETH liquidity on Uniswap V2 (Base) via addLiquidityETH.
// Dry run by default (simulates only). Pass --send to broadcast.
// Key is read from env PRIVATE_KEY (put it in .env, which is gitignored). Never hardcode it.
import "dotenv/config";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  type Hex,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const FBA: Address = "0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263";
const PAIR: Address = "0x916ed75c0636ddd7404db79b7dc5cf80e8446c47";
const ROUTER: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"; // Uniswap V2 Router02, Base
const WETH: Address = "0x4200000000000000000000000000000000000006";

const ETH_AMOUNT = parseEther("0.0005");
const SLIPPAGE_BPS = 100n; // 1%
const DEADLINE_SECS = 300n; // 5 min
const SEND = process.argv.includes("--send");

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
]);
const pairAbi = parseAbi([
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
]);
const routerAbi = parseAbi([
  "function addLiquidityETH(address token,uint256 amountTokenDesired,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline) payable returns (uint256,uint256,uint256)",
]);

async function main() {
  const pk = process.env.PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : (`0x${pk}` as Hex));

  const rpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const pub = createPublicClient({ chain: base, transport: http(rpc) });

  const [decimals, token0, reserves, fbaBal, ethBal, allowance] = await Promise.all([
    pub.readContract({ address: FBA, abi: erc20, functionName: "decimals" }),
    pub.readContract({ address: PAIR, abi: pairAbi, functionName: "token0" }),
    pub.readContract({ address: PAIR, abi: pairAbi, functionName: "getReserves" }),
    pub.readContract({ address: FBA, abi: erc20, functionName: "balanceOf", args: [account.address] }),
    pub.getBalance({ address: account.address }),
    pub.readContract({ address: FBA, abi: erc20, functionName: "allowance", args: [account.address, ROUTER] }),
  ]);

  const fbaIsToken0 = token0.toLowerCase() === FBA.toLowerCase();
  const rFba = fbaIsToken0 ? reserves[0] : reserves[1];
  const rWeth = fbaIsToken0 ? reserves[1] : reserves[0];
  if (rFba === 0n || rWeth === 0n) throw new Error("Pool has no reserves");

  // quote: FBA needed to match ETH_AMOUNT at current reserve ratio (computed off-chain, pre-tx)
  const tokenDesired = (ETH_AMOUNT * rFba) / rWeth;
  const tokenMin = (tokenDesired * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const ethMin = (ETH_AMOUNT * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_SECS;

  console.log(`Wallet:        ${account.address}`);
  console.log(`Reserves:      ${formatUnits(rFba, decimals)} FBA / ${formatEther(rWeth)} WETH`);
  console.log(`Deposit:       ${formatUnits(tokenDesired, decimals)} FBA + ${formatEther(ETH_AMOUNT)} ETH`);
  console.log(`Mins (1%):     ${formatUnits(tokenMin, decimals)} FBA, ${formatEther(ethMin)} ETH`);
  console.log(`FBA balance:   ${formatUnits(fbaBal, decimals)}   ETH balance: ${formatEther(ethBal)}`);
  console.log(`Allowance:     ${formatUnits(allowance, decimals)}`);

  if (fbaBal < tokenDesired) throw new Error("Insufficient FBA balance");
  if (ethBal < ETH_AMOUNT) throw new Error("Insufficient ETH balance");

  const needsApprove = allowance < tokenDesired;

  if (!SEND) {
    if (!needsApprove) {
      await pub.simulateContract({
        account,
        address: ROUTER,
        abi: routerAbi,
        functionName: "addLiquidityETH",
        args: [FBA, tokenDesired, tokenMin, ethMin, account.address, deadline],
        value: ETH_AMOUNT,
      });
      console.log("\nDRY RUN OK: addLiquidityETH simulation succeeded. Re-run with --send to broadcast.");
    } else {
      console.log("\nDRY RUN: approval needed first (simulation of add skipped). --send will approve then add.");
    }
    return;
  }

  const wallet = createWalletClient({ account, chain: base, transport: http(rpc) });

  if (needsApprove) {
    const h = await wallet.writeContract({
      address: FBA, abi: erc20, functionName: "approve", args: [ROUTER, tokenDesired],
    });
    console.log(`approve tx: ${h}`);
    await pub.waitForTransactionReceipt({ hash: h });
  }

  const { request } = await pub.simulateContract({
    account,
    address: ROUTER,
    abi: routerAbi,
    functionName: "addLiquidityETH",
    args: [FBA, tokenDesired, tokenMin, ethMin, account.address, deadline],
    value: ETH_AMOUNT,
  });
  const hash = await wallet.writeContract(request);
  console.log(`addLiquidityETH tx: ${hash}`);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`status: ${rc.status}`);
}

void WETH;
main().catch((e) => {
  console.error(e.shortMessage || e.message);
  if (e.details) console.error("details:", e.details);
  if (e.cause?.message) console.error("cause:", e.cause.message);
  process.exit(1);
});
