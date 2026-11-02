// src/lib/launchpad/settings.ts
import type { ArchetypeId, LaunchpadFormState } from "./types";

/** Contract limits: FeeDiscountStaking.sol and Yield/CompoundYieldVault.sol. */
export const MAX_PERFORMANCE_FEE_BPS = 3000;
export const MAX_UNSTAKE_FEE_BPS = 5000;
/** Matches FeeDiscountStaking.MAXIMUM_STAKE_PERIOD. */
export const MAX_STAKING_LOCK_DAYS = 365;

/**
 * Same discounts as DeployEcosystem.sol. Its thresholds are fixed token amounts, so here they
 * scale with supply: 0.01%, 0.1%, 1% and 10%. Ascending, because getTier() keeps the last match.
 */
export const STAKING_TIER_SCHEDULE = [
  { supplyDivisor: 10_000n, supplyLabel: "0.01%", discountBps: 1000 },
  { supplyDivisor: 1_000n, supplyLabel: "0.1%", discountBps: 2500 },
  { supplyDivisor: 100n, supplyLabel: "1%", discountBps: 5000 },
  { supplyDivisor: 10n, supplyLabel: "10%", discountBps: 7500 },
] as const;

export function stakingTiers(supplyUnits: bigint) {
  return STAKING_TIER_SCHEDULE.map(({ supplyDivisor, discountBps }) => ({
    stakeRequired: supplyUnits / supplyDivisor,
    discountBps,
  }));
}

export function deploysStaking(archetype: ArchetypeId): boolean {
  return ["staking_rewards", "aave_v3_yield", "full_defi_suite"].includes(archetype);
}

export function deploysYieldVault(archetype: ArchetypeId): boolean {
  return ["aave_v3_yield", "full_defi_suite"].includes(archetype);
}

/** Why the chosen settings cannot be applied, or null. Checked before any deployment. */
export function launchSettingsProblem(form: LaunchpadFormState): string | null {
  if (deploysStaking(form.selectedArchetype)) {
    const days = form.stakingLockDays;
    if (!Number.isInteger(days) || days < 0 || days > MAX_STAKING_LOCK_DAYS) {
      return `Staking lock must be a whole number of days from 0 to ${MAX_STAKING_LOCK_DAYS}.`;
    }
    const fee = form.earlyUnstakeFeeBps;
    if (!Number.isInteger(fee) || fee < 0 || fee > MAX_UNSTAKE_FEE_BPS) {
      return `Unstake fee must be between 0% and ${MAX_UNSTAKE_FEE_BPS / 100}%.`;
    }
  }
  if (deploysYieldVault(form.selectedArchetype)) {
    const fee = form.performanceFeeBps;
    if (!Number.isInteger(fee) || fee < 0 || fee > MAX_PERFORMANCE_FEE_BPS) {
      return `Performance fee must be between 0% and ${MAX_PERFORMANCE_FEE_BPS / 100}%.`;
    }
  }
  return null;
}
