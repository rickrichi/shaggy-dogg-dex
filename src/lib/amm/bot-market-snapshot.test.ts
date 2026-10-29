// src/lib/amm/bot-market-snapshot.test.ts
import { decodeFunctionData, type Address, parseEther, parseUnits } from "viem";
import { describe, expect, it, vi } from "vitest";

import { UNISWAP_V3_SWAP_ROUTER_02_ABI } from "@/config/abis";

import {
  type BotQuoteVenues,
  encodeV3Path,
  fetchLiveBotQuotes,
  rankMidAssetCandidates,
  v3TriangularSwapCall,
} from "./bot-market-snapshot";

const WETH: Address = "0x4200000000000000000000000000000000000006";
const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const ALT: Address = "0x1111111111111111111111111111111111111111";
const SIXDEC: Address = "0x2222222222222222222222222222222222222222";

// Three candidates on purpose: cbBTC and SIXDEC both look viable, ALT is clearly bad -- this is
// what lets the "stage 2 overrides stage 1" test actually prove something, rather than having
// only one plausible winner throughout.
const CANDIDATES = [
  { symbol: "cbBTC", address: CBBTC, decimals: 8 },
  { symbol: "ALT", address: ALT, decimals: 18 },
  { symbol: "SIXDEC", address: SIXDEC, decimals: 6 },
];

const VENUES: BotQuoteVenues = {
  uniswapV3Quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  weth: WETH,
  usdc: USDC,
  candidates: CANDIDATES,
};
const POOL = "0xcDAC0d6c6C59727a65F871236188350531885C43";
const WALLET = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const ONE = parseEther("1");
const ALL_FEE_TIERS = [100, 500, 3000, 10000];

const ok = (result: unknown) => ({ status: "success" as const, result });
const failed = { status: "failure" as const, error: new Error("reverted") };
const v3 = (amountOut: bigint) => ok([amountOut, [], [], 0n]);

// ─────────────────────────── Stage-1 (cheap screen) fixture ───────────────────────────
// Candidate order in VENUES.candidates is [cbBTC, ALT, SIXDEC]; rankMidAssetCandidates quotes
// USDC->candidate then candidate->WETH, 4 tiers each, in that order -- so positional indexing
// into the contracts array is exact and doesn't need path decoding.
/** One leg's worth of a stage-1 round: one usable tier per candidate, the rest fail. */
function stage1Round(bestTierByCandidate: number[], bestOutByCandidate: bigint[]) {
  return CANDIDATES.flatMap((_, i) =>
    ALL_FEE_TIERS.map((fee) => (fee === bestTierByCandidate[i] ? v3(bestOutByCandidate[i]!) : failed))
  );
}
// Leg 1, USDC -> candidate: cbBTC $2000->0.02 @500, ALT $2000->2000 @3000, SIXDEC $2000->1999 @100.
const STAGE1A_BEST_TIER = [500, 3000, 100];
const STAGE1A_BEST_OUT = [parseUnits("0.02", 8), parseUnits("2000", 18), parseUnits("1999", 6)];
// Leg 2, candidate -> WETH, using leg 1's amounts: retention is cbBTC 0.9 WETH (best), SIXDEC
// 0.85 WETH (second), ALT 0.1 WETH (worst) -- so stage 1 ranks [cbBTC, SIXDEC, ALT].
const STAGE1B_BEST_TIER = [500, 3000, 100];
const STAGE1B_BEST_OUT = [parseEther("0.9"), parseEther("0.1"), parseEther("0.85")];

/** Chains the default stage-1 screen (both legs) onto a fresh mock multicall fn. */
function withStage1(fn: ReturnType<typeof vi.fn>) {
  return fn
    .mockResolvedValueOnce(stage1Round(STAGE1A_BEST_TIER, STAGE1A_BEST_OUT))
    .mockResolvedValueOnce(stage1Round(STAGE1B_BEST_TIER, STAGE1B_BEST_OUT));
}

describe("rankMidAssetCandidates", () => {
  it("ranks candidates by WETH value retained on a fixed-size round trip, best first", async () => {
    const client = { multicall: withStage1(vi.fn()) };
    const ranked = await rankMidAssetCandidates(client, VENUES);

    expect(ranked.map((c) => c.symbol)).toEqual(["cbBTC", "SIXDEC", "ALT"]);
    expect(client.multicall).toHaveBeenCalledTimes(2);
    expect(client.multicall.mock.calls[0]?.[0].contracts).toHaveLength(CANDIDATES.length * 4);
  });

  it("drops a candidate with no usable tier on either leg", async () => {
    const client = {
      multicall: vi
        .fn()
        // ALT (index 1) fails every tier on leg 1.
        .mockResolvedValueOnce(
          CANDIDATES.flatMap((_, i) =>
            ALL_FEE_TIERS.map((fee) =>
              i === 1 ? failed : fee === STAGE1A_BEST_TIER[i] ? v3(STAGE1A_BEST_OUT[i]!) : failed
            )
          )
        )
        .mockResolvedValueOnce(
          // Only cbBTC and SIXDEC reach leg 2 (ALT was dropped after leg 1).
          [0, 2].flatMap((i) =>
            ALL_FEE_TIERS.map((fee) => (fee === STAGE1B_BEST_TIER[i] ? v3(STAGE1B_BEST_OUT[i]!) : failed))
          )
        ),
    };
    const ranked = await rankMidAssetCandidates(client, VENUES);
    expect(ranked.map((c) => c.symbol)).toEqual(["cbBTC", "SIXDEC"]);
  });

  it("returns empty when nothing has any usable quote", async () => {
    const client = {
      multicall: vi.fn().mockResolvedValueOnce(CANDIDATES.flatMap(() => ALL_FEE_TIERS.map(() => failed))),
    };
    expect(await rankMidAssetCandidates(client, VENUES)).toEqual([]);
    expect(client.multicall).toHaveBeenCalledTimes(1); // never reaches leg 2
  });

  it("returns empty immediately when there are no candidates to rank", async () => {
    const client = { multicall: vi.fn() };
    expect(await rankMidAssetCandidates(client, { ...VENUES, candidates: [] })).toEqual([]);
    expect(client.multicall).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── Stage-2 (full search) fixture ───────────────────────────
// Survivor order out of stage 1 above is [cbBTC, SIXDEC, ALT]. Each gets its own best combo in
// the full 64-combination search; SIXDEC's full-path result deliberately beats cbBTC's, even
// though cbBTC "won" the cheap stage-1 screen -- proving stage 2 isn't just rubber-stamping it.
const SURVIVOR_ORDER = [
  { symbol: "cbBTC", address: CBBTC, winningFees: [500, 100, 500], winningOut: parseEther("0.98") },
  { symbol: "SIXDEC", address: SIXDEC, winningFees: [100, 100, 100], winningOut: parseEther("0.99") },
  { symbol: "ALT", address: ALT, winningFees: [3000, 3000, 3000], winningOut: parseEther("0.5") },
];

function fullSearchRound(opts: {
  weth2Usdc?: (fee: number) => bigint | null;
  aero?: unknown;
  pool?: unknown;
  overridePathOut?: (candidateAddr: string, fees: number[]) => bigint | null;
}) {
  const weth2UsdcOut = opts.weth2Usdc ?? ((fee: number) => (fee === 500 ? parseUnits("2388", 6) : parseUnits("2380", 6)));
  const pathContracts = SURVIVOR_ORDER.flatMap(({ address, winningFees, winningOut }) =>
    ALL_FEE_TIERS.flatMap((f1) =>
      ALL_FEE_TIERS.flatMap((f2) =>
        ALL_FEE_TIERS.map((f3) => {
          const fees = [f1, f2, f3];
          if (opts.overridePathOut) {
            const out = opts.overridePathOut(address, fees);
            return out === null ? failed : v3(out);
          }
          const isWinning = fees.join() === winningFees.join();
          return v3(isWinning ? winningOut : winningOut / 4n);
        })
      )
    )
  );
  return [
    ...pathContracts,
    ...ALL_FEE_TIERS.map((fee) => v3(weth2UsdcOut(fee) ?? 0n)),
    opts.aero ?? ok([ONE, parseUnits("2385", 6)]),
    opts.pool ?? ok(POOL),
  ];
}

function defaultClient() {
  return {
    multicall: withStage1(vi.fn())
      .mockResolvedValueOnce(fullSearchRound({}))
      // Intermediate amounts for the winner (SIXDEC): usdc-mid, sixdec-mid (6 decimals!), aero fee.
      .mockResolvedValueOnce([v3(parseUnits("2390", 6)), v3(parseUnits("2389", 6)), ok(30n)]),
  };
}

describe("fetchLiveBotQuotes (Uniswap V3)", () => {
  it("scans every candidate, runs the full search on the top 3, and returns the real winner", async () => {
    const client = defaultClient();
    const quotes = await fetchLiveBotQuotes(client, VENUES, 1);

    expect(client.multicall).toHaveBeenCalledTimes(4);
    // Stage 1: 3 candidates x 4 tiers, twice (leg 1 then leg 2).
    expect(client.multicall.mock.calls[0]?.[0].contracts).toHaveLength(3 * 4);
    expect(client.multicall.mock.calls[1]?.[0].contracts).toHaveLength(3 * 4);
    // Stage 2: 3 survivors x 64 combos, + 4 WETH/USDC tiers + Aerodrome quote + pool lookup.
    expect(client.multicall.mock.calls[2]?.[0].contracts).toHaveLength(3 * 64 + 4 + 2);

    // SIXDEC's full-path result (0.99) beats cbBTC's (0.98) despite cbBTC winning stage 1.
    expect(quotes?.midAsset.symbol).toBe("SIXDEC");
    expect(quotes?.midAsset.decimals).toBe(6);
    expect(quotes?.triangularPath.fees).toEqual([100, 100, 100]);
    expect(quotes?.triangularTerminalWeth).toBeCloseTo(0.99, 12);

    // Rates: both usdcMid (2390) and the 6-decimal SIXDEC mid (2389) decoded correctly.
    expect(quotes?.wethUsdcPrice).toBeCloseTo(2390, 6);
    expect(quotes?.usdcMidRate).toBeCloseTo(2389 / 2390, 9);
    expect(quotes?.midWethRate).toBeCloseTo(0.99 / 2389, 12);
    expect(
      (quotes?.wethUsdcPrice ?? 0) * (quotes?.usdcMidRate ?? 0) * (quotes?.midWethRate ?? 0)
    ).toBeCloseTo(0.99, 9);
  });

  it("reports the best Uniswap tier with fee-free price and real fee rates", async () => {
    const quotes = await fetchLiveBotQuotes(defaultClient(), VENUES, 1);

    expect(quotes?.uniswapFeeTier).toBe(500);
    expect(quotes?.uniswapFeeRate).toBe(0.0005);
    expect(quotes?.uniswapExecutionPrice).toBeCloseTo(2388, 6);
    expect(quotes?.uniswapEthPrice).toBeCloseTo(2388 / 0.9995, 6);
    expect(quotes?.aerodromeFeeRate).toBe(0.003);
    expect(quotes?.aerodromeEthPrice).toBeCloseTo(2385 / 0.997, 6);
  });

  it("returns null when no candidate survives the cheap screen", async () => {
    const client = {
      multicall: vi.fn().mockResolvedValueOnce(CANDIDATES.flatMap(() => ALL_FEE_TIERS.map(() => failed))),
    };
    expect(await fetchLiveBotQuotes(client, VENUES, 1)).toBeNull();
    expect(client.multicall).toHaveBeenCalledTimes(1); // never reaches stage 2
  });

  it("returns null when every stage-2 survivor fails the full search", async () => {
    const client = {
      multicall: withStage1(vi.fn()).mockResolvedValueOnce(
        fullSearchRound({ overridePathOut: () => null }) // every 3-hop combo fails
      ),
    };
    expect(await fetchLiveBotQuotes(client, VENUES, 1)).toBeNull();
    expect(client.multicall).toHaveBeenCalledTimes(3); // never reaches the intermediate-amounts call
  });

  it.each([
    [
      "no WETH/USDC tier quotes",
      () => ({
        multicall: withStage1(vi.fn()).mockResolvedValueOnce(
          fullSearchRound({ weth2Usdc: () => null })
        ),
      }),
    ],
    [
      "Aerodrome has no pool",
      () => ({
        multicall: withStage1(vi.fn()).mockResolvedValueOnce(
          fullSearchRound({ pool: ok(`0x${"0".repeat(40)}`) })
        ),
      }),
    ],
    [
      "an intermediate leg fails",
      () => ({
        multicall: withStage1(vi.fn())
          .mockResolvedValueOnce(fullSearchRound({}))
          .mockResolvedValueOnce([failed, v3(1n), ok(30n)]),
      }),
    ],
    [
      "the Aerodrome fee cannot be read",
      () => ({
        multicall: withStage1(vi.fn())
          .mockResolvedValueOnce(fullSearchRound({}))
          .mockResolvedValueOnce([v3(1n), v3(1n), failed]),
      }),
    ],
  ])("returns null when %s, so the bot skips the tick", async (_label, makeClient) => {
    expect(await fetchLiveBotQuotes(makeClient(), VENUES, 1)).toBeNull();
  });

  it("returns null when the RPC fails, and never quotes a zero size", async () => {
    const offline = { multicall: vi.fn().mockRejectedValue(new Error("offline")) };
    expect(await fetchLiveBotQuotes(offline, VENUES, 1)).toBeNull();
    expect(await fetchLiveBotQuotes(offline, VENUES, 0)).toBeNull();
    // The size-0 call returns before ever calling multicall; the size-1 call fails at stage 1's
    // first round.
    expect(offline.multicall).toHaveBeenCalledTimes(1);
  });
});

describe("v3TriangularSwapCall", () => {
  const path = {
    tokens: [WETH, USDC, SIXDEC, WETH] as const,
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
