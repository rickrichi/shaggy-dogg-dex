// scripts/test-reward-e2e.ts
// End-to-end check of AMUTT weekly rewards on a LOCAL Anvil chain only. It deploys a mock
// 6-decimal USDC, GovernanceToken, FeeDiscountStaking and WeeklyUsdcDistributor, stakes at
// different times, runs the real epoch CLI, sends its publish calldata, and claims.
// Uses Anvil's unlocked dev accounts (eth_sendTransaction); no private keys are involved.
//
//   anvil --chain-id 84532          (separate terminal)
//   forge build --root contracts
//   npx tsx scripts/test-reward-e2e.ts [--rpc http://127.0.0.1:8545] [--artifacts contracts/out]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { baseSepolia } from "viem/chains";

import { REWARD_ABI, type RewardManifest } from "../src/lib/rewards";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const rpc = opt("--rpc", "http://127.0.0.1:8545");
const artifacts = opt("--artifacts", "contracts/out");
const WEEK = 604_800;
const DAY = 86_400;
const TOKEN = 10n ** 18n;

const chain = { ...baseSepolia, rpcUrls: { default: { http: [rpc] } } };
const client = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc) });

const STAKING_ABI = parseAbi([
  "function stake(uint256)",
  "function unstake(uint256)",
  "function stakedBalance(address) view returns (uint256)",
]);
const MOCK_ABI = parseAbi(["function mint(address,uint256)"]);

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(join(artifacts, file, `${name}.json`), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function send(from: Address, to: Address, data: Hex) {
  const hash = await wallet.sendTransaction({ account: from, to, data, chain });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

async function write(from: Address, address: Address, abi: Abi, functionName: string, fnArgs: unknown[]) {
  const hash = await wallet.writeContract({ account: from, address, abi, functionName, args: fnArgs, chain } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  return (await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp;
}

async function deploy(from: Address, file: string, name: string, ctorArgs: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(file, name);
  const hash = await wallet.deployContract({ account: from, abi, bytecode, args: ctorArgs, chain } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} deployment failed`);
  return receipt.contractAddress;
}

async function warpTo(timestamp: number) {
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [timestamp] as never });
  await client.request({ method: "evm_mine" as never, params: [] as never });
}

// Anvil's "finalized" tag trails the head; mine past it so the CLI's finality guard is satisfied.
async function finalize() {
  await client.request({ method: "anvil_mine" as never, params: ["0x100", "0x1"] as never });
}

function runCli(epoch: number, trades: string, config: string, out: string) {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/calculate-epoch-rewards.ts", "--epoch", String(epoch), "--trades", trades, "--config", config, "--rpc", rpc, "--out", out],
    { stdio: "inherit" },
  );
}

async function main() {
  if ((await client.getChainId()) !== baseSepolia.id) throw new Error("Start anvil with --chain-id 84532.");
  const [owner, alice, bob, carol] = await wallet.getAddresses();
  if (!owner || !alice || !bob || !carol) throw new Error("Anvil dev accounts unavailable.");
  const dir = mkdtempSync(join(tmpdir(), "amutt-rewards-"));
  console.log(`Local reward e2e on ${rpc}; output in ${dir}`);

  // Contracts
  const usdc = await deploy(owner, "WeeklyUsdcDistributor.t.sol", "MockUsdc", [6]);
  const amutt = await deploy(owner, "GovernanceToken.sol", "GovernanceToken", ["Astro Mutt", "AMUTT", owner, owner, 1_000_000n * TOKEN]);
  const staking = await deploy(owner, "FeeDiscountStaking.sol", "FeeDiscountStaking", [amutt, owner, owner]);
  for (const user of [alice, bob, carol]) {
    await write(owner, amutt, erc20Abi, "transfer", [user, 10_000n * TOKEN]);
    await write(user, amutt, erc20Abi, "approve", [staking, 10_000n * TOKEN]);
  }

  // A large project-wallet stake (the owner here) is excluded from allocations.
  await write(owner, amutt, erc20Abi, "approve", [staking, 500_000n * TOKEN]);
  await write(owner, staking, STAKING_ABI, "stake", [500_000n * TOKEN]);

  // Alice stakes before the epoch; origin is set after that.
  const tAliceStake = Number(await write(alice, staking, STAKING_ABI, "stake", [1_000n * TOKEN]));
  const origin = tAliceStake + 1_000;
  const distributor = await deploy(owner, "WeeklyUsdcDistributor.sol", "WeeklyUsdcDistributor", [usdc, owner, BigInt(origin)]);

  await warpTo(origin + 2 * DAY);
  const tBob = Number(await write(bob, staking, STAKING_ABI, "stake", [1_000n * TOKEN]));
  await warpTo(origin + 4 * DAY);
  const tAliceUnstake = Number(await write(alice, staking, STAKING_ABI, "unstake", [500n * TOKEN]));
  // Carol stakes after the epoch ends: she must not share epoch 1.
  await warpTo(origin + WEEK + DAY);
  await write(carol, staking, STAKING_ABI, "stake", [1_000n * TOKEN]);
  await finalize();

  const config = join(dir, "config.json");
  writeFileSync(config, JSON.stringify({
    chainId: baseSepolia.id, distributor, rewardToken: usdc, stakingContract: staking,
    stakingDeploymentBlock: null, deploymentBlock: "0", epochOrigin: origin, indexUrl: "/rewards/index.json",
    excludedAccounts: [{ address: owner, label: "Project wallet" }],
  }));
  const trades1 = join(dir, "trades-1.json");
  writeFileSync(trades1, JSON.stringify([{
    txHash: "0xe2e1", venue: "local", timestamp: origin + 3 * DAY,
    grossProceedsUsdc: "10100.5", principalCapitalUsdc: "10000", tradingFeesUsdc: "0.25",
    flashLoanFeesUsdc: "0", gasCostUsdc: "0.25", status: "filled", hasVerifiedValuation: true,
  }]));

  console.log("\nEpoch 1: calculate");
  runCli(1, trades1, config, dir);
  const manifest = JSON.parse(readFileSync(join(dir, "epoch-1", "manifest.json"), "utf8")) as RewardManifest;
  const publish = JSON.parse(readFileSync(join(dir, "epoch-1", "publish.json"), "utf8")) as {
    transactions: Array<{ to: Address; data: Hex }>;
  };

  // Independent expectation from block timestamps: net 100 USDC → 10 USDC pool.
  const end = origin + WEEK;
  const aliceWeight = 1_000n * BigInt(tAliceUnstake - origin) + 500n * BigInt(end - tAliceUnstake);
  const bobWeight = 1_000n * BigInt(end - tBob);
  const pool = 10_000_000n;
  const expected = new Map<string, bigint>([
    [alice.toLowerCase(), (pool * aliceWeight) / (aliceWeight + bobWeight)],
    [bob.toLowerCase(), (pool * bobWeight) / (aliceWeight + bobWeight)],
  ]);
  console.log("\nEpoch 1: verify allocation");
  check(manifest.claims.length === 2, "only Alice and Bob are allocated (Carol staked after the epoch)");
  check(!manifest.claims.some((c) => c.account.toLowerCase() === owner.toLowerCase()), "the excluded 500,000 AMUTT project stake receives nothing");
  const ledger1 = JSON.parse(readFileSync(join(dir, "epoch-1", "ledger.json"), "utf8")) as {
    excludedAccounts: Array<{ address: string }>;
  };
  check(ledger1.excludedAccounts[0]?.address.toLowerCase() === owner.toLowerCase(), "the published ledger discloses the excluded wallet");
  for (const c of manifest.claims) {
    check(BigInt(c.amount) === expected.get(c.account.toLowerCase()), `${c.account} allocation ${c.amount} matches the independent time-weighted calculation`);
  }

  console.log("\nEpoch 1: owner sends the unsigned publish calls");
  await write(owner, usdc, MOCK_ABI, "mint", [owner, parseUnits("1000", 6)]);
  for (const tx of publish.transactions) await send(owner, tx.to, tx.data);
  const onchain = await client.readContract({ address: distributor, abi: REWARD_ABI, functionName: "epochs", args: [1n] });
  check(onchain[0] === manifest.root && onchain[1] === manifest.ledgerHash, "on-chain root and ledger hash match the manifest");
  check(onchain[2] === BigInt(manifest.allocation), "on-chain allocation matches");
  check(await client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [distributor] }) === BigInt(manifest.allocation), "distributor holds exactly the allocation");

  console.log("\nEpoch 1: claims");
  for (const c of manifest.claims) {
    const caller = c.account.toLowerCase() === bob.toLowerCase() ? carol : c.account; // Bob's claim is relayed by Carol.
    const before = await client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [c.account] });
    await write(caller, distributor, REWARD_ABI, "claim", [1n, c.account, BigInt(c.amount), c.proof]);
    const after = await client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [c.account] });
    check(after - before === BigInt(c.amount), `${c.account} received ${c.amount} base units${caller !== c.account ? " (relayed)" : ""}`);
  }
  const first = manifest.claims[0]!;
  const repeat = await client.simulateContract({ account: first.account, address: distributor, abi: REWARD_ABI, functionName: "claim", args: [1n, first.account, BigInt(first.amount), first.proof] }).then(() => "ok", (e: Error) => e.message);
  check(repeat !== "ok" && repeat.includes("Already claimed"), "a second claim reverts with 'Already claimed'");
  check(await client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [distributor] }) === 0n, "distributor is fully paid out");

  console.log("\nEpoch 2: no trades; carryforward and empty publication");
  await warpTo(origin + 2 * WEEK + 60);
  await finalize();
  const trades2 = join(dir, "trades-2.json");
  writeFileSync(trades2, "[]");
  runCli(2, trades2, config, dir);
  const ledger2 = JSON.parse(readFileSync(join(dir, "epoch-2", "ledger.json"), "utf8")) as { accounting: { previousCarriedDustUnits: string } };
  check(BigInt(ledger2.accounting.previousCarriedDustUnits) === pool - [...expected.values()].reduce((a, b) => a + b, 0n), "epoch 2 carries epoch 1 rounding dust");
  const publish2 = JSON.parse(readFileSync(join(dir, "epoch-2", "publish.json"), "utf8")) as { transactions: Array<{ to: Address; data: Hex }> };
  for (const tx of publish2.transactions) await send(owner, tx.to, tx.data);
  check(await client.readContract({ address: distributor, abi: REWARD_ABI, functionName: "lastPublishedEpoch" }) === 2n, "empty epoch 2 published in sequence");

  console.log("\nAll local reward end-to-end checks passed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
