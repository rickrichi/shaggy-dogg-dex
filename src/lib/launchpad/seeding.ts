// src/lib/launchpad/seeding.ts
import { parseEther } from "viem";

import type { LaunchpadFormState } from "./types";

/**
 * Smallest ETH a launch may seed. The price service treats a pool as firm only at $100 of
 * liquidity (MD_MIN_POOL_LIQUIDITY_USD), i.e. about $50 of ETH beside $50 of tokens. 0.05 ETH
 * clears that while ETH stays above $1,000. Below it, a pool's price is cheap to move and is
 * reported only as indicative.
 */
export const MIN_SEED_ETH = "0.05";

/** Why seeding as configured should not run, or null when it may. Checked before any deployment. */
export function seedingProblem(form: LaunchpadFormState): string | null {
  if (!form.enableDexSeeding) return null;
  let eth: bigint;
  try {
    eth = parseEther(form.initialEthLiquidity.trim());
  } catch {
    return "Enter the ETH amount to seed, or turn liquidity seeding off.";
  }
  if (eth < parseEther(MIN_SEED_ETH)) {
    return `Seed at least ${MIN_SEED_ETH} ETH. A smaller pool prices your token at almost nothing and is cheap to move.`;
  }
  const percent = form.initialTokenLiquidityPercent;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    return "Seed between 1% and 100% of the supply.";
  }
  return null;
}

/**
 * The starting price and whole-supply value the seed implies, in ETH. In a full-range pool the
 * deposit ratio sets the price: price = ETH ÷ tokens seeded; supply value = price × supply.
 */
export function impliedLaunchPricing(form: LaunchpadFormState) {
  const eth = Number(form.initialEthLiquidity);
  const supply = Number(form.initialSupply);
  const seeded = (supply * form.initialTokenLiquidityPercent) / 100;
  if (!(eth > 0) || !(supply > 0) || !(seeded > 0)) return null;
  const pricePerToken = eth / seeded;
  return { pricePerToken, supplyValueEth: pricePerToken * supply, poolEth: eth * 2 };
}
