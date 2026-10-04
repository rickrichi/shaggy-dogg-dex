// scripts/lib/epoch-rewards.ts
import { type Address, getAddress } from "viem";

export interface TradeExecutionRecord {
  txHash: string;
  venue: string;
  timestamp: number; // Unix seconds
  grossProceedsUsdc: number;
  principalCapitalUsdc: number;
  tradingFeesUsdc: number;
  flashLoanFeesUsdc: number;
  gasCostUsdc: number;
  status: "filled" | "pending" | "failed" | "unhedged";
  hasVerifiedValuation: boolean;
}

export interface StakingEventRecord {
  type: "Staked" | "Unstaked";
  user: Address;
  amount: bigint;
  timestamp: number; // Unix seconds
  blockNumber?: bigint;
  txHash?: string;
}

export interface StakerInitialBalance {
  user: Address;
  balance: bigint;
}

export interface EpochAccountingInput {
  epochId: number;
  startTimestamp: number; // Unix seconds
  endTimestamp: number; // Unix seconds
  trades: TradeExecutionRecord[];
  initialStakes: StakerInitialBalance[];
  stakingEvents: StakingEventRecord[];
  carriedLossUsdc?: number;
  carriedDustUnits?: bigint; // 6-decimal micro-USDC dust
  stakerShareBps?: number; // Default: 1000 (10%)
  treasuryShareBps?: number; // Default: 9000 (90%)
}

export interface StakerRewardDistribution {
  address: Address;
  timeWeightedTokenSeconds: bigint;
  weightBps: number; // Proportional share in basis points (10,000 = 100%)
  rewardUnits: bigint; // Micro-USDC integer base units (6 decimals)
  rewardUsdcFormatted: string;
}

export interface EpochLedgerResult {
  epochId: number;
  finalizedAt: string;
  timeWindow: {
    start: string;
    end: string;
    durationSeconds: number;
  };
  accounting: {
    grossProceedsUsdc: number;
    principalCapitalUsdc: number;
    tradingFeesUsdc: number;
    flashLoanFeesUsdc: number;
    gasCostUsdc: number;
    netTradeProceedsUsdc: number;
    previousCarriedLossUsdc: number;
    eligibleNetProfitUsdc: number;
    stakerRewardPoolUsdc: number;
    treasuryShareUsdc: number;
    stakerPoolUnitsTotal: bigint;
    totalDistributedUnits: bigint;
    newCarriedLossUsdc: number;
    newCarriedDustUnits: bigint;
  };
  stakerMetrics: {
    totalEligibleStakers: number;
    totalTimeWeightedTokenSeconds: bigint;
    distributions: StakerRewardDistribution[];
  };
}

export const USDC_DECIMALS = 6;
export const DEFAULT_STAKER_SHARE_BPS = 1000; // 10%
export const DEFAULT_TREASURY_SHARE_BPS = 9000; // 90%
export const BPS_DIVISOR = 10_000n;

/**
 * Calculates epoch net profits, validates trade leg settlement, computes
 * time-weighted staker balances from finalized events, and calculates integer
 * USDC reward distributions with loss/dust carryforward.
 */
export function calculateEpochRewards(input: EpochAccountingInput): EpochLedgerResult {
  const {
    epochId,
    startTimestamp,
    endTimestamp,
    trades,
    initialStakes,
    stakingEvents,
    carriedLossUsdc = 0,
    carriedDustUnits = 0n,
    stakerShareBps = DEFAULT_STAKER_SHARE_BPS,
    treasuryShareBps = DEFAULT_TREASURY_SHARE_BPS,
  } = input;

  if (endTimestamp <= startTimestamp) {
    throw new Error("Invalid epoch window: endTimestamp must be strictly after startTimestamp.");
  }

  // 1. Audit trade records: Unsettled trade legs or missing valuations block finalization
  let grossProceedsUsdc = 0;
  let principalCapitalUsdc = 0;
  let tradingFeesUsdc = 0;
  let flashLoanFeesUsdc = 0;
  let gasCostUsdc = 0;

  for (const trade of trades) {
    if (trade.status !== "filled") {
      throw new Error(
        `Epoch finalization blocked: Trade ${trade.txHash} has status '${trade.status}'. All trades must be 'filled'.`
      );
    }
    if (!trade.hasVerifiedValuation) {
      throw new Error(
        `Epoch finalization blocked: Trade ${trade.txHash} has unverified expense valuation.`
      );
    }
    if (trade.timestamp < startTimestamp || trade.timestamp > endTimestamp) {
      throw new Error(
        `Trade ${trade.txHash} timestamp (${trade.timestamp}) falls outside epoch window [${startTimestamp}, ${endTimestamp}].`
      );
    }

    grossProceedsUsdc += trade.grossProceedsUsdc;
    principalCapitalUsdc += trade.principalCapitalUsdc;
    tradingFeesUsdc += trade.tradingFeesUsdc;
    flashLoanFeesUsdc += trade.flashLoanFeesUsdc;
    gasCostUsdc += trade.gasCostUsdc;
  }

  const netTradeProceedsUsdc =
    grossProceedsUsdc -
    principalCapitalUsdc -
    tradingFeesUsdc -
    flashLoanFeesUsdc -
    gasCostUsdc;

  const eligibleNetProfitUsdc = netTradeProceedsUsdc - carriedLossUsdc;

  // 2. Net profit allocation (Zero-Hallucinated-Yield: profit must be strictly positive)
  let stakerRewardPoolUsdc = 0;
  let treasuryShareUsdc = 0;
  let stakerPoolUnitsTotal = 0n;
  let newCarriedLossUsdc = 0;

  if (eligibleNetProfitUsdc <= 0) {
    // Loss or zero profit carries forward; no distribution occurs
    newCarriedLossUsdc = Math.abs(eligibleNetProfitUsdc);
  } else {
    stakerRewardPoolUsdc = (eligibleNetProfitUsdc * stakerShareBps) / 10_000;
    treasuryShareUsdc = (eligibleNetProfitUsdc * treasuryShareBps) / 10_000;

    // Convert to integer micro-USDC base units and add carried dust
    const baseUnitsFromProfit = BigInt(Math.floor(stakerRewardPoolUsdc * 1_000_000));
    stakerPoolUnitsTotal = baseUnitsFromProfit + carriedDustUnits;
  }

  // 3. Compute time-weighted staking balances across the epoch
  const userTimelines = new Map<string, Array<{ timestamp: number; balance: bigint }>>();

  // Seed initial balances at startTimestamp
  for (const item of initialStakes) {
    const addr = getAddress(item.user);
    if (!userTimelines.has(addr)) {
      userTimelines.set(addr, []);
    }
    userTimelines.get(addr)!.push({ timestamp: startTimestamp, balance: item.balance });
  }

  // Filter and sort staking events within the epoch
  const sortedEvents = [...stakingEvents]
    .filter((e) => e.timestamp >= startTimestamp && e.timestamp <= endTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const ev of sortedEvents) {
    const addr = getAddress(ev.user);
    if (!userTimelines.has(addr)) {
      userTimelines.set(addr, [{ timestamp: startTimestamp, balance: 0n }]);
    }
    const timeline = userTimelines.get(addr)!;
    const currentBalance = timeline[timeline.length - 1].balance;
    const nextBalance =
      ev.type === "Staked" ? currentBalance + ev.amount : currentBalance - ev.amount;
    if (nextBalance < 0n) {
      throw new Error(`Negative staking balance computed for ${addr} at event ${ev.txHash ?? ""}`);
    }
    timeline.push({ timestamp: ev.timestamp, balance: nextBalance });
  }

  // Calculate integral: sum(balance_i * duration_i)
  const stakerWeights = new Map<Address, bigint>();
  let totalTimeWeightedTokenSeconds = 0n;

  for (const [addrStr, timeline] of userTimelines.entries()) {
    const addr = getAddress(addrStr) as Address;
    let userWeight = 0n;
    for (let i = 0; i < timeline.length; i++) {
      const segStart = timeline[i].timestamp;
      const segEnd = i + 1 < timeline.length ? timeline[i + 1].timestamp : endTimestamp;
      const duration = BigInt(Math.max(0, segEnd - segStart));
      userWeight += timeline[i].balance * duration;
    }
    if (userWeight > 0n) {
      stakerWeights.set(addr, userWeight);
      totalTimeWeightedTokenSeconds += userWeight;
    }
  }

  // 4. Distribute staker pool proportionally, rounded down to USDC base units
  const distributions: StakerRewardDistribution[] = [];
  let totalDistributedUnits = 0n;

  if (stakerPoolUnitsTotal > 0n && totalTimeWeightedTokenSeconds > 0n) {
    for (const [address, weight] of stakerWeights.entries()) {
      // Floor division down to base units (1 micro-USDC)
      const rewardUnits = (stakerPoolUnitsTotal * weight) / totalTimeWeightedTokenSeconds;
      const weightBps = Number((weight * BPS_DIVISOR) / totalTimeWeightedTokenSeconds);
      const rewardUsdcFormatted = (Number(rewardUnits) / 1_000_000).toFixed(6);

      distributions.push({
        address,
        timeWeightedTokenSeconds: weight,
        weightBps,
        rewardUnits,
        rewardUsdcFormatted,
      });

      totalDistributedUnits += rewardUnits;
    }
  }

  const newCarriedDustUnits =
    stakerPoolUnitsTotal > 0n ? stakerPoolUnitsTotal - totalDistributedUnits : carriedDustUnits;

  // Sort distributions descending by reward amount
  distributions.sort((a, b) => (b.rewardUnits > a.rewardUnits ? 1 : -1));

  return {
    epochId,
    finalizedAt: new Date().toISOString(),
    timeWindow: {
      start: new Date(startTimestamp * 1000).toISOString(),
      end: new Date(endTimestamp * 1000).toISOString(),
      durationSeconds: endTimestamp - startTimestamp,
    },
    accounting: {
      grossProceedsUsdc,
      principalCapitalUsdc,
      tradingFeesUsdc,
      flashLoanFeesUsdc,
      gasCostUsdc,
      netTradeProceedsUsdc,
      previousCarriedLossUsdc: carriedLossUsdc,
      eligibleNetProfitUsdc,
      stakerRewardPoolUsdc,
      treasuryShareUsdc,
      stakerPoolUnitsTotal,
      totalDistributedUnits,
      newCarriedLossUsdc,
      newCarriedDustUnits,
    },
    stakerMetrics: {
      totalEligibleStakers: stakerWeights.size,
      totalTimeWeightedTokenSeconds,
      distributions,
    },
  };
}
