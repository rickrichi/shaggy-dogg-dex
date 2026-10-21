// scripts/lib/staking-history.ts
// Reads finalized FeeDiscountStaking history from chain. There is no fallback: any RPC
// failure, gap, or balance mismatch aborts the epoch rather than inventing stakers.
import { type Address, getAddress, parseAbi, parseAbiItem, type PublicClient } from "viem";

import type { StakingEventRecord } from "./epoch-rewards";

const STAKED = parseAbiItem("event Staked(address indexed user, uint256 amount)");
const UNSTAKED = parseAbiItem("event Unstaked(address indexed user, uint256 amount, uint256 fee)");
const STAKING_ABI = parseAbi(["function stakedBalance(address) view returns (uint256)"]);

type Client = Pick<PublicClient, "getBlock" | "getBytecode" | "getLogs" | "readContract">;

/** Highest block whose timestamp is strictly before `timestamp`. */
export async function findLastBlockBefore(client: Client, timestamp: number, upperBound: bigint): Promise<bigint> {
  let low = 0n;
  let high = upperBound;
  const top = await client.getBlock({ blockNumber: high });
  if (Number(top.timestamp) < timestamp) {
    throw new Error("The epoch end is not yet covered by a finalized block. Wait for finality and retry.");
  }
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (Number(block.timestamp) < timestamp) low = mid;
    else high = mid - 1n;
  }
  return low;
}

/** First block at which `address` has code (requires historical state). */
export async function findDeploymentBlock(client: Client, address: Address, upperBound: bigint): Promise<bigint> {
  const code = await client.getBytecode({ address, blockNumber: upperBound });
  if (!code || code === "0x") throw new Error(`No contract code at ${address} by block ${upperBound}.`);
  let low = 0n;
  let high = upperBound;
  while (low < high) {
    const mid = (low + high) / 2n;
    const atMid = await client.getBytecode({ address, blockNumber: mid });
    if (atMid && atMid !== "0x") high = mid;
    else low = mid + 1n;
  }
  return low;
}

export interface StakingHistory {
  events: StakingEventRecord[];
  fromBlock: bigint;
  toBlock: bigint;
}

export async function fetchStakingHistory(
  client: Client,
  staking: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize = 5_000n,
): Promise<StakingHistory> {
  const events: StakingEventRecord[] = [];
  const timestamps = new Map<bigint, number>();
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n < toBlock ? start + chunkSize - 1n : toBlock;
    const logs = await client.getLogs({
      address: staking,
      events: [STAKED, UNSTAKED],
      fromBlock: start,
      toBlock: end,
      strict: true,
    });
    for (const log of logs) {
      if (log.removed || log.blockNumber === null || log.logIndex === null || log.transactionHash === null) {
        throw new Error("Received a pending or removed staking log; retry against finalized blocks.");
      }
      let timestamp = timestamps.get(log.blockNumber);
      if (timestamp === undefined) {
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        timestamp = Number(block.timestamp);
        timestamps.set(log.blockNumber, timestamp);
      }
      events.push({
        type: log.eventName,
        user: getAddress(log.args.user),
        amount: log.args.amount,
        timestamp,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        txHash: log.transactionHash,
      });
    }
  }
  return { events, fromBlock, toBlock };
}

/** Confirms that replayed balances equal the contract's own `stakedBalance` at `blockNumber`. */
export async function verifyClosingBalances(
  client: Client,
  staking: Address,
  closingBalances: Map<Address, bigint>,
  blockNumber: bigint,
): Promise<void> {
  for (const [user, expected] of closingBalances) {
    const actual = await client.readContract({
      address: staking,
      abi: STAKING_ABI,
      functionName: "stakedBalance",
      args: [user],
      blockNumber,
    });
    if (actual !== expected) {
      throw new Error(
        `Staking history mismatch for ${user} at block ${blockNumber}: replayed ${expected}, contract reports ${actual}.`,
      );
    }
  }
}
