// scripts/lib/epoch-rewards.test.ts
import { describe, expect, it } from "vitest";

import {
  calculateEpochRewards,
  type EpochAccountingInput,
  type StakingEventRecord,
  type TradeExecutionRecord,
} from "./epoch-rewards";

describe("Epoch Rewards Accounting Ledger", () => {
  const ALICE = "0x1111111111111111111111111111111111111111" as const;
  const BOB = "0x2222222222222222222222222222222222222222" as const;
  const CHARLIE = "0x3333333333333333333333333333333333333333" as const;

  const EPOCH_START = 1700000000;
  const EPOCH_END = 1700000000 + 7 * 86400; // 7 days later

  const validTrades: TradeExecutionRecord[] = [
    {
      txHash: "0xaaa1",
      venue: "BaseMainnet",
      timestamp: EPOCH_START + 1000,
      grossProceedsUsdc: 10_000,
      principalCapitalUsdc: 9_500,
      tradingFeesUsdc: 15,
      flashLoanFeesUsdc: 5,
      gasCostUsdc: 10,
      status: "filled",
      hasVerifiedValuation: true,
    },
    {
      txHash: "0xaaa2",
      venue: "BaseMainnet",
      timestamp: EPOCH_START + 2000,
      grossProceedsUsdc: 5_200,
      principalCapitalUsdc: 5_000,
      tradingFeesUsdc: 10,
      flashLoanFeesUsdc: 2.5,
      gasCostUsdc: 7.5,
      status: "filled",
      hasVerifiedValuation: true,
    },
  ];

  it("calculates exact 10% staker and 90% treasury split on positive net profits", () => {
    // Trade 1 net: 10000 - 9500 - 15 - 5 - 10 = 470 USDC
    // Trade 2 net: 5200 - 5000 - 10 - 2.5 - 7.5 = 180 USDC
    // Total net profit = 650 USDC
    // 10% Stakers = 65.00 USDC
    // 90% Treasury = 585.00 USDC

    const input: EpochAccountingInput = {
      epochId: 1,
      startTimestamp: EPOCH_START,
      endTimestamp: EPOCH_END,
      trades: validTrades,
      initialStakes: [
        { user: ALICE, balance: 1_000n * 10n ** 18n },
        { user: BOB, balance: 1_000n * 10n ** 18n },
      ],
      stakingEvents: [],
      carriedLossUsdc: 0,
      carriedDustUnits: 0n,
    };

    const ledger = calculateEpochRewards(input);

    expect(ledger.accounting.grossProceedsUsdc).toBe(15_200);
    expect(ledger.accounting.netTradeProceedsUsdc).toBe(650);
    expect(ledger.accounting.eligibleNetProfitUsdc).toBe(650);
    expect(ledger.accounting.stakerRewardPoolUsdc).toBe(65);
    expect(ledger.accounting.treasuryShareUsdc).toBe(585);
    expect(ledger.accounting.newCarriedLossUsdc).toBe(0);

    // Alice and Bob held equal stake for the entire epoch
    expect(ledger.stakerMetrics.distributions).toHaveLength(2);
    const aliceDist = ledger.stakerMetrics.distributions.find((d) => d.address === ALICE)!;
    const bobDist = ledger.stakerMetrics.distributions.find((d) => d.address === BOB)!;

    expect(aliceDist.rewardUnits).toBe(32_500_000n); // 32.50 USDC
    expect(bobDist.rewardUnits).toBe(32_500_000n); // 32.50 USDC
    expect(aliceDist.rewardUsdcFormatted).toBe("32.500000");
    expect(bobDist.rewardUsdcFormatted).toBe("32.500000");
    expect(ledger.accounting.newCarriedDustUnits).toBe(0n);
  });

  it("deducts carried losses before allocating to stakers", () => {
    // Total net: 650 USDC. Carried loss: 200 USDC.
    // Eligible net profit: 450 USDC.
    // 10% Stakers = 45.00 USDC.
    // 90% Treasury = 405.00 USDC.

    const input: EpochAccountingInput = {
      epochId: 2,
      startTimestamp: EPOCH_START,
      endTimestamp: EPOCH_END,
      trades: validTrades,
      initialStakes: [{ user: ALICE, balance: 500n * 10n ** 18n }],
      stakingEvents: [],
      carriedLossUsdc: 200,
    };

    const ledger = calculateEpochRewards(input);
    expect(ledger.accounting.netTradeProceedsUsdc).toBe(650);
    expect(ledger.accounting.eligibleNetProfitUsdc).toBe(450);
    expect(ledger.accounting.stakerRewardPoolUsdc).toBe(45);
    expect(ledger.accounting.treasuryShareUsdc).toBe(405);
    expect(ledger.accounting.newCarriedLossUsdc).toBe(0);
  });

  it("yields zero rewards and carries forward deficit when net profit is negative", () => {
    // Loss trade: Gross 4,800, Capital 5,000, Gas 10 -> Net -210 USDC
    const lossTrades: TradeExecutionRecord[] = [
      {
        txHash: "0xloss",
        venue: "BaseMainnet",
        timestamp: EPOCH_START + 500,
        grossProceedsUsdc: 4_800,
        principalCapitalUsdc: 5_000,
        tradingFeesUsdc: 0,
        flashLoanFeesUsdc: 0,
        gasCostUsdc: 10,
        status: "filled",
        hasVerifiedValuation: true,
      },
    ];

    const input: EpochAccountingInput = {
      epochId: 3,
      startTimestamp: EPOCH_START,
      endTimestamp: EPOCH_END,
      trades: lossTrades,
      initialStakes: [{ user: ALICE, balance: 1_000n * 10n ** 18n }],
      stakingEvents: [],
      carriedLossUsdc: 50, // Existing loss
    };

    const ledger = calculateEpochRewards(input);
    expect(ledger.accounting.netTradeProceedsUsdc).toBe(-210);
    expect(ledger.accounting.eligibleNetProfitUsdc).toBe(-260);
    expect(ledger.accounting.stakerRewardPoolUsdc).toBe(0);
    expect(ledger.accounting.treasuryShareUsdc).toBe(0);
    expect(ledger.accounting.newCarriedLossUsdc).toBe(260);
    expect(ledger.stakerMetrics.distributions).toHaveLength(0);
  });

  it("blocks epoch finalization on unhedged or unverified trades", () => {
    const unhedgedTrades: TradeExecutionRecord[] = [
      {
        ...validTrades[0],
        status: "unhedged",
      },
    ];

    expect(() =>
      calculateEpochRewards({
        epochId: 4,
        startTimestamp: EPOCH_START,
        endTimestamp: EPOCH_END,
        trades: unhedgedTrades,
        initialStakes: [],
        stakingEvents: [],
      })
    ).toThrowError(/Epoch finalization blocked: Trade .* status 'unhedged'/);

    const unverifiedTrades: TradeExecutionRecord[] = [
      {
        ...validTrades[0],
        hasVerifiedValuation: false,
      },
    ];

    expect(() =>
      calculateEpochRewards({
        epochId: 5,
        startTimestamp: EPOCH_START,
        endTimestamp: EPOCH_END,
        trades: unverifiedTrades,
        initialStakes: [],
        stakingEvents: [],
      })
    ).toThrowError(/unverified expense valuation/);
  });

  it("accurately weights mid-epoch stakes and unstakes", () => {
    // Epoch duration: 7 days = 604,800 seconds
    // Midpoint: EPOCH_START + 302,400 seconds
    // Alice stakes 1,000 AMUTT for whole epoch (604,800s) => Weight = 1,000 * 604,800 = 604,800,000
    // Charlie stakes 1,000 AMUTT at midpoint => Weight = 1,000 * 302,400 = 302,400,000
    // Total weight = 907,200,000 (Alice has 2/3 weight, Charlie has 1/3 weight)

    const events: StakingEventRecord[] = [
      {
        type: "Staked",
        user: CHARLIE,
        amount: 1_000n * 10n ** 18n,
        timestamp: EPOCH_START + 302_400,
        txHash: "0xcharlie_stake",
      },
    ];

    const input: EpochAccountingInput = {
      epochId: 6,
      startTimestamp: EPOCH_START,
      endTimestamp: EPOCH_END,
      trades: validTrades, // 650 USDC net profit => 65 USDC staker pool
      initialStakes: [{ user: ALICE, balance: 1_000n * 10n ** 18n }],
      stakingEvents: events,
      carriedLossUsdc: 0,
      carriedDustUnits: 0n,
    };

    const ledger = calculateEpochRewards(input);
    expect(ledger.stakerMetrics.distributions).toHaveLength(2);

    const alice = ledger.stakerMetrics.distributions.find((d) => d.address === ALICE)!;
    const charlie = ledger.stakerMetrics.distributions.find((d) => d.address === CHARLIE)!;

    // Alice gets 2/3 of 65 USDC = 43.333333 USDC
    // Charlie gets 1/3 of 65 USDC = 21.666666 USDC
    // Dust: 65,000,000 - (43,333,333 + 21,666,666) = 1 micro-USDC
    expect(alice.rewardUnits).toBe(43_333_333n);
    expect(charlie.rewardUnits).toBe(21_666_666n);
    expect(ledger.accounting.newCarriedDustUnits).toBe(1n);
  });
});
