// src/lib/launchpad/stakingContract.ts
import { LAUNCHPAD_ARTIFACTS } from "./artifacts";

import type { Address, Hex } from "viem";

/**
 * Creation bytecode of every FeeDiscountStaking build the launchpad has deployed with the current
 * ABI (lock snapshots, accruedFees, withdrawFees): current first. When the staking contract
 * changes, keep the previous build here so links to contracts already launched keep working.
 */
export const LAUNCH_STAKING_BUILDS: readonly Hex[] = [
  LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.bytecode,
];

/** The page holders open from a link the creator shares. */
export const launchStakingLink = (stakingAddress: Address, origin = window.location.origin) =>
  `${origin}/stake?contract=${stakingAddress}`;

const WORD = 64; // one 32-byte word, in hex characters

/**
 * The runtime part of a creation bytecode, found through the init code's copy of it
 * (PUSH2 length, optional DUP1, PUSH2 offset, PUSH0, CODECOPY), which must end the creation code.
 */
function runtimeOf(creation: string): string | null {
  for (const m of creation.matchAll(/61([0-9a-f]{4})(?:80)?61([0-9a-f]{4})5f39/g)) {
    if (m.index % 2 !== 0) continue;
    const length = parseInt(m[1] ?? "", 16) * 2;
    const offset = parseInt(m[2] ?? "", 16) * 2;
    if (offset + length === creation.length) return creation.slice(offset);
  }
  return null;
}

/**
 * True when `code` is a launchpad staking contract for `token`: byte-for-byte a known build, except
 * the slots where the constructor wrote the immutable token address. Those slots must be all zero in
 * the build and must hold exactly `token`, so a look-alike contract or one for another token fails.
 */
export function isLaunchStakingCode(code: Hex | undefined, token: Address | undefined): boolean {
  if (!code || !token || code.length <= 2) return false;
  const deployed = code.slice(2).toLowerCase();
  const tokenWord = token.slice(2).toLowerCase().padStart(WORD, "0");
  const zeroWord = "0".repeat(WORD);

  return LAUNCH_STAKING_BUILDS.some((build) => {
    const template = runtimeOf(build.slice(2).toLowerCase());
    if (template === null || template.length !== deployed.length) return false;

    // Blank every byte-aligned spot holding the token word over a zero word in the build.
    let masked = deployed;
    let filledSlots = 0;
    for (let at = deployed.indexOf(tokenWord); at >= 0; at = deployed.indexOf(tokenWord, at + 2)) {
      if (at % 2 === 0 && template.slice(at, at + WORD) === zeroWord) {
        masked = masked.slice(0, at) + zeroWord + masked.slice(at + WORD);
        filledSlots += 1;
      }
    }
    return filledSlots > 0 && masked === template;
  });
}
