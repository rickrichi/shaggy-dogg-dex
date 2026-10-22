import { decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  bigintSqrt,
  buildV3MintCall,
  encodeSqrtPriceX96,
  getFullRangeTicks,
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  NONFUNGIBLE_POSITION_MANAGER_BASE,
  sortTokens,
  UNISWAP_V3_FACTORY_BASE,
  WETH_BASE,
} from "./uniswap-v3";

describe("Uniswap V3 Math & Configuration on Base", () => {
  it("exports canonical Base V3 contracts", () => {
    expect(UNISWAP_V3_FACTORY_BASE).toBe("0x33128a8fC17869897dcE68Ed026d694621f6FDfD");
    expect(NONFUNGIBLE_POSITION_MANAGER_BASE).toBe("0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1");
    expect(WETH_BASE).toBe("0x4200000000000000000000000000000000000006");
  });

  it("calculates accurate integer square roots", () => {
    expect(bigintSqrt(3n)).toBe(1n);
    for (let n = 0n; n < 500n; n++) {
      const root = bigintSqrt(n);
      expect(root * root <= n && (root + 1n) * (root + 1n) > n).toBe(true);
    }
    expect(bigintSqrt(0n)).toBe(0n);
    expect(bigintSqrt(1n)).toBe(1n);
    expect(bigintSqrt(4n)).toBe(2n);
    expect(bigintSqrt(9n)).toBe(3n);
    expect(bigintSqrt(16n)).toBe(4n);
    expect(bigintSqrt(100n)).toBe(10n);
    expect(bigintSqrt(1000000n)).toBe(1000n);
  });

  it("sorts token addresses canonically", () => {
    const weth = "0x4200000000000000000000000000000000000006";
    const fba = "0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263";
    const [t0, t1] = sortTokens(fba, weth);
    expect(t0.toLowerCase()).toBe(weth.toLowerCase());
    expect(t1.toLowerCase()).toBe(fba.toLowerCase());
  });

  it("computes accurate sqrtPriceX96 for V2 ratio", () => {
    // 1:1 ratio
    const oneToOne = encodeSqrtPriceX96(10n ** 18n, 10n ** 18n);
    // 2^96 is 79228162514264337593543950336
    expect(oneToOne).toBe(79228162514264337593543950336n);

    // FBA ratio: 0.001009 WETH to ~997,022 FBA
    const amount0 = 1008998496999999n;
    const amount1 = 997022410306654200000000n;
    const sqrtPrice = encodeSqrtPriceX96(amount0, amount1);
    expect(sqrtPrice).toBeGreaterThan(0n);
    // Should be approx 2490501365388039095662163335400645n
    expect(sqrtPrice.toString()).toHaveLength(34);
  });

  it("computes aligned Full Range ticks for each fee tier", () => {
    expect(getFullRangeTicks(100)).toEqual({ tickLower: -887272, tickUpper: 887272 });
    expect(() => getFullRangeTicks(250)).toThrow("Unsupported");
    const tier10000 = getFullRangeTicks(10000);
    expect(tier10000.tickLower).toBe(-887200);
    expect(tier10000.tickUpper).toBe(887200);
    expect(tier10000.tickUpper % 200).toBe(0);

    const tier3000 = getFullRangeTicks(3000);
    expect(tier3000.tickLower).toBe(-887220);
    expect(tier3000.tickUpper).toBe(887220);
    expect(tier3000.tickUpper % 60).toBe(0);

    const tier500 = getFullRangeTicks(500);
    expect(tier500.tickLower).toBe(-887270);
    expect(tier500.tickUpper).toBe(887270);
    expect(tier500.tickUpper % 10).toBe(0);
  });
  it("rejects duplicate tokens, zero addresses and prices outside TickMath bounds", () => {
    expect(() => sortTokens(WETH_BASE, WETH_BASE)).toThrow();
    expect(() => sortTokens(zeroAddress, WETH_BASE)).toThrow();
    expect(() => encodeSqrtPriceX96(0n, 1n)).toThrow();
    expect(() => encodeSqrtPriceX96(1n, 1n << 200n)).toThrow("TickMath");
    expect(() => encodeSqrtPriceX96(1n << 200n, 1n)).toThrow("TickMath");
  });
  it("atomically initializes and mints with sorted amounts, nonzero minimums and a deadline", () => {
    const token = "0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263";
    const call = buildV3MintCall(token, WETH_BASE, 2000000n, 1000000n, 10000, token, 2000000000n);
    const [initData, mintData] = call.args[0];
    const init = decodeFunctionData({ abi: NONFUNGIBLE_POSITION_MANAGER_ABI, data: initData });
    expect(init.functionName).toBe("createAndInitializePoolIfNecessary");
    const mint = decodeFunctionData({ abi: NONFUNGIBLE_POSITION_MANAGER_ABI, data: mintData });
    if (mint.functionName !== "mint") throw new Error("Expected mint");
    expect(mint.args[0]).toMatchObject({
      token0: WETH_BASE,
      token1: token,
      amount0Desired: 1000000n,
      amount1Desired: 2000000n,
      amount0Min: 995000n,
      amount1Min: 1990000n,
      deadline: 2000000000n,
      tickLower: -887200,
      tickUpper: 887200,
    });
  });
});
