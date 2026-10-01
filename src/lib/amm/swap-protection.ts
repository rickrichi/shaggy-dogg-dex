const BPS_DENOMINATOR = 10_000n;

/**
 * A deliberately conservative upper bound for execution flows that do not
 * expose a per-swap slippage control. Values above this should require an
 * explicit, reviewed exception rather than silently widening price risk.
 */
export const MAX_SWAP_SLIPPAGE_BPS = 1_000n;

/** The fixed slippage tolerance used by the protocol-operations first buy. */
export const INITIAL_SWAP_SLIPPAGE_BPS = 50n;

/**
 * Turns a router quote into the `amountOutMin` enforced by a V2 router.
 *
 * This prevents a transaction from executing at an arbitrary price if the
 * pool moves between the quote and on-chain execution (including because of a
 * sandwich attack). The result is never allowed to be zero.
 */
export function calculateMinimumAmountOut(quotedAmountOut: bigint, slippageBps: bigint): bigint {
  if (quotedAmountOut <= 0n) {
    throw new Error("Swap quote must produce a positive output amount.");
  }
  if (slippageBps < 0n || slippageBps > MAX_SWAP_SLIPPAGE_BPS) {
    throw new Error(`Slippage must be between 0 and ${MAX_SWAP_SLIPPAGE_BPS} basis points.`);
  }

  const minimumAmountOut = (quotedAmountOut * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
  if (minimumAmountOut <= 0n) {
    throw new Error("Swap quote is too small to produce a non-zero minimum output.");
  }

  return minimumAmountOut;
}
