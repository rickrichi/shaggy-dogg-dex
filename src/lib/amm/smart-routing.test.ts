import { decodeFunctionData, encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  AERODROME_ROUTER_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_SWAP_ROUTER_02_ABI,
} from "@/config/abis";
import { UNISWAP_V3_ROUTER_BASE } from "@/config/contracts";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";

import { encodeV3Path } from "./bot-market-snapshot";
import {
  AERODROME_ROUTER,
  routeCandidates,
  routeQuoteCall,
  routeSwapCall,
  v3RouteFees,
} from "./smart-routing";

const weth = BASE_MAINNET_TOKENS.find((t) => t.symbol === "WETH")!;
const usdc = BASE_MAINNET_TOKENS.find((t) => t.symbol === "USDC")!;
const cbbtc = BASE_MAINNET_TOKENS.find((t) => t.symbol === "cbBTC")!;

describe("Executable router plans", () => {
  it("compares Uniswap V3 fee tiers, Uniswap V2, and Aerodrome pools without degenerate wrapped routes", () => {
    const routes = routeCandidates(usdc, weth);
    expect(routes).toHaveLength(7);
    expect(routes.filter((r) => r.venue === "Uniswap V3").map((r) => r.fee)).toEqual([
      100, 500, 3000, 10000,
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
        expect(decoded.functionName).toBe("multicall");
        if (decoded.functionName !== "multicall") throw new Error("Expected deadline multicall");
        expect(decoded.args[0]).toBe(2000000000n);
        const swap = decodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
          data: decoded.args[1][0]!,
        });
        expect(swap.functionName).toBe("exactInputSingle");
        const params = swap.args?.[0] as {
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
    expect(decodedBuy.functionName).toBe("multicall");
    if (decodedBuy.functionName !== "multicall") throw new Error("Expected deadline multicall");
    expect(decodedBuy.args[0]).toBe(2000000000n);
    expect(
      decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_02_ABI, data: decodedBuy.args[1][1]! })
        .functionName
    ).toBe("refundETH");

    // USDC -> Native ETH (multicall with unwrapWETH9)
    const tokenToEthCall = routeSwapCall(
      routeCandidates(usdc, nativeEth).find((r) => r.venue === "Uniswap V3")!,
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
    if (decodedSell.functionName !== "multicall") throw new Error("Expected deadline multicall");
    const swap = decodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      data: decodedSell.args[1][0]!,
    });
    if (swap.functionName !== "exactInputSingle") throw new Error("Expected swap");
    expect(swap.args[0].recipient).toBe("0x0000000000000000000000000000000000000002");
    const unwrap = decodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      data: decodedSell.args[1][1]!,
    });
    expect(unwrap.functionName).toBe("unwrapWETH9");
    expect(unwrap.args).toEqual([300000000000000n, AERODROME_ROUTER]);
  });
  it("rejects wrong-chain, mismatched-route and unprotected V3 swaps", () => {
    const route = routeCandidates(usdc, weth)[0]!;
    expect(() => routeSwapCall(route, usdc, weth, 1n, 0n, AERODROME_ROUTER, 1n)).toThrow();
    expect(() => routeSwapCall(route, weth, usdc, 1n, 1n, AERODROME_ROUTER, 1n)).toThrow();
    expect(() =>
      routeSwapCall(route, { ...usdc, chainId: 1 }, weth, 1n, 1n, AERODROME_ROUTER, 1n)
    ).toThrow();
  });

  it("quotes two-hop Uniswap V3 paths through WETH and USDC across every fee-tier pair", () => {
    const multi = routeCandidates(usdc, cbbtc).filter(
      (r) => r.venue === "Uniswap V3" && r.path.length === 3
    );
    expect(multi).toHaveLength(16);
    expect(multi.every((r) => r.fee === undefined && r.fees?.length === 2)).toBe(true);
    expect(new Set(multi.map((r) => r.fees!.join("-"))).size).toBe(16);
    expect(multi.every((r) => r.path[1] === weth.address)).toBe(true);

    const route = multi.find((r) => r.fees![0] === 500 && r.fees![1] === 3000)!;
    expect(v3RouteFees(route)).toEqual([500, 3000]);
    const quote = routeQuoteCall(route, 1_000_000n);
    expect(quote.functionName).toBe("quoteExactInput");
    expect(quote.args).toEqual([encodeV3Path(route.path, [500, 3000]), 1_000_000n]);
  });

  it("executes a two-hop V3 route with exactInput on the quoted path and minimum", () => {
    const route = routeCandidates(usdc, cbbtc).find(
      (r) => r.venue === "Uniswap V3" && r.fees?.join() === "500,3000"
    )!;
    const call = routeSwapCall(route, usdc, cbbtc, 1_000_000n, 900n, AERODROME_ROUTER, 7n);
    const decoded = decodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      data: encodeFunctionData(call),
    });
    if (decoded.functionName !== "multicall") throw new Error("Expected deadline multicall");
    expect(decoded.args[0]).toBe(7n);
    expect(decoded.args[1]).toHaveLength(1);
    const swap = decodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      data: decoded.args[1][0]!,
    });
    if (swap.functionName !== "exactInput") throw new Error("Expected exactInput");
    expect(swap.args[0]).toEqual({
      path: encodeV3Path(
        [usdc.address, weth.address, cbbtc.address] as Array<`0x${string}`>,
        [500, 3000]
      ).toLowerCase(),
      recipient: AERODROME_ROUTER,
      amountIn: 1_000_000n,
      amountOutMinimum: 900n,
    });
  });

  it("rejects malformed multi-hop V3 routes", () => {
    const route = routeCandidates(usdc, cbbtc).find(
      (r) => r.venue === "Uniswap V3" && r.path.length === 3
    )!;
    const call = (r: typeof route) => routeSwapCall(r, usdc, cbbtc, 1n, 1n, AERODROME_ROUTER, 1n);
    expect(() => call({ ...route, fees: [500] })).toThrow();
    expect(() => call({ ...route, fees: [500, 2500] })).toThrow();
    expect(() => call({ ...route, fee: 500 })).toThrow();
    expect(() =>
      call({ ...route, path: [route.path[0]!, route.path[1]!, weth.address as `0x${string}`] })
    ).toThrow();
    expect(() =>
      call({
        ...route,
        path: [...route.path, usdc.address as `0x${string}`],
        fees: [500, 500, 500],
      })
    ).toThrow();
  });
});
