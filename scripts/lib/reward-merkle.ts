// scripts/lib/reward-merkle.ts
// Builds the claim tree and public manifest using the exact leaf/pair rules the app and
// WeeklyUsdcDistributor verify (src/lib/rewards.ts).
import { type Address, getAddress, type Hex, keccak256, toBytes, zeroHash } from "viem";

import {
  hashRewardPair,
  REWARD_WEEK,
  type RewardClaim,
  rewardLeaf,
  type RewardManifest,
} from "../../src/lib/rewards";

import type { EpochLedgerResult } from "./epoch-rewards";

export interface MerkleResult {
  root: Hex;
  proofs: Hex[][];
}

/** Pairwise tree; an unpaired node is promoted unchanged to the next level. */
export function buildMerkleTree(leaves: Hex[]): MerkleResult {
  if (leaves.length === 0) return { root: zeroHash, proofs: [] };
  const proofs: Hex[][] = leaves.map(() => []);
  let level = leaves.map((hash, i) => ({ hash, members: [i] }));
  while (level.length > 1) {
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      if (!right) {
        next.push(left);
        continue;
      }
      for (const m of left.members) proofs[m]!.push(right.hash);
      for (const m of right.members) proofs[m]!.push(left.hash);
      next.push({ hash: hashRewardPair(left.hash, right.hash), members: [...left.members, ...right.members] });
    }
    level = next;
  }
  return { root: level[0]!.hash, proofs };
}

/** Deterministic JSON for ledgers: bigint as decimal strings, two-space indent, trailing newline. */
export function serializeLedger(value: unknown): string {
  return `${JSON.stringify(value, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`;
}

export function hashLedger(serialized: string): Hex {
  return keccak256(toBytes(serialized));
}

export interface ManifestContext {
  chainId: number;
  distributor: Address;
  rewardToken: Address;
  epochOrigin: number;
}

export function buildRewardManifest(
  context: ManifestContext,
  ledger: EpochLedgerResult,
  ledgerHash: Hex,
): RewardManifest {
  const epochId = BigInt(ledger.epochId);
  const startTimestamp = context.epochOrigin + (ledger.epochId - 1) * REWARD_WEEK;
  if (
    ledger.timeWindow.startTimestamp !== startTimestamp ||
    ledger.timeWindow.endTimestamp !== startTimestamp + REWARD_WEEK
  ) {
    throw new Error("Ledger window does not match the distributor's epoch schedule.");
  }
  const sorted = ledger.stakerMetrics.distributions
    .filter((d) => d.rewardUnits > 0n)
    .map((d) => ({ account: getAddress(d.address), amount: d.rewardUnits }))
    .sort((a, b) => a.account.toLowerCase().localeCompare(b.account.toLowerCase()));
  const leaves = sorted.map((d) => rewardLeaf(context.chainId, context.distributor, epochId, d.account, d.amount));
  const { root, proofs } = buildMerkleTree(leaves);
  const claims: RewardClaim[] = sorted.map((d, i) => ({
    account: d.account,
    amount: d.amount.toString(),
    proof: proofs[i]!,
  }));
  const allocation = sorted.reduce((sum, d) => sum + d.amount, 0n);
  if (allocation !== ledger.accounting.totalDistributedUnits) {
    throw new Error("Manifest allocation differs from the ledger's distributed total.");
  }
  return {
    version: 1,
    chainId: context.chainId,
    distributor: getAddress(context.distributor),
    rewardToken: getAddress(context.rewardToken),
    epochId: epochId.toString(),
    startTimestamp,
    endTimestamp: startTimestamp + REWARD_WEEK,
    root,
    ledgerHash,
    allocation: allocation.toString(),
    claims,
  };
}
