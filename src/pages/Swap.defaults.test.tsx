// src/pages/Swap.defaults.test.tsx
import { MemoryRouter } from "react-router-dom";

import { render, screen } from "@testing-library/react";
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
  return vi
    .mocked(swapHook.useSwap)
    .mock.calls.slice(0, 1)
    .map(([sell, buy]) => [(sell as Token).symbol, (buy as Token).symbol]);
}

describe("Swap page defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([8453, 1])("opens on ETH -> USDC with one swap hook on chain %i", (chainId) => {
    const pairs = openSwap(chainId);

    expect(pairs).toEqual([["ETH", "USDC"]]);
  });

  it("still honours an explicit ?output= link", () => {
    const pairs = openSwap(8453, "/swap?output=0x051c758521971f5c5a84edaf18eea12854375469");
    expect(pairs[0]).toEqual(["ETH", "SD"]);
  });

  it("never initializes the same token on both sides", () => {
    const pairs = openSwap(8453, "/swap?input=USDC&output=USDC&mode=limit");
    expect(pairs[0]?.[0]).not.toBe(pairs[0]?.[1]);
  });

  it("shows one active mode and a disabled limit preview", () => {
    openSwap(8453);
    const swapTab = screen.getByRole("tab", { name: "Swap" });
    expect(swapTab).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById(swapTab.getAttribute("aria-controls")!)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Limit orders coming soon" })).toBeDisabled();
    expect(screen.queryByRole("tab", { name: "Buy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sell" })).not.toBeInTheDocument();
  });
});
