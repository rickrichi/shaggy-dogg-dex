import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { describe, expect, it } from "vitest";

import {
  Actions,
  collectFeesCall,
  Commands,
  decodePositionInfo,
  decreaseCall,
  mintCall,
  multiSwapCall,
  NATIVE,
  poolId,
  poolKey,
  positionManagerAbi,
  singleSwapCall,
  universalRouterAbi,
  V4,
} from "./uniswap-v4";
import {
  fullRange,
  getAmountsForLiquidity,
  getLiquidityForAmounts,
  getSqrtPriceAtTick,
  getTickAtSqrtPrice,
  MAX_SQRT_PRICE,
  MAX_TICK,
  MIN_SQRT_PRICE,
  MIN_TICK,
  priceToSqrtPriceX96,
  Q96,
  sqrtPriceX96ToPrice,
  usableTick,
} from "./v4-math";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const WETH = "0x4200000000000000000000000000000000000006" as const;
const ME = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98" as const;

describe("TickMath port", () => {
  it("matches Uniswap's published bounds and the 1:1 price", () => {
    expect(getSqrtPriceAtTick(MIN_TICK)).toBe(MIN_SQRT_PRICE);
    expect(getSqrtPriceAtTick(MAX_TICK)).toBe(MAX_SQRT_PRICE);
    expect(getSqrtPriceAtTick(0)).toBe(Q96);
    expect(() => getSqrtPriceAtTick(MAX_TICK + 1)).toThrow();
  });

  it("is strictly increasing and inverts back to the same tick", () => {
    for (const t of [-887271, -199213, -60, -1, 1, 60, 199213, 887271]) {
      expect(getSqrtPriceAtTick(t + 1)).toBeGreaterThan(getSqrtPriceAtTick(t));
      expect(getTickAtSqrtPrice(getSqrtPriceAtTick(t))).toBe(t);
    }
  });

  it("rounds ticks to the spacing and gives full range", () => {
    expect(usableTick(-199213, 60)).toBe(-199200);
    expect(fullRange(60)).toEqual({ tickLower: -887220, tickUpper: 887220 });
    expect(fullRange(10)).toEqual({ tickLower: -887270, tickUpper: 887270 });
  });

  it("converts human prices to sqrtPriceX96 and back", () => {
    // Base ETH/USDC v4 pool sat at tick -199,213 on 2026-11-06: about $2,231 per ETH.
    const live = sqrtPriceX96ToPrice(getSqrtPriceAtTick(-199213), 18, 6);
    expect(live).toBeGreaterThan(2225);
    expect(live).toBeLessThan(2240);
    expect(
      Math.abs(getTickAtSqrtPrice(priceToSqrtPriceX96(live, 18, 6)) - -199213)
    ).toBeLessThanOrEqual(1);
    expect(sqrtPriceX96ToPrice(priceToSqrtPriceX96(2224, 18, 6), 18, 6)).toBeCloseTo(2224, 2);
  });
});

describe("LiquidityAmounts port", () => {
  const a = getSqrtPriceAtTick(-600);
  const b = getSqrtPriceAtTick(600);
  const p = getSqrtPriceAtTick(0);

  it("takes the smaller side in range and one side out of range", () => {
    const L = getLiquidityForAmounts(p, a, b, 10n ** 18n, 10n ** 18n);
    const held = getAmountsForLiquidity(p, a, b, L);
    // Both sides used, neither more than offered.
    expect(held.amount0).toBeLessThanOrEqual(10n ** 18n);
    expect(held.amount1).toBeLessThanOrEqual(10n ** 18n);
    expect(held.amount0 > 99n * 10n ** 16n || held.amount1 > 99n * 10n ** 16n).toBe(true);
    expect(getAmountsForLiquidity(getSqrtPriceAtTick(-1200), a, b, L).amount1).toBe(0n);
    expect(getAmountsForLiquidity(getSqrtPriceAtTick(1200), a, b, L).amount0).toBe(0n);
  });
});

describe("v4 encodings", () => {
  it("sorts currencies with native ETH first and hashes the PoolKey", () => {
    const key = poolKey(USDC, NATIVE, 3000, 60);
    expect(key.currency0).toBe(zeroAddress);
    expect(poolId(key)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(poolId(poolKey(NATIVE, USDC, 3000, 60))).toBe(poolId(key));
    expect(() => poolKey(USDC, USDC, 3000, 60)).toThrow();
  });

  it("swaps native ETH through V4_SWAP with SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL", () => {
    const key = poolKey(NATIVE, USDC, 3000, 60);
    const call = singleSwapCall(8453, {
      key,
      zeroForOne: true,
      amountIn: 10n ** 16n,
      amountOutMinimum: 22n * 10n ** 6n,
      deadline: 1n,
    });
    expect(call.address).toBe(V4[8453].universalRouter);
    expect(call.value).toBe(10n ** 16n);
    const [commands, inputs] = call.args;
    expect(commands).toBe(`0x${Commands.V4_SWAP.toString(16)}`);
    const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), inputs[0]!);
    expect(actions).toBe("0x060c0f");
    const [settleCurrency, settleMax] = decodeAbiParameters(
      parseAbiParameters("address, uint256"),
      params[1]!
    );
    expect([settleCurrency, settleMax]).toEqual([zeroAddress, 10n ** 16n]);
    const [takeCurrency, takeMin] = decodeAbiParameters(
      parseAbiParameters("address, uint256"),
      params[2]!
    );
    expect([takeCurrency, takeMin]).toEqual([USDC, 22n * 10n ** 6n]);
    // The calldata decodes as the router's execute().
    expect(decodeFunctionData({ abi: universalRouterAbi, data: encode(call) }).functionName).toBe(
      "execute"
    );
  });

  it("sends no ETH for an ERC-20 input and reverses settle/take", () => {
    const key = poolKey(NATIVE, USDC, 500, 10);
    const call = singleSwapCall(1, {
      key,
      zeroForOne: false,
      amountIn: 5n,
      amountOutMinimum: 1n,
      deadline: 1n,
    });
    expect(call.value).toBe(0n);
    const [, params] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), call.args[1][0]!);
    expect(decodeAbiParameters(parseAbiParameters("address, uint256"), params[1]!)[0]).toBe(USDC);
    expect(decodeAbiParameters(parseAbiParameters("address, uint256"), params[2]!)[0]).toBe(
      zeroAddress
    );
  });

  it("builds multi-hop swaps with SWAP_EXACT_IN", () => {
    const call = multiSwapCall(8453, {
      currencyIn: NATIVE,
      path: [
        {
          intermediateCurrency: USDC,
          fee: 500,
          tickSpacing: 10,
          hooks: zeroAddress,
          hookData: "0x",
        },
        {
          intermediateCurrency: WETH,
          fee: 500,
          tickSpacing: 10,
          hooks: zeroAddress,
          hookData: "0x",
        },
      ],
      amountIn: 1n,
      amountOutMinimum: 0n,
      deadline: 1n,
    });
    const [actions] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), call.args[1][0]!);
    expect(actions).toBe("0x070c0f");
    expect(() =>
      multiSwapCall(8453, {
        currencyIn: NATIVE,
        path: [],
        amountIn: 1n,
        amountOutMinimum: 0n,
        deadline: 1n,
      })
    ).toThrow();
  });

  it("mints with SETTLE_PAIR and sweeps unused native ETH back to the owner", () => {
    const key = poolKey(NATIVE, USDC, 3000, 60);
    const call = mintCall(8453, {
      key,
      ...fullRange(60),
      liquidity: 1n,
      amount0Max: 7n,
      amount1Max: 9n,
      owner: ME,
      deadline: 1n,
    });
    expect(call.address).toBe(V4[8453].positionManager);
    expect(call.value).toBe(7n);
    const [actions] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), call.args[0]);
    expect(actions).toBe(`0x0${Actions.MINT_POSITION}0d14`);
    expect(decodeFunctionData({ abi: positionManagerAbi, data: encode(call) }).functionName).toBe(
      "modifyLiquidities"
    );
  });

  it("removes liquidity and collects fees with DECREASE_LIQUIDITY + TAKE_PAIR", () => {
    const key = poolKey(NATIVE, USDC, 3000, 60);
    const dec = decreaseCall(8453, {
      tokenId: 5n,
      key,
      liquidity: 100n,
      amount0: 1n,
      amount1: 2n,
      recipient: ME,
      deadline: 1n,
    });
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes, bytes[]"),
      dec.args[0]
    );
    expect(actions).toBe("0x0111");
    expect(
      decodeAbiParameters(
        parseAbiParameters("uint256, uint256, uint128, uint128, bytes"),
        params[0]!
      ).slice(0, 4)
    ).toEqual([5n, 100n, 1n, 2n]);
    expect(
      decodeAbiParameters(parseAbiParameters("address, address, address"), params[1]!)[2]
    ).toBe(ME);
    const fees = collectFeesCall(8453, { tokenId: 5n, key, recipient: ME, deadline: 1n });
    const [, fp] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), fees.args[0]);
    expect(
      decodeAbiParameters(
        parseAbiParameters("uint256, uint256, uint128, uint128, bytes"),
        fp[0]!
      )[1]
    ).toBe(0n);
  });

  it("unpacks PositionInfo ticks, including negative ones", () => {
    const pack = (lower: number, upper: number) =>
      (BigInt.asUintN(24, BigInt(upper)) << 32n) | (BigInt.asUintN(24, BigInt(lower)) << 8n);
    expect(decodePositionInfo(pack(-887220, 887220))).toEqual({
      hasSubscriber: false,
      tickLower: -887220,
      tickUpper: 887220,
    });
    expect(decodePositionInfo(pack(-316974, -315756) | 1n).hasSubscriber).toBe(true);
  });
});

function encode(call: { abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
  // Re-encode through viem to prove the args match the ABI.
  return encodeFunctionData(call as never);
}
