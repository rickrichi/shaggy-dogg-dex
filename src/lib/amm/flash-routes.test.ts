// src/lib/amm/flash-routes.test.ts
import { decodeFunctionData, parseEther, parseUnits } from "viem";
import { describe, expect, it, vi } from "vitest";

import { AERODROME_ROUTER_ABI, UNISWAP_V3_SWAP_ROUTER_02_ABI } from "@/config/abis";

import { type BotQuoteVenues, encodeV3Path } from "./bot-market-snapshot";
import {
  type AtomicSpreadQuote,
  atomicSpreadSteps,
  bestV3Cycle,
  feeCheckedFlashArgs,
  flashPremium,
  flashTriangleTokens,
  quoteAtomicSpread,
  SPREAD_LEG2_BUFFER_BPS,
  v3ExactInputStep,
} from "./flash-routes";
import { baseProfitBudget } from "./gas-cost";

const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const V: BotQuoteVenues = {
  uniswapV3Quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  candidates: [{ symbol: "cbBTC", address: CBBTC, decimals: 8 }],
};
const SELF = "0x70315019D12A11556C837970675cDC8Fa54d186b";
const v3 = (out: bigint) => ({ status: "success" as const, result: [out, [], [], 0n] });
const failed = { status: "failure" as const, error: new Error("no pool") };

describe("flash triangle", () => {
  it("borrows and returns the same asset, cycling through USDC/midAsset", () => {
    expect(flashTriangleTokens("USDC", V, CBBTC)).toEqual({
      tokens: [V.usdc, CBBTC, V.weth, V.usdc],
    });
    expect(flashTriangleTokens("WETH", V, CBBTC)).toEqual({
      tokens: [V.weth, V.usdc, CBBTC, V.weth],
    });
  });

  it("quotes every fee combination and keeps the best", async () => {
    const { tokens } = flashTriangleTokens("USDC", V, CBBTC);
    const best = encodeV3Path(tokens, [100, 500, 500]);
    const client = {
      multicall: vi.fn(async ({ contracts }: { contracts: Array<{ args: readonly unknown[] }> }) =>
        contracts.map((c) =>
          c.args[0] === best ? v3(parseUnits("101", 6)) : v3(parseUnits("99", 6))
        )
      ),
    };
    const cycle = await bestV3Cycle(client, V.uniswapV3Quoter, tokens, parseUnits("100", 6));

    expect(client.multicall.mock.calls[0]?.[0].contracts).toHaveLength(4 * 4 * 4);
    expect(cycle?.fees).toEqual([100, 500, 500]);
    expect(cycle?.amountOut).toBe(parseUnits("101", 6));
  });

  it("returns null when no combination has liquidity", async () => {
    const client = {
      multicall: vi.fn(async ({ contracts }: { contracts: unknown[] }) =>
        contracts.map(() => failed)
      ),
    };
    const { tokens } = flashTriangleTokens("WETH", V, CBBTC);
    expect(await bestV3Cycle(client, V.uniswapV3Quoter, tokens, parseEther("1"))).toBeNull();
  });

  it("computes Aave's premium from basis points", () => {
    expect(flashPremium(parseUnits("100", 6), 5)).toBe(parseUnits("0.05", 6));
    expect(flashPremium(2_001n, 5)).toBe(2n);
    expect(flashPremium(1n, 0)).toBe(0n);
  });

  it("reprices the flash cycle's final USDC minimum including premium and rounded-up gas", async () => {
    const principal = parseUnits("100", 6);
    const owed = principal + flashPremium(principal, 5);
    const budget = baseProfitBudget("USDC", 5, 2000);
    const feeWei = parseEther("0.0004") + 1n;
    const estimate = vi.fn().mockResolvedValue(feeWei);
    const { tokens } = flashTriangleTokens("USDC", V, CBBTC);
    const args = await feeCheckedFlashArgs(
      { asset: V.usdc, principal, owed, edge: parseUnits("7", 6), recipient: SELF },
      budget,
      (minimum) => [v3ExactInputStep(V.uniswapV3Router, tokens, [100, 500, 500], principal, minimum, SELF)],
      estimate
    );
    const minimumNet = parseUnits("6", 6) + 1n;
    expect(estimate).toHaveBeenCalledTimes(2);
    expect(args).toBe(estimate.mock.calls[1]?.[0]);
    expect(args?.[2]).toBe(minimumNet);
    const swap = decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_02_ABI, data: args![4][0]!.callData });
    expect(swap.args?.[0]).toMatchObject({ amountOutMinimum: owed + minimumNet });
  });
});

describe("atomic spread", () => {
  const amount = parseEther("1");

  it("enforces the current WETH profit target and the final gas estimate on the spread's buy leg", async () => {
    const quote: AtomicSpreadQuote = {
      sellVenue: "AERODROME", buyVenue: "UNISWAP", uniswapFee: 100,
      usdcMid: parseUnits("2000", 6), wethOut: parseEther("1.004"),
    };
    const budget = baseProfitBudget("WETH", 5, 2000);
    const owed = amount + flashPremium(amount, 5);
    const fee = parseEther("0.0004");
    const loan = { asset: V.weth, principal: amount, owed, edge: parseEther("0.0032"), recipient: SELF } as const;
    const buildSteps = (minimum: bigint) => atomicSpreadSteps(V, quote, amount, minimum, SELF, 999n);
    const estimate = vi.fn().mockResolvedValue(fee);
    const args = await feeCheckedFlashArgs(loan, budget, buildSteps, estimate);
    const minimumNet = parseEther("0.003");
    expect(args?.[2]).toBe(minimumNet);
    expect(args).toBe(estimate.mock.calls[1]?.[0]);
    const swap = decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_02_ABI, data: args![4][1]!.callData });
    expect(swap.args?.[0]).toMatchObject({ amountOutMinimum: owed + minimumNet });
    await expect(feeCheckedFlashArgs(
      { ...loan, edge: minimumNet - 1n }, budget, buildSteps, estimate
    )).resolves.toBeNull();
    await expect(feeCheckedFlashArgs(
      loan, baseProfitBudget("WETH", 6, 2000), buildSteps, estimate
    )).resolves.toBeNull();
  });

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
