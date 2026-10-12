import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import requested from "@/config/requested-market-pairs.json";

import { PAIR_MATRIX_DATA, PairMatrix100 } from "./PairMatrix100";

vi.mock("@/hooks/useMatrixDexQuotes", () => ({
  useMatrixDexQuotes: () => ({
    now: 100_000,
    quotes: {
      "ETH/USDC": {
        status: "quoted",
        output: "2500.25",
        inputSymbol: "WETH",
        outputSymbol: "USDC",
        checkedAt: 99_000,
      },
    },
  }),
}));

describe("PairMatrix100 Component", () => {
  it("shows the routed DEX quote alongside exact CEX prices and filters Base mappings", () => {
    render(
      <PairMatrix100
        krakenBalances={{ free: {} }}
        snapshot={{
          type: "snapshot",
          ts: 99_000,
          seq: 1,
          notional: 1000,
          opportunities: [],
          venues: [
            {
              exchange: "kraken",
              symbol: "ETH/USDC",
              status: "live",
              bid: 2501,
              ask: 2502,
              bidSize: 1,
              askSize: 1,
              ageMs: 100,
              takerFee: 0.0026,
              error: null,
            },
          ],
        }}
      />
    );
    expect(screen.getByRole("columnheader", { name: "Shaggy-Dogg-Dex" })).toBeInTheDocument();
    expect(screen.getByText("1 WETH → 2500.25 USDC")).toBeInTheDocument();
    expect(screen.getByText("Bid 2,501 / Ask 2,502")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Shaggy-Dogg-Dex · Base mappings/ }));
    expect(screen.queryByText("SOL/USDT")).not.toBeInTheDocument();
    expect(screen.getByText("ETH/USDC")).toBeInTheDocument();
    expect(screen.getByText("BTC/USDT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Show All (${PAIR_MATRIX_DATA.length})` }));
    expect(screen.getByText("SOL/USDT")).toBeInTheDocument();
  });
  it("renders the expanded matrix", () => {
    render(<PairMatrix100 krakenBalances={{ free: {} }} />);
    expect(
      screen.getByText(`${PAIR_MATRIX_DATA.length}-Pair Spot Arbitrage Matrix`)
    ).toBeInTheDocument();
    expect(screen.getByText("BTC/USDT")).toBeInTheDocument();
    expect(screen.getByText("ETH/USDT")).toBeInTheDocument();
  });

  it("handles funded balances correctly", () => {
    render(
      <PairMatrix100
        krakenBalances={{
          free: { SEI: 77.03, USDC: 29.2, ETH: 0.0117, USD: 0.55 },
        }}
      />
    );
    expect(screen.getAllByText(/Base and quote held: 77.03 SEI/i).length).toBeGreaterThan(0);
  });

  it("includes every requested pair once and preserves legacy symbols", () => {
    const symbols = PAIR_MATRIX_DATA.map((p) => p.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const symbol of requested) expect(symbols).toContain(symbol);
    for (const symbol of [
      "BTC/USD",
      "ETH/USD",
      "SOL/USD",
      "SEI/USD",
      "PEPE/USD",
      "RENDER/USDT",
      "LRC/USDT",
    ])
      expect(symbols).toContain(symbol);
    for (const pair of PAIR_MATRIX_DATA) expect(pair.baseAsset).not.toBe(pair.quoteAsset);
  });

  it("selects cross-currency pairs without treating USDC as BTC funding", () => {
    const select = vi.fn();
    render(<PairMatrix100 onSelectPair={select} krakenBalances={{ free: { USDC: 29.2 } }} />);
    fireEvent.change(screen.getByPlaceholderText(/Filter by symbol/), {
      target: { value: "ETH/BTC" },
    });
    const row = screen.getByText("ETH/BTC").closest("tr")!;
    expect(within(row).getByText("No Kraken Balance")).toBeInTheDocument();
    expect(within(row).getAllByText("Unverified")).toHaveLength(5);
    fireEvent.click(within(row).getByRole("button", { name: /Load Pair/ }));
    expect(select).toHaveBeenCalledWith("ETH/BTC");
  });
});
