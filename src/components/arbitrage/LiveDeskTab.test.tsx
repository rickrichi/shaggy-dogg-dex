import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { LiveDeskTab } from "./LiveDeskTab";

import type { Snapshot } from "@/types/crypto-arb";

vi.mock("@/config/crypto-arb", () => ({ ARB_PRIVATE_API: false, ARB_API_URL: "" }));
vi.mock("./BaseExecutionComparison", () => ({
  BaseExecutionComparison: ({ notional }: { notional: number }) => <p>Base quote for {notional}</p>,
}));

it("shows public quotes, marks aged books stale, and validates editable USDC amounts", () => {
  const snapshot: Snapshot = {
    type: "snapshot",
    ts: Date.now() - 10_000,
    seq: 1,
    notional: 1000,
    opportunities: [],
    venues: [
      {
        exchange: "kraken",
        symbol: "ETH/USD",
        bid: 2000,
        ask: 2001,
        bidSize: 1,
        askSize: 1,
        ageMs: 0,
        status: "live",
        takerFee: null,
        error: null,
      },
    ],
  };
  const select = vi.fn();
  render(<LiveDeskTab symbol="ETH/USD" snapshot={snapshot} onSelectSymbol={select} />);
  expect(screen.getByText("kraken")).toBeVisible();
  expect(screen.getByText("stale")).toBeVisible();
  expect(screen.queryByText(/Balances reconnecting/)).toBeNull();
  const input = screen.getByRole("spinbutton");
  for (const value of ["", "1000001", "1.0000009"]) {
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/Base quote for/)).toBeNull();
  }
  fireEvent.change(input, { target: { value: "1.000001" } });
  expect(screen.getByText("Base quote for 1.000001")).toBeVisible();
  fireEvent.change(input, { target: { value: "42.5" } });
  expect(screen.getByText("Base quote for 42.5")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "BTC/USD" }));
  expect(select).toHaveBeenCalledWith("BTC/USD");
});

it("matches lowercase BTC links and prompts for a supported pair on unknown links", () => {
  const { rerender } = render(
    <LiveDeskTab symbol="btc/usd" snapshot={null} onSelectSymbol={vi.fn()} />
  );
  expect(screen.getByRole("button", { name: "BTC/USD" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("BTC/USD exchange quotes")).toBeVisible();
  rerender(<LiveDeskTab symbol="DOGE/USD" snapshot={null} onSelectSymbol={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Select a pair above");
  expect(screen.queryByText("ETH/USD exchange quotes")).toBeNull();
});
