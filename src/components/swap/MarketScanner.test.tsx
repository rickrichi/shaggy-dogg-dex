// src/components/swap/MarketScanner.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as wagmi from "wagmi";

import { getTokensForChain, isErc20Token } from "@/config/tokens";
import * as pricesApi from "@/lib/api/prices";

import { MarketScanner } from "./MarketScanner";

vi.mock("wagmi", async () => {
  const actual = await vi.importActual<typeof import("wagmi")>("wagmi");
  return { ...actual, useAccount: vi.fn(), usePublicClient: vi.fn() };
});
vi.mock("@/lib/api/prices", () => ({ fetchPrices: vi.fn() }));

const WALLET = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const SD = "0x051c758521971f5c5a84edaf18eea12854375469";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ZERO = "0x0000000000000000000000000000000000000000";

const PRICES = {
  success: true as const,
  data: {
    prices: [
      { address: ZERO, priceUsd: 2400, change24hPercent: -3.3, symbol: "ETH" },
      { address: USDC, priceUsd: 1, change24hPercent: 0.01, symbol: "USDC" },
      {
        address: SD,
        priceUsd: 2.9e-8,
        change24hPercent: 0,
        symbol: "SD",
        indicative: true,
        liquidityUsd: 3,
      },
    ],
    unpriced: [],
    failed: [],
  },
} satisfies Awaited<ReturnType<typeof pricesApi.fetchPrices>>;

function connect(address?: string) {
  vi.mocked(wagmi.useAccount).mockReturnValue({
    address,
    chain: { id: 8453 },
    isConnected: Boolean(address),
  } as unknown as ReturnType<typeof wagmi.useAccount>);
}

function walletBalances(balances: Record<string, bigint>, native: bigint) {
  vi.mocked(wagmi.usePublicClient).mockReturnValue({
    getBalance: vi.fn().mockResolvedValue(native),
    multicall: vi.fn(async ({ contracts }: { contracts: Array<{ address: string }> }) =>
      contracts.map((c) => ({ status: "success", result: balances[c.address.toLowerCase()] ?? 0n }))
    ),
  } as unknown as ReturnType<typeof wagmi.usePublicClient>);
}

function start() {
  render(<MarketScanner />);
  fireEvent.click(screen.getByRole("button", { name: /Start Scanner/i }));
}

describe("MarketScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect();
    vi.mocked(wagmi.usePublicClient).mockReturnValue(undefined);
  });

  it("scans only the connected chain's tokens, asks for thin prices, and keeps them out of movers", async () => {
    vi.mocked(pricesApi.fetchPrices).mockResolvedValue(PRICES);
    start();

    const baseErc20 = getTokensForChain(8453).filter(isErc20Token);
    await waitFor(() => expect(pricesApi.fetchPrices).toHaveBeenCalledTimes(1));
    const request = vi.mocked(pricesApi.fetchPrices).mock.calls[0]?.[0];
    expect(request).toMatchObject({ chainId: 8453, includeThin: true });
    expect(request?.addresses).toHaveLength(baseErc20.length);

    expect(await screen.findByText(/tokens priced/)).toHaveTextContent(
      `2 of ${baseErc20.length + 1} tokens priced, 1 indicative`
    );
    expect(screen.getByText("Ether")).toBeInTheDocument();
    expect(screen.queryByText("Shaggy Dogg")).not.toBeInTheDocument();
    expect(screen.getByText(/Indicative only .*: SD/)).toBeInTheDocument();
  });

  it("shows wallet holdings with firm and indicative values kept apart", async () => {
    connect(WALLET);
    walletBalances(
      { [SD]: 54_000_000n * 10n ** 18n, [USDC]: 9_750_000n },
      4_600_000_000_000_000n
    );
    vi.mocked(pricesApi.fetchPrices).mockResolvedValue(PRICES);
    start();
    fireEvent.click(screen.getByRole("button", { name: "My holdings" }));

    expect(await screen.findByText("54,000,000 SD")).toBeInTheDocument();
    expect(screen.getByText("0.0046 ETH")).toBeInTheDocument();
    expect(screen.getByText("9.75 USDC")).toBeInTheDocument();
    expect(screen.getByText(/indicative · \$3\.00 pool/)).toBeInTheDocument();
    expect(screen.getByText("≈ $1.57")).toBeInTheDocument();
    // Total counts only firm prices: 0.0046 ETH × $2,400 + 9.75 USDC
    expect(screen.getByText("$20.79")).toBeInTheDocument();
    expect(screen.getByText("+ ≈ $1.57 indicative")).toBeInTheDocument();
  });

  it("asks for a wallet in the holdings view when none is connected", async () => {
    vi.mocked(pricesApi.fetchPrices).mockResolvedValue(PRICES);
    start();
    fireEvent.click(screen.getByRole("button", { name: "My holdings" }));

    expect(await screen.findByText("Connect a wallet to see your holdings.")).toBeInTheDocument();
  });

  it("says price data is unavailable instead of showing a live scan", async () => {
    vi.mocked(pricesApi.fetchPrices).mockRejectedValue(new Error("market_data_unavailable"));
    start();

    expect(await screen.findByText(/the price service is not responding/)).toBeInTheDocument();
    expect(screen.getByText("Price data unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Live scan|Updated/)).not.toBeInTheDocument();
  });
});
