// scripts/calculate-epoch-rewards.ts
// Prepares one weekly AMUTT reward epoch for WeeklyUsdcDistributor. It reads finalized
// staking history from chain and operator-supplied settled trades, then writes:
//   <out>/epoch-<N>/ledger.json    exact accounting (its keccak256 is published on-chain)
//   <out>/epoch-<N>/manifest.json  Merkle root and per-account claims for the app
//   <out>/epoch-<N>/publish.json   unsigned approve + publishEpoch calls for the owner wallet
// It never signs or broadcasts. Run:
//   npx tsx scripts/calculate-epoch-rewards.ts --epoch 1 --trades records/epoch-1-trades.json \
//     [--config config/reward-deployment.json] [--rpc <archive RPC>] [--from-block <n>] [--out reports/rewards]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type Address,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  zeroHash,
} from "viem";
import { base, baseSepolia } from "viem/chains";

import { parseRewardManifest, REWARD_ABI, REWARD_WEEK, type RewardDeployment } from "../src/lib/rewards";

import {
  calculateEpochRewards,
  computeStakeWeights,
  formatUsdc,
  type TradeExecutionRecord,
} from "./lib/epoch-rewards";
import { buildRewardManifest, hashLedger, serializeLedger } from "./lib/reward-merkle";
import {
  fetchStakingHistory,
  findDeploymentBlock,
  findLastBlockBefore,
  verifyClosingBalances,
} from "./lib/staking-history";

interface RewardConfig extends RewardDeployment {
  stakingContract: Address;
  stakingDeploymentBlock?: string | null;
  excludedAccounts?: Array<{ address: string; label: string }>;
}

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

function loadConfig(path: string): RewardConfig {
  const config = JSON.parse(readFileSync(path, "utf8")) as RewardConfig;
  if (![base.id, baseSepolia.id].includes(config.chainId as 8453 | 84532)) fail(`Unsupported chainId ${config.chainId}.`);
  if (!config.distributor || !isAddress(config.distributor)) fail(`${path}: distributor is not deployed/configured.`);
  if (config.epochOrigin === null || !Number.isSafeInteger(config.epochOrigin)) fail(`${path}: epochOrigin is missing.`);
  if (!isAddress(config.stakingContract ?? "")) fail(`${path}: stakingContract is missing.`);
  for (const entry of config.excludedAccounts ?? []) {
    if (!isAddress(entry?.address ?? "") || typeof entry.label !== "string" || !entry.label.trim()) {
      fail(`${path}: each excludedAccounts entry needs a valid address and a label.`);
    }
  }
  return config;
}

function loadTrades(path: string | undefined): TradeExecutionRecord[] {
  if (!path) fail("--trades <file> is required. Use a file containing [] for a week with no trades.");
  if (!existsSync(path)) fail(`Trade record file not found: ${path}`);
  const trades: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(trades)) fail("Trade record file must contain a JSON array.");
  return trades as TradeExecutionRecord[];
}

async function main() {
  const epochArg = arg("--epoch");
  if (!epochArg || !/^[1-9][0-9]*$/.test(epochArg)) fail("--epoch <positive integer> is required.");
  const epochId = Number(epochArg);
  const configPath = arg("--config") ?? "config/reward-deployment.json";
  const config = loadConfig(configPath);
  const distributor = getAddress(config.distributor!);
  const origin = config.epochOrigin!;
  const outDir = join(arg("--out") ?? "reports/rewards", `epoch-${epochId}`);
  const trades = loadTrades(arg("--trades"));

  const chain = config.chainId === base.id ? base : baseSepolia;
  const rpc = arg("--rpc") ?? chain.rpcUrls.default.http[0];
  // No chain formatters: only plain reads are needed, and the chain ID is checked explicitly below.
  const client = createPublicClient({ transport: http(rpc, { timeout: 30_000, retryCount: 3 }) });
  if ((await client.getChainId()) !== config.chainId) fail("RPC chain does not match the configuration.");

  const startTimestamp = origin + (epochId - 1) * REWARD_WEEK;
  const endTimestamp = startTimestamp + REWARD_WEEK;
  console.log(`Epoch ${epochId}: ${new Date(startTimestamp * 1000).toISOString()} → ${new Date(endTimestamp * 1000).toISOString()} (end exclusive)`);
  console.log(`Distributor ${distributor} on chain ${config.chainId}`);

  // The distributor must agree with the config and be waiting for exactly this epoch.
  const [onchainToken, onchainOrigin, lastPublished] = await Promise.all([
    client.readContract({ address: distributor, abi: REWARD_ABI, functionName: "rewardToken" }),
    client.readContract({ address: distributor, abi: REWARD_ABI, functionName: "epochOrigin" }),
    client.readContract({ address: distributor, abi: REWARD_ABI, functionName: "lastPublishedEpoch" }),
  ]);
  if (onchainToken.toLowerCase() !== config.rewardToken.toLowerCase()) fail("Distributor reward token differs from config.");
  if (onchainOrigin !== BigInt(origin)) fail("Distributor epochOrigin differs from config.");
  if (lastPublished !== BigInt(epochId - 1)) fail(`Distributor expects epoch ${lastPublished + 1n}, not ${epochId}.`);

  // Carry loss and dust forward from the previous ledger, whose hash must match the chain.
  let carriedLossUnits = 0n;
  let carriedDustUnits = 0n;
  if (epochId > 1) {
    const previousPath = join(arg("--out") ?? "reports/rewards", `epoch-${epochId - 1}`, "ledger.json");
    if (!existsSync(previousPath)) fail(`Previous ledger ${previousPath} is required for carryforward.`);
    const previousBytes = readFileSync(previousPath, "utf8");
    const onchain = await client.readContract({ address: distributor, abi: REWARD_ABI, functionName: "epochs", args: [BigInt(epochId - 1)] });
    if (hashLedger(previousBytes).toLowerCase() !== onchain[1].toLowerCase()) {
      fail(`Previous ledger ${previousPath} does not match the ledger hash published on-chain.`);
    }
    const previous = JSON.parse(previousBytes) as { accounting: { newCarriedLossUnits: string; newCarriedDustUnits: string } };
    carriedLossUnits = BigInt(previous.accounting.newCarriedLossUnits);
    carriedDustUnits = BigInt(previous.accounting.newCarriedDustUnits);
  }

  // Finalized staking history from contract deployment through the last block before the epoch end.
  const finalized = await client.getBlock({ blockTag: "finalized" });
  const endBlock = await findLastBlockBefore(client, endTimestamp, finalized.number);
  const staking = getAddress(config.stakingContract);
  const fromBlockArg = arg("--from-block") ?? config.stakingDeploymentBlock ?? undefined;
  const fromBlock = fromBlockArg ? BigInt(fromBlockArg) : await findDeploymentBlock(client, staking, endBlock);
  console.log(`Reading staking logs ${staking} blocks ${fromBlock}–${endBlock}…`);
  const history = await fetchStakingHistory(client, staking, fromBlock, endBlock, BigInt(arg("--chunk") ?? "5000"));
  console.log(`Found ${history.events.length} Staked/Unstaked events.`);
  const { closingBalances } = computeStakeWeights(history.events, startTimestamp, endTimestamp);
  await verifyClosingBalances(client, staking, closingBalances, endBlock);
  console.log(`Replayed balances match stakedBalance() for ${closingBalances.size} accounts at block ${endBlock}.`);

  const result = calculateEpochRewards({
    epochId,
    startTimestamp,
    endTimestamp,
    trades,
    stakingEvents: history.events,
    carriedLossUnits,
    carriedDustUnits,
    excludedAccounts: (config.excludedAccounts ?? []).map((e) => getAddress(e.address)),
  });

  const ledger = {
    version: 1,
    chainId: config.chainId,
    distributor,
    rewardToken: getAddress(config.rewardToken),
    stakingContract: staking,
    excludedAccounts: (config.excludedAccounts ?? []).map((e) => ({ address: getAddress(e.address), label: e.label })),
    stakingHistory: { fromBlock: history.fromBlock, toBlock: history.toBlock, events: history.events },
    trades,
    ...result,
  };
  const ledgerBytes = serializeLedger(ledger);
  const ledgerHash = hashLedger(ledgerBytes);
  const manifest = buildRewardManifest({ chainId: config.chainId, distributor, rewardToken: config.rewardToken, epochOrigin: origin }, result, ledgerHash);
  parseRewardManifest(manifest, config); // Same validation the app performs, including every proof.

  const allocation = BigInt(manifest.allocation);
  const root = allocation === 0n ? zeroHash : manifest.root;
  const publish = {
    note: "Unsigned. The distributor owner reviews and sends these from their own wallet, in order.",
    chainId: config.chainId,
    from: "<distributor owner>",
    transactions: [
      ...(allocation > 0n
        ? [{
            description: `Approve ${formatUsdc(allocation)} USDC for the distributor`,
            to: getAddress(config.rewardToken),
            data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [distributor, allocation] }),
          }]
        : []),
      {
        description: `publishEpoch(${epochId}) — pulls ${formatUsdc(allocation)} USDC from the owner`,
        to: distributor,
        args: { epochId: String(epochId), root, ledgerHash, allocation: allocation.toString() },
        data: encodeFunctionData({ abi: REWARD_ABI, functionName: "publishEpoch", args: [BigInt(epochId), root, ledgerHash, allocation] }),
      },
    ],
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "ledger.json"), ledgerBytes, "utf8");
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "publish.json"), `${JSON.stringify(publish, null, 2)}\n`, "utf8");

  const a = result.accounting;
  console.log("\nAccounting (USDC)");
  console.log(`  Net trade proceeds      ${formatUsdc(a.netTradeProceedsUnits)}`);
  console.log(`  Prior carried loss     -${formatUsdc(a.previousCarriedLossUnits)}`);
  console.log(`  Eligible net profit     ${formatUsdc(a.eligibleNetProfitUnits)}`);
  console.log(`  Staker pool (10%)       ${formatUsdc(a.stakerPoolUnits)} + carried dust ${formatUsdc(a.previousCarriedDustUnits)}`);
  console.log(`  Treasury share (90%)    ${formatUsdc(a.treasuryShareUnits)}`);
  console.log(`  Allocated to claims     ${formatUsdc(a.totalDistributedUnits)} across ${manifest.claims.length} accounts`);
  console.log(`  Carry forward           loss ${formatUsdc(a.newCarriedLossUnits)}, dust ${formatUsdc(a.newCarriedDustUnits)}`);
  for (const e of result.stakerMetrics.excluded) {
    const label = config.excludedAccounts?.find((x) => x.address.toLowerCase() === e.address.toLowerCase())?.label;
    console.log(`  Excluded ${e.address} (${label}): stake weight ${e.timeWeightedTokenSeconds} receives no allocation`);
  }
  console.log(`\nLedger hash ${ledgerHash}`);
  console.log(`Wrote ${outDir}/{ledger,manifest,publish}.json. Nothing was signed or sent.`);
}

main().catch((error: unknown) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
