import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { AERODROME_ROUTER_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { AERODROME_ROUTER, routeCandidates, routeSwapCall } from "./smart-routing";
const weth = BASE_MAINNET_TOKENS.find((t) => t.symbol === "WETH")!;
const usdc = BASE_MAINNET_TOKENS.find((t) => t.symbol === "USDC")!;
describe("Executable router plans", () => {
  it("compares both Aerodrome pool types and Uniswap without degenerate wrapped routes", () => {
    const routes = routeCandidates(usdc, weth);
    expect(routes).toHaveLength(3);
    expect(routes.filter((r) => r.venue === "Aerodrome").map((r) => r.stable)).toEqual([
      [false],
      [true],
    ]);
    expect(routeCandidates(weth, { ...weth, kind: "native", address: "native" })).toEqual([]);
    expect(routeCandidates(usdc, { ...weth, chainId: 1 })).toEqual([]);
  });
  it("encodes the selected router's path and preserves minimum output", () => {
    for (const route of routeCandidates(usdc, weth)) {
      const call = routeSwapCall(
        route,
        usdc,
        weth,
        1000000n,
        300000000000000n,
        AERODROME_ROUTER,
        2000000000n
      );
      const decoded = decodeFunctionData({
        abi: route.venue === "Aerodrome" ? AERODROME_ROUTER_ABI : UNISWAP_V2_ROUTER_ABI,
        data: encodeFunctionData(call),
      });
      expect(decoded.functionName).toBe("swapExactTokensForTokens");
      expect(decoded.args?.[1]).toBe(300000000000000n);
      expect(call.address).toBe(route.router);
      if (route.venue === "Aerodrome")
        expect(decoded.args?.[2]).toEqual([
          {
            from: usdc.address,
            to: weth.address,
            stable: route.stable[0],
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
          },
        ]);
    }
  });
});
