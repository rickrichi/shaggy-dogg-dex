import { beforeEach, describe, expect, it, vi } from "vitest";

import { liveFlashPreview, routeLabel } from "./flash-preview";

import type { Address } from "viem";

const mocks = vi.hoisted(() => ({
  ranked: [] as Array<{ symbol: string; address: string; decimals: number }>,
  cycleOut: null as bigint | null,
  premiumBps: 5,
}));

vi.mock("./bot-market-snapshot", async (importActual) => ({
  ...(await importActual<typeof import("./bot-market-snapshot")>()),
  rankMidAssetCandidates: () => Promise.resolve(mocks.ranked),
}));
vi.mock("./flash-routes", async (importActual) => ({
  ...(await importActual<typeof import("./flash-routes")>()),
  bestV3Cycle: (_c: unknown, _q: unknown, tokens: readonly Address[]) =>
    Promise.resolve(
      mocks.cycleOut === null ? null : { tokens, fees: [500, 500, 100], amountOut: mocks.cycleOut }
    ),
  readAavePremiumBps: () => Promise.resolve(mocks.premiumBps),
}));

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address;
const venues = {
  uniswapV3Quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as Address,
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address,
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address,
  weth: WETH,
  usdc: USDC,
  candidates: [{ symbol: "cbBTC", address: CBBTC, decimals: 8 }],
};
const client = {} as never;
const POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address;

describe("liveFlashPreview", () => {
  beforeEach(() => {
    mocks.ranked = [{ symbol: "cbBTC", address: CBBTC, decimals: 8 }];
    mocks.cycleOut = null;
    mocks.premiumBps = 5;
  });

  it("reports the loss before gas when the cycle returns less than principal + premium", async () => {
    mocks.cycleOut = 99_945_939n; // 99.945939 USDC, the best seen in the 2026-11-06 scan
    const p = await liveFlashPreview(client, venues, POOL, "USDC", 100_000_000n);
    expect(p.kind).toBe("route");
    if (p.kind !== "route") return;
    expect(p.premium).toBe(50_000n); // 5 bps of 100 USDC
    expect(p.owed).toBe(100_050_000n);
    expect(p.edge).toBe(-104_061n);
    expect(p.cycle.tokens).toEqual([USDC, CBBTC, WETH, USDC]);
    expect(p.mid.symbol).toBe("cbBTC");
  });

  it("reports a positive edge when the cycle beats principal + premium", async () => {
    mocks.cycleOut = 100_200_000n;
    const p = await liveFlashPreview(client, venues, POOL, "USDC", 100_000_000n);
    expect(p.kind === "route" && p.edge).toBe(150_000n);
  });

  it("borrows WETH through WETH -> USDC -> mid -> WETH", async () => {
    mocks.cycleOut = 10n ** 18n;
    const p = await liveFlashPreview(client, venues, POOL, "WETH", 10n ** 18n);
    expect(p.kind === "route" && p.cycle.tokens).toEqual([WETH, USDC, CBBTC, WETH]);
  });

  it("holds, as Dispatch does, for other assets, no candidates, or no liquidity", async () => {
    expect(await liveFlashPreview(client, venues, POOL, "DAI", 1n)).toMatchObject({ kind: "held" });
    expect(await liveFlashPreview(client, venues, POOL, "USDC", 0n)).toMatchObject({
      kind: "held",
    });
    mocks.ranked = [];
    expect(await liveFlashPreview(client, venues, POOL, "USDC", 1n)).toMatchObject({
      kind: "held",
      reason: expect.stringMatching(/No middle asset/),
    });
    mocks.ranked = [{ symbol: "cbBTC", address: CBBTC, decimals: 8 }];
    mocks.cycleOut = null;
    expect(await liveFlashPreview(client, venues, POOL, "USDC", 1n)).toMatchObject({
      kind: "held",
      reason: expect.stringMatching(/No Uniswap V3 liquidity/),
    });
  });
});

describe("routeLabel", () => {
  it("names USDC, WETH and candidates", () => {
    expect(routeLabel([USDC, CBBTC, WETH, USDC], venues)).toBe("USDC → cbBTC → WETH → USDC");
  });
});
