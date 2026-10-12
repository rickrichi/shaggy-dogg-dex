import { decodeFunctionData, encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  AERODROME_ROUTER_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_SWAP_ROUTER_02_ABI,
} from "@/config/abis";
import { UNISWAP_V3_ROUTER_BASE } from "@/config/contracts";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";

import { AERODROME_ROUTER, routeCandidates, routeSwapCall } from "./smart-routing";

const weth = BASE_MAINNET_TOKENS.find((t) => t.symbol === "WETH")!;
const usdc = BASE_MAINNET_TOKENS.find((t) => t.symbol === "USDC")!;

describe("Executable router plans", () => {
  it("compares Uniswap V3 fee tiers, Uniswap V2, and Aerodrome pools without degenerate wrapped routes", () => {
    const routes = routeCandidates(usdc, weth);
    expect(routes).toHaveLength(6);
    expect(routes.filter((r) => r.venue === "Uniswap V3").map((r) => r.fee)).toEqual([
      500,
      3000,
      10000,
    ]);
    expect(routes.filter((r) => r.venue === "Uniswap V2")).toHaveLength(1);
    expect(routes.filter((r) => r.venue === "Aerodrome").map((r) => r.stable)).toEqual([
      [false],
      [true],
    ]);
    expect(routeCandidates(weth, { ...weth, kind: "native", address: "native" })).toEqual([]);
    expect(routeCandidates(usdc, { ...weth, chainId: 1 })).toEqual([]);
  });

  it("encodes the selected router's path and preserves minimum output across venues", () => {
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
      if (route.venue === "Uniswap V3") {
        const decoded = decodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
          data: encodeFunctionData(call),
        });
        expect(decoded.functionName).toBe("exactInputSingle");
        const params = decoded.args?.[0] as {
          tokenIn: string;
          tokenOut: string;
          fee: number;
          amountIn: bigint;
          amountOutMinimum: bigint;
          recipient: string;
        };
        expect(params.tokenIn.toLowerCase()).toBe(usdc.address.toLowerCase());
        expect(params.tokenOut.toLowerCase()).toBe(weth.address.toLowerCase());
        expect(params.fee).toBe(route.fee);
        expect(params.amountIn).toBe(1000000n);
        expect(params.amountOutMinimum).toBe(300000000000000n);
        expect(call.address).toBe(UNISWAP_V3_ROUTER_BASE);
      } else {
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
    }
  });

  it("encodes native ETH trades correctly for Uniswap V3", () => {
    const nativeEth = { ...weth, kind: "native" as const, address: "native" as const };
    const [v3Route] = routeCandidates(nativeEth, usdc).filter((r) => r.venue === "Uniswap V3");
    expect(v3Route).toBeDefined();

    // Native ETH -> USDC
    const ethToTokenCall = routeSwapCall(
      v3Route!,
      nativeEth,
      usdc,
      100000000000000n,
      100000n,
      AERODROME_ROUTER,
      2000000000n
    );
    expect(ethToTokenCall.value).toBe(100000000000000n);
    const decodedBuy = decodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      data: encodeFunctionData(ethToTokenCall),
    });
    expect(decodedBuy.functionName).toBe("exactInputSingle");

    // USDC -> Native ETH (multicall with unwrapWETH9)
    const tokenToEthCall = routeSwapCall(
      v3Route!,
      usdc,
      nativeEth,
      1000000n,
      300000000000000n,
      AERODROME_ROUTER,
      2000000000n
    );
    const decodedSell = decodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      data: encodeFunctionData(tokenToEthCall),
    });
    expect(decodedSell.functionName).toBe("multicall");
  });
});

