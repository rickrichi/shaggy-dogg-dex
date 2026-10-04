import { describe, expect, it, vi } from "vitest";
import { matrixRoute, fetchMatrixDexQuotes } from "./matrix-quotes";

const multicall = vi.hoisted(() => vi.fn());
vi.mock("viem", async importOriginal => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: () => ({ multicall }),
}));

describe("Matrix Base routes", () => {
  it("uses explicit token identities and correctly sized units", () => {
    expect(matrixRoute("ETH/USDC")?.inputSymbol).toBe("WETH");
    expect(matrixRoute("ETH/USDC")?.amountIn).toBe(10n ** 18n);
    expect(matrixRoute("ETH/USDC")?.decimalsOut).toBe(6);
    for (const symbol of ["BTC/USDC", "ETH/USD", "ETH/USDT", "ETH/WETH", "SOL/USDC"]) expect(matrixRoute(symbol)).toBeNull();
  });
  it("returns a real quote and distinguishes a failed route", async () => {
    multicall.mockResolvedValueOnce([{ status: "success", result: [10n ** 18n, 2500250000n] }]);
    expect((await fetchMatrixDexQuotes(["ETH/USDC"]))["ETH/USDC"]?.output).toBe("2500.25");
    multicall.mockResolvedValueOnce([{ status: "failure", error: new Error("revert") }]);
    expect((await fetchMatrixDexQuotes(["ETH/USDC"]))["ETH/USDC"]?.status).toBe("unavailable");
  });
  it("does not retain a price after an RPC failure or request unsupported pairs", async () => {
    multicall.mockRejectedValueOnce(new Error("offline"));
    const quote = (await fetchMatrixDexQuotes(["ETH/USDC"]))["ETH/USDC"];
    expect(quote?.status).toBe("rpc-error");
    expect(quote?.output).toBeUndefined();
    multicall.mockClear();
    expect(await fetchMatrixDexQuotes(["ETH/USD"])).toEqual({});
    expect(multicall).not.toHaveBeenCalled();
  });
});
