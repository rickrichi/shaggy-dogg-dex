import { describe, expect, it } from "vitest";

import { getUniswapV2Factory, getUniswapV2Router, isSwapChain, UNISWAP_V2 } from "./contracts";
import { getTokensForChain, getWrappedNativeAddress } from "./tokens";

const CHAINS = [1, 8453, 42161, 10, 137, 11155111];

describe("swap chains", () => {
  it("covers every chain the wallet can connect to", () => {
    for (const id of CHAINS) expect(isSwapChain(id)).toBe(true);
    expect(isSwapChain(56)).toBe(false);
    expect(isSwapChain(undefined)).toBe(false);
  });

  it("uses each chain's own router, never Ethereum's elsewhere", () => {
    for (const id of CHAINS) {
      expect(getUniswapV2Router(id)).toBe(UNISWAP_V2[id]!.router);
      expect(getUniswapV2Factory(id)).toBe(UNISWAP_V2[id]!.factory);
    }
    expect(getUniswapV2Router(10)).not.toBe(getUniswapV2Router(1));
    expect(getUniswapV2Router(137)).not.toBe(getUniswapV2Router(1));
  });

  it("lists tokens of that chain, including its wrapped native token", () => {
    for (const id of CHAINS.filter((c) => c !== 1)) {
      const tokens = getTokensForChain(id);
      expect(tokens.every((t) => t.chainId === id)).toBe(true);
      expect(tokens.some((t) => t.kind === "native")).toBe(true);
      const wrapped = getWrappedNativeAddress(id).toLowerCase();
      expect(tokens.some((t) => t.kind === "erc20" && t.address.toLowerCase() === wrapped)).toBe(true);
    }
  });
});
