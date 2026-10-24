// src/pages/Portfolio.test.tsx
import { BrowserRouter } from "react-router-dom";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as wagmi from "wagmi";

import * as usePortfolioModule from "@/hooks/usePortfolio";

import Portfolio from "./Portfolio";

vi.mock("wagmi", async () => {
  const actual = await vi.importActual<typeof import("wagmi")>("wagmi");
  return {
    ...actual,
    useAccount: vi.fn(),
    useChainId: vi.fn(),
  };
});

vi.mock("@/hooks/usePortfolio", () => ({
  usePortfolio: vi.fn(),
}));

describe("Portfolio Page - Permanent On-Chain Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the disconnected prompt when wallet is not connected", () => {
    vi.mocked(wagmi.useAccount).mockReturnValue({
      address: undefined,
      isConnected: false,
    } as ReturnType<typeof wagmi.useAccount>);
    vi.mocked(wagmi.useChainId).mockReturnValue(8453);
    vi.mocked(usePortfolioModule.usePortfolio).mockReturnValue({
      tokens: [],
      summary: {
        totalValue: 0,
        totalTokens: 0,
        topChain: "Base",
        biggestHolding: null,
        percentChange24h: 0,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <Portfolio />
      </BrowserRouter>
    );

    expect(screen.getByText(/Connect Your Wallet to View Portfolio/i)).toBeInTheDocument();
    expect(screen.getByText(/Go to Swap/i)).toBeInTheDocument();
  });

  it("renders on-chain token balances when wallet is connected", () => {
    vi.mocked(wagmi.useAccount).mockReturnValue({
      address: "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98",
      addresses: ["0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98"],
      chain: undefined,
      chainId: 8453,
      connector: {} as NonNullable<ReturnType<typeof wagmi.useAccount>["connector"]>,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected",
    } as ReturnType<typeof wagmi.useAccount>);
    vi.mocked(wagmi.useChainId).mockReturnValue(8453);
    vi.mocked(usePortfolioModule.usePortfolio).mockReturnValue({
      tokens: [
        {
          key: "native:8453",
          symbol: "ETH",
          name: "Ether",
          address: "0x0000000000000000000000000000000000000000",
          decimals: 18,
          chainId: 8453,
          balance: "10252582574935120",
          balanceFormatted: "0.0103",
          usdValue: 25.75,
          priceUsd: 2500,
        },
        {
          key: "SD:0x051c758521971f5c5a84edaf18eea12854375469:8453",
          symbol: "SD",
          name: "Shaggy Dogg",
          address: "0x051c758521971f5c5a84edaf18eea12854375469",
          decimals: 18,
          chainId: 8453,
          balance: "499999997500000000000000",
          balanceFormatted: "500000",
          usdValue: 0,
          priceUsd: 0,
        },
        {
          key: "FBA:0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263:8453",
          symbol: "FBA",
          name: "FBA Token",
          address: "0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263",
          decimals: 18,
          chainId: 8453,
          balance: "54528054677297666843090266",
          balanceFormatted: "54528054.67",
          usdValue: 0,
          priceUsd: 0,
        },
      ],
      summary: {
        totalValue: 25.75,
        totalTokens: 3,
        topChain: "Base",
        biggestHolding: null,
        percentChange24h: 0,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <Portfolio />
      </BrowserRouter>
    );

    // Verify header stats
    expect(screen.getByText(/Portfolio Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/0.0103 ETH/i)).toBeInTheDocument();

    // Verify token rows exist
    expect(screen.getByText("Shaggy Dogg")).toBeInTheDocument();
    expect(screen.getByText("FBA Token")).toBeInTheDocument();
    expect(screen.getByText("0.0103")).toBeInTheDocument();
    expect(screen.getByText("500,000")).toBeInTheDocument();
  });

  it("says prices are unavailable instead of showing a made-up value", () => {
    vi.mocked(wagmi.useAccount).mockReturnValue({
      address: "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98",
      isConnected: true,
    } as unknown as ReturnType<typeof wagmi.useAccount>);
    vi.mocked(wagmi.useChainId).mockReturnValue(8453);
    vi.mocked(usePortfolioModule.usePortfolio).mockReturnValue({
      tokens: [],
      summary: {
        totalValue: 0,
        totalTokens: 0,
        topChain: "Base",
        biggestHolding: null,
        percentChange24h: 0,
      },
      isLoading: false,
      error: null,
      pricesUnavailable: true,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <Portfolio />
      </BrowserRouter>
    );

    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
    expect(screen.getByText(/The price server did not answer/)).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
