import { describe, expect, it, vi } from "vitest";

import { fetchMatrixDexQuotes, matrixRoute } from "./matrix-quotes";

const multicall = vi.hoisted(() => vi.fn());
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({ multicall }),
}));

describe("Matrix Base routes", () => {
  it("uses explicit token identities and correctly sized units", () => {
    expect(matrixRoute("ETH/USDC")?.inputSymbol).toBe("WETH");
    expect(matrixRoute("ETH/USDC")?.amountIn).toBe(10n ** 18n);
    expect(matrixRoute("ETH/USDC")?.decimalsOut).toBe(6);

    expect(matrixRoute("BTC/USDC")?.inputSymbol).toBe("cbBTC");
    expect(matrixRoute("BTC/USDC")?.amountIn).toBe(10n ** 8n);
    expect(matrixRoute("BTC/USDC")?.decimalsOut).toBe(6);

    expect(matrixRoute("ETH/USD")?.inputSymbol).toBe("WETH");
    expect(matrixRoute("ETH/USD")?.outputSymbol).toBe("USDC");
    expect(matrixRoute("ETH/USD")?.decimalsOut).toBe(6);

    expect(matrixRoute("ETH/USDT")?.inputSymbol).toBe("WETH");
    expect(matrixRoute("ETH/USDT")?.outputSymbol).toBe("USDT");
    expect(matrixRoute("ETH/USDT")?.decimalsOut).toBe(6);

    expect(matrixRoute("AERO/USDC")?.inputSymbol).toBe("AERO");
    expect(matrixRoute("AERO/USDC")?.outputSymbol).toBe("USDC");

    for (const symbol of ["ETH/WETH", "SOL/USDC", "XRP/USDT", "ADA/USDT"])
      expect(matrixRoute(symbol)).toBeNull();
  });
  it("returns a real quote and distinguishes a failed route", async () => {
    multicall.mockResolvedValueOnce([{ status: "success", result: [10n ** 18n, 2500250000n] }]);
    expect((await fetchMatrixDexQuotes(["ETH/USDC"]))["ETH/USDC"]?.output).toBe("2500.25");
    multicall.mockResolvedValueOnce([{ status: "failure", error: new Error("revert") }]);
    expect((await fetchMatrixDexQuotes(["ETH/USDC"]))["ETH/USDC"]?.status).toBe("unavailable");
  });
  it("processes Uniswap V3 QuoterV2 concentrated liquidity tuples correctly", async () => {
    multicall.mockResolvedValueOnce([
      { status: "success", result: [83450000000n, 123456789n, 2, 75000n] },
    ]);
    const quote = (await fetchMatrixDexQuotes(["BTC/USDC"]))["BTC/USDC"];
    expect(quote?.output).toBe("83450");
    expect(quote?.venueLabel).toContain("Uniswap V3");
  });
  it("does not retain a price after an RPC failure or request unsupported pairs", async () => {
    multicall.mockRejectedValueOnce(new Error("offline"));
    const quote = (await fetchMatrixDexQuotes(["ETH/USDC"]))["ETH/USDC"];
    expect(quote?.status).toBe("rpc-error");
    expect(quote?.output).toBeUndefined();
    multicall.mockClear();
    expect(await fetchMatrixDexQuotes(["SOL/USDC"])).toEqual({});
    expect(multicall).not.toHaveBeenCalled();
  });
});
