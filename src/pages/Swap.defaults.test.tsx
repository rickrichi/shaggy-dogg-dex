// src/pages/Swap.defaults.test.tsx
import { MemoryRouter } from "react-router-dom";

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as wagmi from "wagmi";

import * as swapHook from "@/hooks/useSwap";

import Swap from "./Swap";

import type { Token } from "@/config/tokens";

vi.mock("wagmi", async () => {
  const actual = await vi.importActual<typeof import("wagmi")>("wagmi");
  return {
    ...actual,
    useAccount: vi.fn(),
    useBlockNumber: vi.fn(() => ({ data: undefined })),
    useGasPrice: vi.fn(() => ({ data: undefined })),
    useSwitchChain: vi.fn(() => ({ isPending: false, switchChain: vi.fn() })),
  };
});
vi.mock("@/hooks/useSwap", () => ({
  useSwap: vi.fn((sellToken: unknown, buyToken: unknown) => ({ state: { sellToken, buyToken } })),
}));
vi.mock("@/components/swap/SwapCard", () => ({ SwapCard: () => null }));
vi.mock("@/components/swap/LimitOrderCard", () => ({ LimitOrderCard: () => null }));
vi.mock("@/components/swap/PriceChart", () => ({ PriceChart: () => null }));
vi.mock("@/components/swap/MarketScanner", () => ({ MarketScanner: () => null }));

function openSwap(chainId: number, url = "/swap") {
  vi.mocked(wagmi.useAccount).mockReturnValue({
    chain: { id: chainId },
    isConnected: false,
  } as unknown as ReturnType<typeof wagmi.useAccount>);
  render(
    <MemoryRouter initialEntries={[url]}>
      <Swap />
    </MemoryRouter>
  );
  // Swap, Buy, Limit and Sell each start a useSwap(sell, buy) instance.
  return vi
    .mocked(swapHook.useSwap)
    .mock.calls.slice(0, 4)
    .map(([sell, buy]) => [(sell as Token).symbol, (buy as Token).symbol]);
}

describe("Swap page defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([8453, 1])(
    "never opens on AMUTT on chain %i: Swap and Limit start ETH -> USDC",
    (chainId) => {
      const pairs = openSwap(chainId);

      expect(pairs.flat()).not.toContain("AMUTT");
      expect(pairs[0]).toEqual(["ETH", "USDC"]); // Swap
      expect(pairs[2]).toEqual(["ETH", "USDC"]); // Limit
    }
  );

  it("still honours an explicit ?output= link", () => {
    const pairs = openSwap(8453, "/swap?output=0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7");
    expect(pairs[0]).toEqual(["ETH", "AMUTT"]);
  });
});
