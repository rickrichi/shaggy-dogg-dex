// src/lib/gas.ts

/**
 * Gas limit for calls that pass through Aave or Compound. Their nested calls can need more gas
 * than they finally use, so a bare estimate can revert. Unused gas is refunded, so a higher limit
 * adds no cost.
 */
export const bufferedGas = (estimate: bigint) => (estimate * 3n) / 2n;
