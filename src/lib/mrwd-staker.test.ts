import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { MRWD } from "@/lib/mrwd-pro";

import { claimBankedCalls, claimCalls, stakerActionsAbi, unstakeCalls } from "./mrwd-staker";

const owner = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const zero = "0x0000000000000000000000000000000000000000";
const key = { rewardToken: MRWD, pool: zero, startTime: 100n, endTime: 1_000n, refundee: zero };
const names = (calls: Array<`0x${string}`>) =>
  calls.map((data) => decodeFunctionData({ abi: stakerActionsAbi, data }).functionName);

describe("MRWD staker calls", () => {
  it("re-stakes inside a claim while the incentive runs", () => {
    expect(names(claimCalls(key, 7n, owner, 999n))).toEqual([
      "unstakeToken",
      "stakeToken",
      "claimReward",
    ]);
  });

  it("does not re-stake once the incentive has ended", () => {
    expect(names(claimCalls(key, 7n, owner, 1_000n))).toEqual(["unstakeToken", "claimReward"]);
  });

  it("claims the whole balance to the owner", () => {
    const { args } = decodeFunctionData({
      abi: stakerActionsAbi,
      data: claimBankedCalls(owner)[0]!,
    });
    expect(args).toEqual([MRWD, owner, 0n]);
  });

  it("unstakes, pays out, and returns the NFT to the owner", () => {
    const calls = unstakeCalls(key, 7n, owner, true);
    expect(names(calls)).toEqual(["unstakeToken", "claimReward", "withdrawToken"]);
    const { args } = decodeFunctionData({ abi: stakerActionsAbi, data: calls[2]! });
    expect(args).toEqual([7n, owner, "0x"]);
  });

  it("only withdraws a position that is no longer staked", () => {
    expect(names(unstakeCalls(key, 7n, owner, false))).toEqual(["withdrawToken"]);
  });
});
