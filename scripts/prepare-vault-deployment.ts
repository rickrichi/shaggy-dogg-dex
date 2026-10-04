import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, encodeDeployData, formatEther, http, keccak256, parseAbi } from "viem";
import { base } from "viem/chains";
import { LAUNCHPAD_ARTIFACTS } from "../src/lib/launchpad/artifacts";
import { BASE_STAKING } from "../src/lib/staking";
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org", { timeout: 15_000 }) });
const legacy = "0x16a1E9c10B913912b7B7df4649D9596D95ce33E6";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const pool = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const aToken = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";
const abi = parseAbi(["function admin() view returns (address)", "function treasury() view returns (address)",
  "function totalAssets() view returns (uint256)", "function totalShares() view returns (uint256)",
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)", "function POOL() view returns (address)"]);
const [admin, treasury, oldAssets, oldShares, asset, tokenPool] = await client.multicall({ allowFailure: false, contracts: [
  { address: legacy, abi, functionName: "admin" }, { address: legacy, abi, functionName: "treasury" },
  { address: legacy, abi, functionName: "totalAssets" }, { address: legacy, abi, functionName: "totalShares" },
  { address: aToken, abi, functionName: "UNDERLYING_ASSET_ADDRESS" }, { address: aToken, abi, functionName: "POOL" },
] });
if (asset.toLowerCase() !== usdc.toLowerCase() || tokenPool.toLowerCase() !== pool.toLowerCase()) throw new Error("Aave reserve mismatch");
const args = [usdc, pool, aToken, BASE_STAKING.stakingAddress, admin, treasury];
const data = encodeDeployData({ ...LAUNCHPAD_ARTIFACTS.YieldStakingVault, args });
const gas = await client.estimateGas({ account: admin, data });
const review = { preparedAt: new Date().toISOString(), chainId: 8453, status: "unsigned-not-submitted",
  legacyVault: legacy, oldAssets, oldShares, constructor: { usdc, pool, aToken, staking: BASE_STAKING.stakingAddress, admin, treasury },
  performanceFeeBps: 1000, discountDenominator: 10000, creationCodeHash: keccak256(data), gas,
  estimatedExecutionFeeEth: formatEther(gas * await client.getGasPrice()),
  transaction: { from: admin, chainId: 8453, value: "0x0", data },
  note: "Refresh fees in /stake. L1 data fees are additional. Existing deposits are not migrated." };
mkdirSync("release", { recursive: true });
writeFileSync("release/vault-deployment-review.json", JSON.stringify(review, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
console.log(JSON.stringify({ ...review, transaction: "Saved in release/vault-deployment-review.json" }, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
