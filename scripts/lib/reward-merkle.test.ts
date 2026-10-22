// scripts/lib/reward-merkle.test.ts
import { keccak256, toBytes, zeroHash } from "viem";
import { describe, expect, it } from "vitest";

import { parseRewardManifest, type RewardDeployment } from "../../src/lib/rewards";

import { calculateEpochRewards, type StakingEventRecord, type TradeExecutionRecord } from "./epoch-rewards";
import { buildMerkleTree, buildRewardManifest, hashLedger, serializeLedger } from "./reward-merkle";

const ORIGIN = 1_700_000_000;
const WEEK = 604_800;
const deployment: RewardDeployment = {
  chainId: 84532,
  distributor: "0x00000000000000000000000000000000000000D1",
  rewardToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  deploymentBlock: "1",
  epochOrigin: ORIGIN,
  indexUrl: "/rewards/index.json",
};
const context = {
  chainId: deployment.chainId,
  distributor: deployment.distributor!,
  rewardToken: deployment.rewardToken,
  epochOrigin: ORIGIN,
};

function stakers(count: number): StakingEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "Staked" as const,
    user: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
    amount: BigInt(i + 1) * 10n ** 18n,
    timestamp: ORIGIN - 10,
    blockNumber: 1n,
    logIndex: i,
    txHash: `0x${"ab".repeat(32)}`,
  }));
}

const profit: TradeExecutionRecord = {
  txHash: "0xfeed",
  venue: "test",
  timestamp: ORIGIN + 60,
  grossProceedsUsdc: "1123.456789",
  principalCapitalUsdc: "1000",
  tradingFeesUsdc: "1",
  flashLoanFeesUsdc: "0.5",
  gasCostUsdc: "0.25",
  status: "filled",
  hasVerifiedValuation: true,
};

describe("reward Merkle tree", () => {
  it("handles empty and single-leaf trees", () => {
    expect(buildMerkleTree([])).toEqual({ root: zeroHash, proofs: [] });
    const leaf = keccak256(toBytes("leaf"));
    expect(buildMerkleTree([leaf])).toEqual({ root: leaf, proofs: [[]] });
  });

  it.each([1, 2, 3, 5, 8, 13])("produces proofs the app accepts for %i recipients", (count) => {
    const ledger = calculateEpochRewards({
      epochId: 2,
      startTimestamp: ORIGIN + WEEK,
      endTimestamp: ORIGIN + 2 * WEEK,
      trades: [{ ...profit, timestamp: ORIGIN + WEEK + 60 }],
      stakingEvents: stakers(count),
    });
    const ledgerHash = hashLedger(serializeLedger(ledger));
    const manifest = buildRewardManifest(context, ledger, ledgerHash);

    expect(manifest.claims).toHaveLength(count);
    expect(BigInt(manifest.allocation)).toBe(ledger.accounting.totalDistributedUnits);
    // parseRewardManifest verifies every proof, the sum, uniqueness and the epoch window.
    expect(() => parseRewardManifest(JSON.parse(JSON.stringify(manifest)), deployment)).not.toThrow();
  });

  it("is rejected by the app when an amount is altered", () => {
    const ledger = calculateEpochRewards({
      epochId: 1,
      startTimestamp: ORIGIN,
      endTimestamp: ORIGIN + WEEK,
      trades: [profit],
      stakingEvents: stakers(3),
    });
    const manifest = buildRewardManifest(context, ledger, hashLedger(serializeLedger(ledger)));
    const tampered = structuredClone(manifest);
    tampered.claims[0]!.amount = (BigInt(tampered.claims[0]!.amount) + 1n).toString();
    tampered.claims[1]!.amount = (BigInt(tampered.claims[1]!.amount) - 1n).toString();
    expect(() => parseRewardManifest(tampered, deployment)).toThrow(/proof is invalid/);
  });

  it("refuses a ledger whose window is off the distributor schedule", () => {
    const ledger = calculateEpochRewards({
      epochId: 1,
      startTimestamp: ORIGIN + 1,
      endTimestamp: ORIGIN + 1 + WEEK,
      trades: [],
      stakingEvents: [],
    });
    expect(() => buildRewardManifest(context, ledger, zeroHash)).toThrow(/schedule/);
  });

  it("serializes ledgers deterministically", () => {
    const value = { b: 1n, a: [2n] };
    expect(serializeLedger(value)).toBe(serializeLedger(value));
    expect(serializeLedger(value)).toContain('"b": "1"');
  });
});
