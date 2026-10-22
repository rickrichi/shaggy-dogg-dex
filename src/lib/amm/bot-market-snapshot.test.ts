// src/lib/amm/bot-market-snapshot.test.ts
import { parseEther, parseUnits } from "viem";
import { describe, expect, it, vi } from "vitest";

import { type BotQuoteVenues, fetchLiveBotQuotes } from "./bot-market-snapshot";

const VENUES: BotQuoteVenues = {
  uniswapV2Router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  dai: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
};
const POOL = "0xcDAC0d6c6C59727a65F871236188350531885C43";

const ok = (result: unknown) => ({ status: "success" as const, result });
const failed = { status: "failure" as const, error: new Error("reverted") };

function client(legs: unknown[], fee: bigint | Error = 30n) {
  return {
    multicall: vi
      .fn()
      .mockResolvedValueOnce(legs)
      .mockImplementationOnce(async () => {
        if (fee instanceof Error) throw fee;
        return [fee];
      }),
  };
}

const ONE = parseEther("1");
const healthyLegs = [
  ok([ONE, parseUnits("2390", 6), parseEther("2389"), parseEther("0.99")]),
  ok([ONE, parseUnits("2383", 6)]),
  ok([ONE, parseUnits("2385", 6)]),
  ok(POOL),
];

describe("fetchLiveBotQuotes", () => {
  it("derives fee-free rates and keeps the fee-inclusive outputs the handlers enforce", async () => {
    const quotes = await fetchLiveBotQuotes(client(healthyLegs), VENUES, 1);

    expect(quotes).not.toBeNull();
    expect(quotes?.wethUsdcPrice).toBeCloseTo(2390 / 0.997, 6);
    expect(quotes?.usdcDaiRate).toBeCloseTo(2389 / 2390 / 0.997, 9);
    expect(quotes?.daiWethRate).toBeCloseTo(0.99 / 2389 / 0.997, 12);
    expect(quotes?.uniswapExecutionPrice).toBeCloseTo(2383, 6);
    expect(quotes?.aerodromeExecutionPrice).toBeCloseTo(2385, 6);
    expect(quotes?.aerodromeFeeRate).toBe(0.003);
    expect(quotes?.aerodromeEthPrice).toBeCloseTo(2385 / 0.997, 6);
    expect(quotes?.triangularTerminalWeth).toBeCloseTo(0.99, 12);
  });

  it.each([
    ["a leg reverts", [failed, ...healthyLegs.slice(1)]],
    ["a leg returns zero", [healthyLegs[0], ok([ONE, 0n]), ...healthyLegs.slice(2)]],
    [
      "Aerodrome has no pool",
      [...healthyLegs.slice(0, 3), ok("0x0000000000000000000000000000000000000000")],
    ],
  ])("returns null when %s, so the bot skips the tick", async (_label, legs) => {
    expect(await fetchLiveBotQuotes(client(legs), VENUES, 1)).toBeNull();
  });

  it("returns null when the RPC fails or the fee cannot be read", async () => {
    const offline = { multicall: vi.fn().mockRejectedValue(new Error("offline")) };
    expect(await fetchLiveBotQuotes(offline, VENUES, 1)).toBeNull();
    expect(
      await fetchLiveBotQuotes(client(healthyLegs, new Error("no fee")), VENUES, 1)
    ).toBeNull();
  });

  it("does not quote a zero or negative trade size", async () => {
    const c = client(healthyLegs);
    expect(await fetchLiveBotQuotes(c, VENUES, 0)).toBeNull();
    expect(c.multicall).not.toHaveBeenCalled();
  });
});
