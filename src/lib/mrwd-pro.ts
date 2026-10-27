// src/lib/mrwd-pro.ts
// Equilnyxs Pro by MRWD staking (whitepaper v2.0 §11.1). Addresses: deployments/mrwd-base-mainnet.json.
import { type Address, parseAbi, parseUnits } from "viem";

export const MRWD: Address = "0xC17227AAa33C54634B6cE7AD0bf33A156563c179";
export const MRWD_PRO_STAKING: Address = "0x67dBC193bF510225EBf189ab25dC3b34a32c1766";
/** MRWD a wallet keeps locked for Pro, set by the store (decided 25 October 2026). */
export const PRO_STAKE = parseUnits("1000000000", 18);
export const PRO_STORE_URL = "https://www.lumsian.com/pro/stake.php";

export const proStakingAbi = parseAbi([
  "function stake(uint256 amount)",
  "function relockAll()",
  "function withdrawMatured() returns (uint256)",
  "function maturedOf(address wallet) view returns (uint256)",
  "function depositsOf(address wallet) view returns ((uint128 amount, uint64 unlockAt)[])",
  "function LOCK_DURATION() view returns (uint256)",
]);

export interface ProDeposit {
  amount: bigint;
  unlockAt: bigint;
}

/**
 * The latest time T at which the wallet still has at least `required` MRWD locked, the same test
 * as the contract's lockedUntil(wallet, T) >= required; null if it never has enough locked.
 */
export function proLockedThrough(
  deposits: readonly ProDeposit[],
  required: bigint,
  now: bigint
): bigint | null {
  let locked = 0n;
  for (const d of [...deposits].sort((a, b) =>
    a.unlockAt < b.unlockAt ? 1 : a.unlockAt > b.unlockAt ? -1 : 0
  )) {
    if (d.unlockAt <= now) break;
    locked += d.amount;
    if (locked >= required) return d.unlockAt;
  }
  return null;
}
