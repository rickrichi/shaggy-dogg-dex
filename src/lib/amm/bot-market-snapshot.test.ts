// src/lib/amm/bot-market-snapshot.test.ts
import { decodeFunctionData, parseEther, parseUnits } from "viem";
import { describe, expect, it, vi } from "vitest";

import { UNISWAP_V3_SWAP_ROUTER_02_ABI } from "@/config/abis";

import {
  type BotQuoteVenues,
  encodeV3Path,
  fetchLiveBotQuotes,
  v3TriangularSwapCall,
} from "./bot-market-snapshot";

const VENUES: BotQuoteVenues = {
  uniswapV3Quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  cbbtc: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
};
const POOL = "0xcDAC0d6c6C59727a65F871236188350531885C43";
const WALLET = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const ONE = parseEther("1");

const ok = (result: unknown) => ({ status: "success" as const, result });
const failed = { status: "failure" as const, error: new Error("reverted") };
const v3 = (amountOut: bigint) => ok([amountOut, [], [], 0n]);

// 64 triangular paths (f1 x f2 x f3 = 4 x 4 x 4), then 4 single-hop tiers, Aerodrome quote, pool.
interface Call { functionName: string; args: readonly unknown[] }
function firstRead(
  calls: readonly Call[],
  pathOut: (fees: number[]) => bigint | null,
  singleOut: (fee: number) => bigint | null,
  aero: unknown = ok([ONE, parseUnits("2385", 6)]),
  pool: unknown = ok(POOL)
) {
  return calls.map((call) => {
    if (call.functionName === "quoteExactInput") {
      const encoded = call.args[0] as string;
      const fees = [0, 1, 2].map((hop) =>
        Number.parseInt(encoded.slice(2 + 40 + hop * 46, 2 + 40 + hop * 46 + 6), 16)
      );
      const out = pathOut(fees);
      return out === null ? failed : v3(out);
    }
    if (call.functionName === "quoteExactInputSingle") {
      const out = singleOut((call.args[0] as { fee: number }).fee);
      return out === null ? failed : v3(out);
    }
    return call.functionName === "getAmountsOut" ? aero : pool;
  });
}

function client(
  pathOut: (fees: number[]) => bigint | null,
  singleOut: (fee: number) => bigint | null,
  // cbBTC uses 8 decimals, not DAI's 18 — this must match bot-market-snapshot.ts's formatUnits call.
  second: unknown[] = [v3(parseUnits("2390", 6)), v3(parseUnits("2389", 8)), ok(30n)],
  first?: { aero?: unknown; pool?: unknown }
) {
  return {
    multicall: vi
      .fn()
      .mockImplementationOnce(async ({ contracts }: { contracts: Call[] }) =>
        firstRead(contracts, pathOut, singleOut, first?.aero, first?.pool)
      )
      .mockResolvedValueOnce(second),
  };
}

// Best path: 0.05% / 0.01% / 0.05%. Best single hop: 0.05%.
const pathOut = (fees: number[]) =>
  fees.join() === "500,100,500" ? parseEther("0.99") : parseEther("0.9");
const singleOut = (fee: number) => (fee === 500 ? parseUnits("2388", 6) : parseUnits("2380", 6));

describe("fetchLiveBotQuotes (Uniswap V3)", () => {
  it("picks the best fee-tier combination and returns fee-inclusive rates along it", async () => {
    const c = client(pathOut, singleOut);
    const quotes = await fetchLiveBotQuotes(c, VENUES, 1);

    expect(c.multicall.mock.calls[0]?.[0].contracts).toHaveLength(64 + 4 + 2);
    expect(quotes?.triangularPath.fees).toEqual([500, 100, 500]);
    expect(quotes?.triangularTerminalWeth).toBeCloseTo(0.99, 12);
    expect(quotes?.wethUsdcPrice).toBeCloseTo(2390, 6);
    expect(quotes?.usdcCbbtcRate).toBeCloseTo(2389 / 2390, 9);
    expect(quotes?.cbbtcWethRate).toBeCloseTo(0.99 / 2389, 12);
    // Product of the rates is the path's real output: the engine must add no fee.
    expect(
      (quotes?.wethUsdcPrice ?? 0) * (quotes?.usdcCbbtcRate ?? 0) * (quotes?.cbbtcWethRate ?? 0)
    ).toBeCloseTo(0.99, 9);
  });

  it("reports the best Uniswap tier with fee-free price and real fee rates", async () => {
    const quotes = await fetchLiveBotQuotes(client(pathOut, singleOut), VENUES, 1);

    expect(quotes?.uniswapFeeTier).toBe(500);
    expect(quotes?.uniswapFeeRate).toBe(0.0005);
    expect(quotes?.uniswapExecutionPrice).toBeCloseTo(2388, 6);
    expect(quotes?.uniswapEthPrice).toBeCloseTo(2388 / 0.9995, 6);
    expect(quotes?.aerodromeFeeRate).toBe(0.003);
    expect(quotes?.aerodromeEthPrice).toBeCloseTo(2385 / 0.997, 6);
  });

  it.each([
    ["no triangular path has a pool", () => client(() => null, singleOut)],
    ["no WETH/USDC tier quotes", () => client(pathOut, () => null)],
    [
      "Aerodrome has no pool",
      () => client(pathOut, singleOut, undefined, { pool: ok(`0x${"0".repeat(40)}`) }),
    ],
    ["an intermediate leg fails", () => client(pathOut, singleOut, [failed, v3(1n), ok(30n)])],
    [
      "the Aerodrome fee cannot be read",
      () => client(pathOut, singleOut, [v3(1n), v3(1n), failed]),
    ],
  ])("returns null when %s, so the bot skips the tick", async (_label, makeClient) => {
    expect(await fetchLiveBotQuotes(makeClient(), VENUES, 1)).toBeNull();
  });

  it("returns null when the RPC fails, and never quotes a zero size", async () => {
    const offline = { multicall: vi.fn().mockRejectedValue(new Error("offline")) };
    expect(await fetchLiveBotQuotes(offline, VENUES, 1)).toBeNull();
    expect(await fetchLiveBotQuotes(offline, VENUES, 0)).toBeNull();
    expect(offline.multicall).toHaveBeenCalledTimes(1);
  });
});

describe("v3TriangularSwapCall", () => {
  const path = {
    tokens: [VENUES.weth, VENUES.usdc, VENUES.cbbtc, VENUES.weth] as const,
    fees: [500, 100, 500] as const,
  };

  it("sends ETH into SwapRouter02.exactInput on exactly the quoted path, then refunds", () => {
    const call = v3TriangularSwapCall(VENUES.uniswapV3Router, path, ONE, 990n, WALLET, 123n);

    expect(call.address).toBe(VENUES.uniswapV3Router);
    expect(call.functionName).toBe("multicall");
    expect(call.value).toBe(ONE);
    const [deadline, data] = call.args;
    expect(deadline).toBe(123n);
    const swap = decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_02_ABI, data: data[0] });
    expect(swap.functionName).toBe("exactInput");
    expect(swap.args?.[0]).toEqual({
      path: encodeV3Path(path.tokens, path.fees),
      recipient: WALLET,
      amountIn: ONE,
      amountOutMinimum: 990n,
    });
    expect(
      decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_02_ABI, data: data[1] }).functionName
    ).toBe("refundETH");
  });

  it("refuses a zero minimum output", () => {
    expect(() => v3TriangularSwapCall(VENUES.uniswapV3Router, path, ONE, 0n, WALLET, 1n)).toThrow();
  });
});
