import { decodeAbiParameters, decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { MRWD } from "@/lib/mrwd-pro";

import {
  fullRangeUse,
  mintCall,
  planLiquidity,
  positionManagerAbi,
  routerAbi,
  stakeNewPositionCall,
  swapCall,
  TICK_LOWER,
  TICK_UPPER,
  WETH,
} from "./mrwd-liquidity";

const owner = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const E18 = 10n ** 18n;
/** sqrtPriceX96 for a price of `p` MRWD per WETH (exact when p is a perfect square). */
const sqrtFor = (p: bigint) => {
  let r = 1n;
  while (r * r < p) r *= 2n;
  let lo = r / 2n;
  let hi = r;
  while (lo < hi) {
    const m = (lo + hi + 1n) / 2n;
    if (m * m <= p) lo = m;
    else hi = m - 1n;
  }
  return lo << 96n;
};
// 4e12 MRWD per WETH, close to the live pool (3.77e12).
const P = 4_000_000_000_000n;
const S = sqrtFor(P);

/** A constant-product pool with `w` WETH and `m` MRWD, 0.30% fee, standing in for the quoter. */
const cpQuote = (w: bigint, m: bigint) => async (x: bigint) => {
  const xIn = (x * 997n) / 1000n;
  const out = (m * xIn) / (w + xIn);
  const p = ((m - out) * E18) / (w + x);
  return { amountOut: out, sqrtPriceX96After: sqrtFor((p * 1n) / E18 || 1n) };
};

describe("fullRangeUse", () => {
  it("pairs ETH at the spot price and leaves the excess side unused", () => {
    expect(fullRangeUse(S, E18 / 1000n, 10n ** 30n)).toEqual({
      weth: E18 / 1000n,
      mrwd: (E18 / 1000n) * P,
    });
    const mrwdLimited = fullRangeUse(S, E18, 4n * 10n ** 27n);
    expect(mrwdLimited.weth).toBe(E18 / 1000n);
  });
});

describe("planLiquidity", () => {
  it("swaps nothing when the wallet already has enough MRWD", async () => {
    const plan = await planLiquidity(E18 / 1000n, 10n ** 30n, S, () => {
      throw new Error("should not quote");
    });
    expect(plan.swapEth).toBe(0n);
    expect(plan.lpEth).toBe(E18 / 1000n);
  });

  it("splits the ETH so the remaining ETH and MRWD match the post-swap price", async () => {
    const ethIn = 4_250_000_000_000_000n; // 0.00425 ETH
    const held = 130_000_000n * E18; // 130M MRWD
    const plan = await planLiquidity(ethIn, held, S, cpQuote(5n * 10n ** 16n, 2n * 10n ** 29n));
    // A bit under half is swapped, since the wallet's MRWD covers part.
    expect(plan.swapEth).toBeGreaterThan(ethIn / 3n);
    expect(plan.swapEth).toBeLessThan(ethIn / 2n);
    // Almost all of the ETH ends up in the position (within 1%).
    const used = plan.swapEth + plan.lpEth;
    expect(used * 100n).toBeGreaterThanOrEqual(ethIn * 99n);
    expect(plan.lpMrwd).toBeLessThanOrEqual(held + plan.swapMrwd);
  });

  it("rejects a zero amount", async () => {
    await expect(planLiquidity(0n, 0n, S, cpQuote(1n, 1n))).rejects.toThrow();
  });
});

describe("call builders", () => {
  it("swaps ETH for MRWD with a 2% floor, to the wallet", () => {
    const call = swapCall(1000n, 10_000n, owner, 99n);
    expect(call.value).toBe(1000n);
    const [deadline, [inner]] = call.args;
    expect(deadline).toBe(99n);
    const { args } = decodeFunctionData({ abi: routerAbi, data: inner! });
    expect(args![0]).toMatchObject({
      tokenIn: WETH,
      tokenOut: MRWD,
      fee: 3000,
      recipient: owner,
      amountIn: 1000n,
      amountOutMinimum: 9_800n,
    });
  });

  it("mints full range to the wallet and refunds unused ETH", () => {
    const eth = E18 / 1000n;
    const call = mintCall(S, eth, eth * P, owner, 99n);
    expect(call.value).toBe(eth);
    const [mint, refund] = call.args[0].map((data) =>
      decodeFunctionData({ abi: positionManagerAbi, data })
    );
    expect(refund!.functionName).toBe("refundETH");
    expect(mint!.args![0]).toMatchObject({
      token0: WETH,
      token1: MRWD,
      tickLower: TICK_LOWER,
      tickUpper: TICK_UPPER,
      amount0Desired: eth,
      amount0Min: (eth * 98n) / 100n,
      amount1Min: (eth * P * 98n) / 100n,
      recipient: owner,
    });
  });

  it("stakes by transferring the NFT to the staker with the 160-byte incentive key", () => {
    const key = {
      rewardToken: MRWD,
      pool: "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5" as const,
      startTime: 1n,
      endTime: 2n,
      refundee: "0x000000000000000000000000000000000000dEaD" as const,
    };
    const call = stakeNewPositionCall(owner, 7n, key);
    const [from, to, id, data] = call.args;
    expect([from, to, id]).toEqual([owner, "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1", 7n]);
    // The staker stakes a single key only when the data is exactly 160 bytes.
    expect((data.length - 2) / 2).toBe(160);
    const [decoded] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "rewardToken", type: "address" },
            { name: "pool", type: "address" },
            { name: "startTime", type: "uint256" },
            { name: "endTime", type: "uint256" },
            { name: "refundee", type: "address" },
          ],
        },
      ],
      data
    );
    expect(decoded).toEqual(key);
  });
});
