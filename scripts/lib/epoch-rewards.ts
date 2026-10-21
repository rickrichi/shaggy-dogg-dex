// scripts/lib/epoch-rewards.ts
// Pure epoch accounting. All money is integer USDC base units (6 decimals); no floats.
import { type Address, getAddress } from "viem";

export interface TradeExecutionRecord {
  txHash: string;
  venue: string;
  timestamp: number; // Unix seconds
  // Decimal USDC strings with at most 6 fractional digits, e.g. "250450.25".
  grossProceedsUsdc: string;
  principalCapitalUsdc: string;
  tradingFeesUsdc: string;
  flashLoanFeesUsdc: string;
  gasCostUsdc: string;
  status: "filled" | "pending" | "failed" | "unhedged";
  hasVerifiedValuation: boolean;
}

/** A finalized Staked/Unstaked log from the staking contract, in chain order. */
export interface StakingEventRecord {
  type: "Staked" | "Unstaked";
  user: Address;
  amount: bigint;
  timestamp: number; // Block timestamp, Unix seconds
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

export interface EpochAccountingInput {
  epochId: number;
  startTimestamp: number; // Inclusive
  endTimestamp: number; // Exclusive
  trades: TradeExecutionRecord[];
  /** Every staking event from contract deployment through the epoch end. */
  stakingEvents: StakingEventRecord[];
  carriedLossUnits?: bigint;
  carriedDustUnits?: bigint;
  stakerShareBps?: number;
  treasuryShareBps?: number;
  /** Project-controlled wallets: their stake is recorded but receives no allocation. */
  excludedAccounts?: Address[];
}

export interface ExcludedStake {
  address: Address;
  timeWeightedTokenSeconds: bigint;
}

export interface StakerRewardDistribution {
  address: Address;
  timeWeightedTokenSeconds: bigint;
  weightBps: number; // Display only; payouts use exact integer weights
  rewardUnits: bigint;
}

export interface EpochLedgerResult {
  epochId: number;
  timeWindow: { startTimestamp: number; endTimestamp: number };
  accounting: {
    grossProceedsUnits: bigint;
    principalCapitalUnits: bigint;
    tradingFeesUnits: bigint;
    flashLoanFeesUnits: bigint;
    gasCostUnits: bigint;
    netTradeProceedsUnits: bigint;
    previousCarriedLossUnits: bigint;
    eligibleNetProfitUnits: bigint;
    stakerPoolUnits: bigint; // 10% of eligible profit, before carried dust
    treasuryShareUnits: bigint; // Remainder of eligible profit, so the split sums exactly
    previousCarriedDustUnits: bigint;
    distributableUnits: bigint;
    totalDistributedUnits: bigint; // Equals the distributor funding for this epoch
    newCarriedLossUnits: bigint;
    newCarriedDustUnits: bigint;
  };
  stakerMetrics: {
    totalEligibleStakers: number;
    totalTimeWeightedTokenSeconds: bigint;
    distributions: StakerRewardDistribution[];
    /** Every configured exclusion, with the stake weight it would otherwise have had. */
    excluded: ExcludedStake[];
  };
}

export const USDC_DECIMALS = 6;
export const DEFAULT_STAKER_SHARE_BPS = 1000; // 10%
export const DEFAULT_TREASURY_SHARE_BPS = 9000; // 90%
export const BPS_DIVISOR = 10_000n;

/** Parses a non-negative decimal USDC string into base units without floating point. */
export function parseUsdc(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) {
    throw new Error(`${field} must be a non-negative decimal string with at most 6 decimals.`);
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function formatUsdc(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  return `${sign}${abs / 1_000_000n}.${(abs % 1_000_000n).toString().padStart(6, "0")}`;
}

/** Stable chain order: block, then log index. */
export function compareStakingEvents(a: StakingEventRecord, b: StakingEventRecord): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/**
 * Integrates each account's staked balance over [start, end) from the full event history.
 * Events before `start` set the opening balance; later events change it from their block time.
 */
export function computeStakeWeights(
  events: StakingEventRecord[],
  startTimestamp: number,
  endTimestamp: number,
): { weights: Map<Address, bigint>; closingBalances: Map<Address, bigint> } {
  const sorted = [...events].sort(compareStakingEvents);
  const balances = new Map<Address, bigint>();
  const weights = new Map<Address, bigint>();
  const lastChange = new Map<Address, number>();
  let previous: StakingEventRecord | undefined;

  for (const event of sorted) {
    if (previous && event.timestamp < previous.timestamp) {
      throw new Error(`Staking event ${event.txHash} has a timestamp earlier than the prior block.`);
    }
    previous = event;
    if (event.timestamp >= endTimestamp) {
      throw new Error(`Staking event ${event.txHash} is after the epoch end; fetch history only through the end block.`);
    }
    if (event.amount <= 0n) throw new Error(`Staking event ${event.txHash} has a non-positive amount.`);
    const user = getAddress(event.user);
    const balance = balances.get(user) ?? 0n;
    if (event.timestamp >= startTimestamp) {
      const from = Math.max(lastChange.get(user) ?? startTimestamp, startTimestamp);
      weights.set(user, (weights.get(user) ?? 0n) + balance * BigInt(event.timestamp - from));
      lastChange.set(user, event.timestamp);
    }
    const next = event.type === "Staked" ? balance + event.amount : balance - event.amount;
    if (next < 0n) throw new Error(`Negative staking balance for ${user} at ${event.txHash}; event history is incomplete.`);
    balances.set(user, next);
  }

  for (const [user, balance] of balances) {
    const from = Math.max(lastChange.get(user) ?? startTimestamp, startTimestamp);
    weights.set(user, (weights.get(user) ?? 0n) + balance * BigInt(endTimestamp - from));
  }
  for (const [user, weight] of weights) if (weight === 0n) weights.delete(user);
  return { weights, closingBalances: balances };
}

/**
 * Calculates net profit, the 10/90 split, and time-weighted staker allocations.
 * Unsettled trades or unverified valuations block finalization. Losses and rounding dust carry forward.
 */
export function calculateEpochRewards(input: EpochAccountingInput): EpochLedgerResult {
  const {
    epochId,
    startTimestamp,
    endTimestamp,
    trades,
    stakingEvents,
    carriedLossUnits = 0n,
    carriedDustUnits = 0n,
    stakerShareBps = DEFAULT_STAKER_SHARE_BPS,
    treasuryShareBps = DEFAULT_TREASURY_SHARE_BPS,
    excludedAccounts = [],
  } = input;

  if (!Number.isSafeInteger(epochId) || epochId < 1) throw new Error("Epoch ID must be a positive integer.");
  if (endTimestamp <= startTimestamp) {
    throw new Error("Invalid epoch window: endTimestamp must be strictly after startTimestamp.");
  }
  if (stakerShareBps + treasuryShareBps !== 10_000) throw new Error("Staker and treasury shares must total 10,000 bps.");
  if (carriedLossUnits < 0n || carriedDustUnits < 0n) throw new Error("Carried values cannot be negative.");

  let grossProceedsUnits = 0n;
  let principalCapitalUnits = 0n;
  let tradingFeesUnits = 0n;
  let flashLoanFeesUnits = 0n;
  let gasCostUnits = 0n;
  const seenTrades = new Set<string>();

  for (const trade of trades) {
    if (seenTrades.has(trade.txHash.toLowerCase())) throw new Error(`Duplicate trade record ${trade.txHash}.`);
    seenTrades.add(trade.txHash.toLowerCase());
    if (trade.status !== "filled") {
      throw new Error(
        `Epoch finalization blocked: Trade ${trade.txHash} has status '${trade.status}'. All trades must be 'filled'.`,
      );
    }
    if (!trade.hasVerifiedValuation) {
      throw new Error(`Epoch finalization blocked: Trade ${trade.txHash} has unverified expense valuation.`);
    }
    if (trade.timestamp < startTimestamp || trade.timestamp >= endTimestamp) {
      throw new Error(
        `Trade ${trade.txHash} timestamp (${trade.timestamp}) falls outside epoch window [${startTimestamp}, ${endTimestamp}).`,
      );
    }
    grossProceedsUnits += parseUsdc(trade.grossProceedsUsdc, `${trade.txHash} grossProceedsUsdc`);
    principalCapitalUnits += parseUsdc(trade.principalCapitalUsdc, `${trade.txHash} principalCapitalUsdc`);
    tradingFeesUnits += parseUsdc(trade.tradingFeesUsdc, `${trade.txHash} tradingFeesUsdc`);
    flashLoanFeesUnits += parseUsdc(trade.flashLoanFeesUsdc, `${trade.txHash} flashLoanFeesUsdc`);
    gasCostUnits += parseUsdc(trade.gasCostUsdc, `${trade.txHash} gasCostUsdc`);
  }

  const netTradeProceedsUnits =
    grossProceedsUnits - principalCapitalUnits - tradingFeesUnits - flashLoanFeesUnits - gasCostUnits;
  const eligibleNetProfitUnits = netTradeProceedsUnits - carriedLossUnits;

  let stakerPoolUnits = 0n;
  let treasuryShareUnits = 0n;
  let newCarriedLossUnits = 0n;
  if (eligibleNetProfitUnits <= 0n) {
    newCarriedLossUnits = -eligibleNetProfitUnits;
  } else {
    stakerPoolUnits = (eligibleNetProfitUnits * BigInt(stakerShareBps)) / BPS_DIVISOR;
    treasuryShareUnits = eligibleNetProfitUnits - stakerPoolUnits;
  }

  const { weights } = computeStakeWeights(stakingEvents, startTimestamp, endTimestamp);
  const excluded: ExcludedStake[] = [...new Set(excludedAccounts.map((a) => getAddress(a)))].map((address) => {
    const timeWeightedTokenSeconds = weights.get(address) ?? 0n;
    weights.delete(address);
    return { address, timeWeightedTokenSeconds };
  });
  let totalTimeWeightedTokenSeconds = 0n;
  for (const weight of weights.values()) totalTimeWeightedTokenSeconds += weight;

  const distributableUnits = stakerPoolUnits + carriedDustUnits;
  const distributions: StakerRewardDistribution[] = [];
  let totalDistributedUnits = 0n;

  if (distributableUnits > 0n && totalTimeWeightedTokenSeconds > 0n) {
    for (const [address, weight] of weights) {
      const rewardUnits = (distributableUnits * weight) / totalTimeWeightedTokenSeconds;
      distributions.push({
        address,
        timeWeightedTokenSeconds: weight,
        weightBps: Number((weight * BPS_DIVISOR) / totalTimeWeightedTokenSeconds),
        rewardUnits,
      });
      totalDistributedUnits += rewardUnits;
    }
  }

  distributions.sort((a, b) =>
    a.rewardUnits === b.rewardUnits ? a.address.localeCompare(b.address) : a.rewardUnits > b.rewardUnits ? -1 : 1,
  );

  return {
    epochId,
    timeWindow: { startTimestamp, endTimestamp },
    accounting: {
      grossProceedsUnits,
      principalCapitalUnits,
      tradingFeesUnits,
      flashLoanFeesUnits,
      gasCostUnits,
      netTradeProceedsUnits,
      previousCarriedLossUnits: carriedLossUnits,
      eligibleNetProfitUnits,
      stakerPoolUnits,
      treasuryShareUnits,
      previousCarriedDustUnits: carriedDustUnits,
      distributableUnits,
      totalDistributedUnits,
      newCarriedLossUnits,
      newCarriedDustUnits: distributableUnits - totalDistributedUnits,
    },
    stakerMetrics: {
      totalEligibleStakers: weights.size,
      totalTimeWeightedTokenSeconds,
      distributions: distributions.filter((d) => d.rewardUnits > 0n),
      excluded,
    },
  };
}
