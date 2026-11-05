import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { MRWD } from "@/lib/mrwd-pro";

import {
  claimBankedCalls,
  claimCalls,
  moveCalls,
  selectPeriods,
  stakerActionsAbi,
  unstakeCalls,
} from "./mrwd-staker";

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

describe("MRWD quarter rollover", () => {
  const q = (index: number, startTime: bigint, endTime: bigint, status: number) => ({
    index,
    startTime,
    endTime,
    status,
  });
  const schedule = [q(0, 100n, 200n, 1), q(1, 200n, 300n, 1), q(2, 300n, 400n, 0)];

  it("picks the running quarter and the one that just ended", () => {
    const s = selectPeriods(schedule, 250n);
    expect(s.current?.index).toBe(1);
    expect(s.previous?.index).toBe(0);
    expect(s.upcoming?.index).toBe(2);
  });

  it("treats the end second as the start of the next quarter", () => {
    const s = selectPeriods(schedule, 200n);
    expect(s.current?.index).toBe(1);
    expect(s.previous?.index).toBe(0);
  });

  it("has no current quarter when the next one was never created", () => {
    const s = selectPeriods(schedule, 350n);
    expect(s.current).toBeUndefined();
    expect(s.previous?.index).toBe(1);
  });

  it("moves several positions and claims once", () => {
    const next = { ...key, startTime: 1_000n, endTime: 2_000n };
    const calls = moveCalls(
      [
        { tokenId: 7n, from: key },
        { tokenId: 8n, from: null },
      ],
      next,
      owner
    );
    expect(names(calls)).toEqual(["unstakeToken", "stakeToken", "stakeToken", "claimReward"]);
    expect(decodeFunctionData({ abi: stakerActionsAbi, data: calls[0]! }).args).toEqual([key, 7n]);
    expect(decodeFunctionData({ abi: stakerActionsAbi, data: calls[2]! }).args).toEqual([next, 8n]);
  });
});
