// src/lib/amm/flash-routes.test.ts
import { decodeFunctionData, parseEther, parseUnits } from "viem";
import { describe, expect, it, vi } from "vitest";

import { AERODROME_ROUTER_ABI, UNISWAP_V3_SWAP_ROUTER_02_ABI } from "@/config/abis";

import { type BotQuoteVenues, encodeV3Path } from "./bot-market-snapshot";
import {
  type AtomicSpreadQuote,
  atomicSpreadSteps,
  bestV3Cycle,
  flashPremium,
  flashTriangleTokens,
  quoteAtomicSpread,
  SPREAD_LEG2_BUFFER_BPS,
} from "./flash-routes";

const V: BotQuoteVenues = {
  uniswapV3Quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  dai: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
};
const SELF = "0x70315019D12A11556C837970675cDC8Fa54d186b";
const v3 = (out: bigint) => ({ status: "success" as const, result: [out, [], [], 0n] });
const failed = { status: "failure" as const, error: new Error("no pool") };

describe("flash triangle", () => {
  it("borrows and returns the same asset, trying only stable tiers on USDC/DAI", () => {
    expect(flashTriangleTokens("USDC", V)).toEqual({
      tokens: [V.usdc, V.dai, V.weth, V.usdc],
      stableHops: [0],
    });
    expect(flashTriangleTokens("WETH", V)).toEqual({
      tokens: [V.weth, V.usdc, V.dai, V.weth],
      stableHops: [1],
    });
  });

  it("quotes every fee combination and keeps the best", async () => {
    const { tokens, stableHops } = flashTriangleTokens("USDC", V);
    const best = encodeV3Path(tokens, [100, 500, 500]);
    const client = {
      multicall: vi.fn(async ({ contracts }: { contracts: Array<{ args: readonly unknown[] }> }) =>
        contracts.map((c) =>
          c.args[0] === best ? v3(parseUnits("101", 6)) : v3(parseUnits("99", 6))
        )
      ),
    };
    const cycle = await bestV3Cycle(
      client,
      V.uniswapV3Quoter,
      tokens,
      stableHops,
      parseUnits("100", 6)
    );

    expect(client.multicall.mock.calls[0]?.[0].contracts).toHaveLength(2 * 4 * 4);
    expect(cycle?.fees).toEqual([100, 500, 500]);
    expect(cycle?.amountOut).toBe(parseUnits("101", 6));
  });

  it("returns null when no combination has liquidity", async () => {
    const client = {
      multicall: vi.fn(async ({ contracts }: { contracts: unknown[] }) =>
        contracts.map(() => failed)
      ),
    };
    const { tokens, stableHops } = flashTriangleTokens("WETH", V);
    expect(
      await bestV3Cycle(client, V.uniswapV3Quoter, tokens, stableHops, parseEther("1"))
    ).toBeNull();
  });

  it("computes Aave's premium from basis points", () => {
    expect(flashPremium(parseUnits("100", 6), 5)).toBe(parseUnits("0.05", 6));
  });
});

describe("atomic spread", () => {
  const amount = parseEther("1");

  it("picks the direction that returns more WETH", async () => {
    const client = {
      multicall: vi
        .fn()
        // leg 1: Uniswap tiers (500 best), then Aerodrome
        .mockResolvedValueOnce([
          v3(parseUnits("2380", 6)),
          v3(parseUnits("2390", 6)),
          failed,
          failed,
          { status: "success", result: [amount, parseUnits("2385", 6)] },
        ])
        // leg 2: Aerodrome after Uniswap, then Uniswap tiers after Aerodrome
        .mockResolvedValueOnce([
          { status: "success", result: [parseUnits("2390", 6), parseEther("1.002")] },
          v3(parseEther("0.998")),
          failed,
          failed,
          failed,
        ]),
    };
    const quote = await quoteAtomicSpread(client, V, amount);

    expect(quote).toEqual({
      sellVenue: "UNISWAP",
      buyVenue: "AERODROME",
      uniswapFee: 500,
      usdcMid: parseUnits("2390", 6),
      wethOut: parseEther("1.002"),
    });
  });

  it("builds two legs that pay the router, with leg 1's minimum covering leg 2's input", () => {
    const quote: AtomicSpreadQuote = {
      sellVenue: "AERODROME",
      buyVenue: "UNISWAP",
      uniswapFee: 100,
      usdcMid: parseUnits("2400", 6),
      wethOut: parseEther("1.001"),
    };
    const [leg1, leg2] = atomicSpreadSteps(V, quote, amount, parseEther("1.0006"), SELF, 999n);
    const leg2In = (parseUnits("2400", 6) * (10_000n - SPREAD_LEG2_BUFFER_BPS)) / 10_000n;

    expect(leg1).toMatchObject({ target: V.aerodromeRouter, tokenIn: V.weth, amountIn: amount });
    const sell = decodeFunctionData({ abi: AERODROME_ROUTER_ABI, data: leg1!.callData });
    expect(sell.functionName).toBe("swapExactTokensForTokens");
    expect(sell.args).toEqual([
      amount,
      leg2In,
      [{ from: V.weth, to: V.usdc, stable: false, factory: V.aerodromeFactory }],
      SELF,
      999n,
    ]);

    expect(leg2).toMatchObject({ target: V.uniswapV3Router, tokenIn: V.usdc, amountIn: leg2In });
    const buy = decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_02_ABI, data: leg2!.callData });
    expect(buy.functionName).toBe("exactInput");
    expect(buy.args?.[0]).toEqual({
      path: encodeV3Path([V.usdc, V.weth], [100]),
      recipient: SELF,
      amountIn: leg2In,
      amountOutMinimum: parseEther("1.0006"),
    });
  });
});
