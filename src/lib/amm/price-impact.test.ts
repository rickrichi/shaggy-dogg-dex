import { parseEther, type PublicClient, zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  getRoutePriceImpact,
  priceImpactPercent,
  reserveSpotPrice,
  v3SpotPrice,
} from "./price-impact";

import type { SmartRoute } from "./smart-routing";

const token0 = "0x0000000000000000000000000000000000000001";
const token1 = "0x0000000000000000000000000000000000000002";
const pool = "0x0000000000000000000000000000000000000003";
const route: SmartRoute = { venue: "Uniswap V2", router: pool, path: [token0, token1], stable: [] };

describe("route price impact", () => {
  it("detects a verified thin-pool trade's extreme impact with exact raw amounts", () => {
    const price = reserveSpotPrice(
      parseEther("0.000550000002522434"),
      parseEther("45466945.322702333156909734")
    );
    expect(
      priceImpactPercent(parseEther("0.01"), parseEther("43089871.174776702040638151"), [price])
    ).toBeCloseTo(94.7875475, 5);
  });

  it("includes pool fees and handles mixed decimals and multi-hop prices", () => {
    expect(
      priceImpactPercent(parseEther("1"), 1994000000n, [
        reserveSpotPrice(parseEther("100"), 200000000000n),
      ])
    ).toBeCloseTo(0.3, 6);
    expect(
      priceImpactPercent(10n, 54n, [reserveSpotPrice(100n, 200n), reserveSpotPrice(100n, 300n)])
    ).toBe(10);
  });

  it("uses V3's squared sqrt price in both token directions", () => {
    const sqrt = 2n * 2n ** 96n; // token1/token0 = 4
    expect(priceImpactPercent(100n, 396n, [v3SpotPrice(sqrt, true)])).toBe(1);
    expect(priceImpactPercent(400n, 99n, [v3SpotPrice(sqrt, false)])).toBe(1);
  });

  it("normalizes Aerodrome stable pools before differentiating their invariant", () => {
    const inReserve = 1000n * 10n ** 6n;
    const outReserve = parseEther("1000");
    const stable = reserveSpotPrice(inReserve, outReserve, true, 10n ** 6n, 10n ** 18n);
    expect(priceImpactPercent(1000000n, parseEther("0.9995"), [stable])).toBe(0.05);
    const reverse = reserveSpotPrice(outReserve, inReserve, true, 10n ** 18n, 10n ** 6n);
    expect(priceImpactPercent(parseEther("1"), 999500n, [reverse])).toBe(0.05);
    // x=2,y=1: stable marginal price is 13/14, not the volatile ratio 1/2.
    const unbalanced = reserveSpotPrice(2n, 1n, true);
    expect(priceImpactPercent(14n, 13n, [unbalanced])).toBe(0);
  });

  it("fails closed on invalid prices instead of silently reporting no impact", () => {
    expect(() => reserveSpotPrice(0n, 1n)).toThrow();
    expect(() => v3SpotPrice(0n, true)).toThrow();
    expect(() => priceImpactPercent(1n, 1n, [])).toThrow();
    expect(priceImpactPercent(1n, 2n, [reserveSpotPrice(1n, 1n)])).toBe(0);
  });

  it("reads all V2 state at the quote block and handles reversed pool ordering", async () => {
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([pool])
      .mockResolvedValueOnce([[2000n, 1000n, 0], token1]);
    const client = { multicall } as unknown as Pick<PublicClient, "multicall">;
    expect(await getRoutePriceImpact(client, 8453, route, 100n, 180n, 123n)).toBe(10);
    for (const [call] of multicall.mock.calls) {
      expect(call.blockNumber).toBe(123n);
      expect(call.allowFailure).toBe(false);
    }
  });

  it("reads Aerodrome metadata and V3 slot0 through their own factory", async () => {
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([pool])
      .mockResolvedValueOnce([
        [10n ** 6n, 10n ** 18n, 1000000000n, parseEther("1000"), true, token0, token1],
      ]);
    const client = { multicall } as unknown as Pick<PublicClient, "multicall">;
    expect(
      await getRoutePriceImpact(
        client,
        8453,
        { ...route, venue: "Aerodrome", stable: [true] },
        1000000n,
        parseEther("0.99"),
        123n
      )
    ).toBe(1);
    multicall
      .mockResolvedValueOnce([pool])
      .mockResolvedValueOnce([[2n ** 96n, 0, 0, 0, 0, 0, true], token0]);
    expect(
      await getRoutePriceImpact(
        client,
        8453,
        { ...route, venue: "Uniswap V3", fee: 500 },
        100n,
        99n,
        124n
      )
    ).toBe(1);
  });

  it("returns unavailable for missing pools or failed RPC reads", async () => {
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([zeroAddress])
      .mockRejectedValueOnce(new Error("RPC failed"));
    const client = { multicall } as unknown as Pick<PublicClient, "multicall">;
    expect(await getRoutePriceImpact(client, 8453, route, 100n, 90n, 123n)).toBeNull();
    expect(await getRoutePriceImpact(client, 8453, route, 100n, 90n, 123n)).toBeNull();
  });

  it("looks up each V3 hop's pool with that hop's own fee tier", async () => {
    const mid = "0x0000000000000000000000000000000000000004";
    const sqrt = 2n ** 96n;
    const calls: unknown[][] = [];
    const multicall = vi.fn(
      async ({ contracts }: { contracts: Array<{ functionName: string; args?: unknown[] }> }) => {
        if (contracts[0]!.functionName === "getPool") {
          calls.push(...contracts.map((c) => c.args!));
          return contracts.map(() => pool);
        }
        return [[sqrt, 0, 0, 0, 0, 0, true], token0];
      }
    );
    const v3: SmartRoute = {
      venue: "Uniswap V3",
      router: pool,
      path: [token0, mid, token1],
      stable: [],
      fees: [500, 10000],
    };
    const impact = await getRoutePriceImpact(
      { multicall } as unknown as Pick<PublicClient, "multicall">,
      8453,
      v3,
      1000n,
      990n,
      1n
    );
    expect(calls.map((args) => args[2])).toEqual([500, 10000]);
    expect(impact).toBe(1);
  });
});
