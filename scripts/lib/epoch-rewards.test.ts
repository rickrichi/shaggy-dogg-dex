// scripts/lib/epoch-rewards.test.ts
import { describe, expect, it } from "vitest";

import {
  calculateEpochRewards,
  computeStakeWeights,
  formatUsdc,
  parseUsdc,
  type StakingEventRecord,
  type TradeExecutionRecord,
} from "./epoch-rewards";

const ALICE = "0x1111111111111111111111111111111111111111" as const;
const BOB = "0x2222222222222222222222222222222222222222" as const;
const CHARLIE = "0x3333333333333333333333333333333333333333" as const;
const TOKEN = 10n ** 18n;

const EPOCH_START = 1_700_000_000;
const EPOCH_END = EPOCH_START + 7 * 86_400;

let logIndex = 0;
function event(type: "Staked" | "Unstaked", user: `0x${string}`, tokens: bigint, timestamp: number): StakingEventRecord {
  logIndex += 1;
  return {
    type,
    user,
    amount: tokens * TOKEN,
    timestamp,
    blockNumber: BigInt(timestamp),
    logIndex,
    txHash: `0x${logIndex.toString(16).padStart(64, "0")}`,
  };
}

const validTrades: TradeExecutionRecord[] = [
  {
    txHash: "0xaaa1",
    venue: "BaseMainnet",
    timestamp: EPOCH_START + 1000,
    grossProceedsUsdc: "10000",
    principalCapitalUsdc: "9500",
    tradingFeesUsdc: "15",
    flashLoanFeesUsdc: "5",
    gasCostUsdc: "10",
    status: "filled",
    hasVerifiedValuation: true,
  },
  {
    txHash: "0xaaa2",
    venue: "BaseMainnet",
    timestamp: EPOCH_START + 2000,
    grossProceedsUsdc: "5200",
    principalCapitalUsdc: "5000",
    tradingFeesUsdc: "10",
    flashLoanFeesUsdc: "2.5",
    gasCostUsdc: "7.5",
    status: "filled",
    hasVerifiedValuation: true,
  },
];

const openingStakes = [
  event("Staked", ALICE, 1_000n, EPOCH_START - 50_000),
  event("Staked", BOB, 1_000n, EPOCH_START - 40_000),
];

describe("USDC amount parsing", () => {
  it("parses decimal strings exactly into base units", () => {
    expect(parseUsdc("0", "x")).toBe(0n);
    expect(parseUsdc("2.5", "x")).toBe(2_500_000n);
    expect(parseUsdc("250450.000001", "x")).toBe(250_450_000_001n);
    expect(formatUsdc(-1_500_001n)).toBe("-1.500001");
  });

  it("rejects floats, negatives and excess precision", () => {
    for (const bad of [1.5, "-1", "1.0000001", "1e6", "", " 1"]) {
      expect(() => parseUsdc(bad, "field")).toThrow(/decimal string/);
    }
  });
});

describe("staking history replay", () => {
  it("derives the opening balance from events before the epoch", () => {
    const { weights, closingBalances } = computeStakeWeights(openingStakes, EPOCH_START, EPOCH_END);
    expect(weights.get(ALICE)).toBe(1_000n * TOKEN * BigInt(EPOCH_END - EPOCH_START));
    expect(closingBalances.get(BOB)).toBe(1_000n * TOKEN);
  });

  it("weights mid-epoch stake and unstake by duration", () => {
    const events = [
      event("Staked", ALICE, 1_000n, EPOCH_START - 1),
      event("Unstaked", ALICE, 400n, EPOCH_START + 100),
      event("Staked", CHARLIE, 10n, EPOCH_START + 200),
    ];
    const { weights, closingBalances } = computeStakeWeights(events, EPOCH_START, EPOCH_END);
    expect(weights.get(ALICE)).toBe(1_000n * TOKEN * 100n + 600n * TOKEN * BigInt(EPOCH_END - EPOCH_START - 100));
    expect(weights.get(CHARLIE)).toBe(10n * TOKEN * BigInt(EPOCH_END - EPOCH_START - 200));
    expect(closingBalances.get(ALICE)).toBe(600n * TOKEN);
  });

  it("excludes accounts fully unstaked before the epoch", () => {
    const events = [event("Staked", BOB, 5n, EPOCH_START - 10), event("Unstaked", BOB, 5n, EPOCH_START - 5)];
    expect(computeStakeWeights(events, EPOCH_START, EPOCH_END).weights.size).toBe(0);
  });

  it("orders events by block and log index, not array order", () => {
    const stake = event("Staked", ALICE, 5n, EPOCH_START + 10);
    const unstake = event("Unstaked", ALICE, 5n, EPOCH_START + 10);
    expect(() => computeStakeWeights([unstake, stake], EPOCH_START, EPOCH_END)).not.toThrow();
  });

  it("rejects incomplete history and events after the epoch end", () => {
    expect(() => computeStakeWeights([event("Unstaked", ALICE, 1n, EPOCH_START)], EPOCH_START, EPOCH_END)).toThrow(
      /incomplete/,
    );
    expect(() => computeStakeWeights([event("Staked", ALICE, 1n, EPOCH_END)], EPOCH_START, EPOCH_END)).toThrow(
      /after the epoch end/,
    );
  });
});

describe("epoch accounting", () => {
  const base = { epochId: 1, startTimestamp: EPOCH_START, endTimestamp: EPOCH_END, stakingEvents: openingStakes };

  it("splits positive profit exactly 10% / 90% in base units", () => {
    // Net: 470 + 180 = 650 USDC → 65 to stakers, 585 to treasury.
    const ledger = calculateEpochRewards({ ...base, trades: validTrades });
    expect(ledger.accounting.netTradeProceedsUnits).toBe(650_000_000n);
    expect(ledger.accounting.stakerPoolUnits).toBe(65_000_000n);
    expect(ledger.accounting.treasuryShareUnits).toBe(585_000_000n);
    expect(ledger.stakerMetrics.distributions.map((d) => d.rewardUnits)).toEqual([32_500_000n, 32_500_000n]);
    expect(ledger.accounting.totalDistributedUnits).toBe(65_000_000n);
    expect(ledger.accounting.newCarriedDustUnits).toBe(0n);
  });

  it("deducts carried losses before allocation", () => {
    const ledger = calculateEpochRewards({ ...base, trades: validTrades, carriedLossUnits: 200_000_000n });
    expect(ledger.accounting.eligibleNetProfitUnits).toBe(450_000_000n);
    expect(ledger.accounting.stakerPoolUnits).toBe(45_000_000n);
    expect(ledger.accounting.treasuryShareUnits).toBe(405_000_000n);
  });

  it("carries a loss forward and allocates nothing", () => {
    const loss: TradeExecutionRecord = {
      ...validTrades[0]!,
      txHash: "0xloss",
      grossProceedsUsdc: "4800",
      principalCapitalUsdc: "5000",
      tradingFeesUsdc: "0",
      flashLoanFeesUsdc: "0",
      gasCostUsdc: "10",
    };
    const ledger = calculateEpochRewards({ ...base, trades: [loss], carriedLossUnits: 50_000_000n });
    expect(ledger.accounting.eligibleNetProfitUnits).toBe(-260_000_000n);
    expect(ledger.accounting.newCarriedLossUnits).toBe(260_000_000n);
    expect(ledger.accounting.totalDistributedUnits).toBe(0n);
    expect(ledger.stakerMetrics.distributions).toHaveLength(0);
  });

  it("carries the staker pool forward as dust when nobody is staked", () => {
    const ledger = calculateEpochRewards({ ...base, stakingEvents: [], trades: validTrades, carriedDustUnits: 3n });
    expect(ledger.accounting.totalDistributedUnits).toBe(0n);
    expect(ledger.accounting.newCarriedDustUnits).toBe(65_000_003n);
  });

  it("rounds down per account and carries the remainder", () => {
    const events = [
      event("Staked", ALICE, 1_000n, EPOCH_START - 1),
      event("Staked", CHARLIE, 1_000n, EPOCH_START + 302_400),
    ];
    const ledger = calculateEpochRewards({ ...base, stakingEvents: events, trades: validTrades });
    const byAccount = new Map(ledger.stakerMetrics.distributions.map((d) => [d.address, d.rewardUnits]));
    expect(byAccount.get(ALICE)).toBe(43_333_333n);
    expect(byAccount.get(CHARLIE)).toBe(21_666_666n);
    expect(ledger.accounting.newCarriedDustUnits).toBe(1n);
  });

  it("gives an excluded project wallet nothing and the full staker pool to everyone else", () => {
    const PROJECT = "0x88315fb3A3dC6ce4c997caeCdc74637C72857d28" as const;
    const events = [
      event("Staked", PROJECT, 500_000n, EPOCH_START - 1),
      event("Staked", ALICE, 3_000n, EPOCH_START - 1),
      event("Staked", BOB, 2_000n, EPOCH_START - 1),
    ];
    const ledger = calculateEpochRewards({
      ...base,
      stakingEvents: events,
      trades: validTrades,
      excludedAccounts: [PROJECT.toLowerCase() as `0x${string}`, PROJECT],
    });
    const byAccount = new Map(ledger.stakerMetrics.distributions.map((d) => [d.address, d.rewardUnits]));
    expect(byAccount.has(PROJECT)).toBe(false);
    expect(byAccount.get(ALICE)).toBe(39_000_000n); // 3/5 of 65 USDC
    expect(byAccount.get(BOB)).toBe(26_000_000n); // 2/5 of 65 USDC
    expect(ledger.accounting.totalDistributedUnits).toBe(65_000_000n);
    expect(ledger.stakerMetrics.totalEligibleStakers).toBe(2);
    expect(ledger.stakerMetrics.excluded).toEqual([
      { address: PROJECT, timeWeightedTokenSeconds: 500_000n * TOKEN * BigInt(EPOCH_END - EPOCH_START) },
    ]);
  });

  it("carries the pool forward when only excluded wallets are staked", () => {
    const PROJECT = "0x88315fb3A3dC6ce4c997caeCdc74637C72857d28" as const;
    const ledger = calculateEpochRewards({
      ...base,
      stakingEvents: [event("Staked", PROJECT, 500_000n, EPOCH_START - 1)],
      trades: validTrades,
      excludedAccounts: [PROJECT],
    });
    expect(ledger.accounting.totalDistributedUnits).toBe(0n);
    expect(ledger.accounting.newCarriedDustUnits).toBe(65_000_000n);
  });

  it("blocks finalization on unsettled, unverified, duplicate or out-of-window trades", () => {
    const run = (trades: TradeExecutionRecord[]) => () => calculateEpochRewards({ ...base, trades });
    expect(run([{ ...validTrades[0]!, status: "unhedged" }])).toThrow(/status 'unhedged'/);
    expect(run([{ ...validTrades[0]!, hasVerifiedValuation: false }])).toThrow(/unverified/);
    expect(run([validTrades[0]!, validTrades[0]!])).toThrow(/Duplicate/);
    expect(run([{ ...validTrades[0]!, timestamp: EPOCH_END }])).toThrow(/outside epoch window/);
    expect(run([{ ...validTrades[0]!, gasCostUsdc: 0.1 as unknown as string }])).toThrow(/decimal string/);
  });
});
