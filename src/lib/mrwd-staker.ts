// src/lib/mrwd-staker.ts
import { type Address, encodeFunctionData, type Hex, parseAbi } from "viem";

import { MRWD } from "@/lib/mrwd-pro";

export const MRWD_V3_STAKER: Address = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";

export const stakerActionsAbi = parseAbi([
  "function unstakeToken((address rewardToken, address pool, uint256 startTime, uint256 endTime, address refundee) key, uint256 tokenId)",
  "function stakeToken((address rewardToken, address pool, uint256 startTime, uint256 endTime, address refundee) key, uint256 tokenId)",
  "function claimReward(address rewardToken, address to, uint256 amountRequested) returns (uint256)",
  "function withdrawToken(uint256 tokenId, address to, bytes data)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);

export interface StakerIncentiveKey {
  rewardToken: Address;
  pool: Address;
  startTime: bigint;
  endTime: bigint;
  refundee: Address;
}

const unstake = (key: StakerIncentiveKey, tokenId: bigint) =>
  encodeFunctionData({ abi: stakerActionsAbi, functionName: "unstakeToken", args: [key, tokenId] });

// An amount of 0 tells the staker to pay the owner's whole balance.
const claimAll = (owner: Address) =>
  encodeFunctionData({ abi: stakerActionsAbi, functionName: "claimReward", args: [MRWD, owner, 0n] });

/** Pays out rewards already credited to the owner, such as from an unstake made elsewhere. */
export function claimBankedCalls(owner: Address): Hex[] {
  return [claimAll(owner)];
}

/**
 * Claims a position's rewards. While the incentive runs the position is re-staked in the same
 * transaction, so it never stops earning. The staker refuses stakes after the end time, so a
 * claim after that only unstakes and pays out.
 */
export function claimCalls(
  key: StakerIncentiveKey,
  tokenId: bigint,
  owner: Address,
  nowSeconds: bigint
): Hex[] {
  const calls = [unstake(key, tokenId)];
  if (nowSeconds < key.endTime) {
    calls.push(
      encodeFunctionData({
        abi: stakerActionsAbi,
        functionName: "stakeToken",
        args: [key, tokenId],
      })
    );
  }
  calls.push(claimAll(owner));
  return calls;
}

/** Ends staking, pays out any rewards, and returns the position NFT to the owner's wallet. */
export function unstakeCalls(
  key: StakerIncentiveKey,
  tokenId: bigint,
  owner: Address,
  isStaked: boolean
): Hex[] {
  const withdraw = encodeFunctionData({
    abi: stakerActionsAbi,
    functionName: "withdrawToken",
    args: [tokenId, owner, "0x"],
  });
  return isStaked ? [unstake(key, tokenId), claimAll(owner), withdraw] : [withdraw];
}
