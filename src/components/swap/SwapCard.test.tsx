import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BASE_MAINNET_TOKENS } from "@/config/tokens";

import { PriceChart } from "./PriceChart";
import { SwapCard } from "./SwapCard";

import type { UseSwapReturn } from "@/hooks/useSwap";

function makeSwap(): UseSwapReturn {
  return {
    state: {
      sellToken: BASE_MAINNET_TOKENS.find((t) => t.address === "native")!,
      buyToken: BASE_MAINNET_TOKENS.find((t) => t.symbol === "SD")!,
      sellAmount: "0.01",
      buyAmount: "43089871.174776702040638151",
      slippage: 0.5,
      isQuoteLoading: false,
    },
    balances: { sell: undefined, buy: undefined },
    approval: { needed: false, isApproving: false, approve: vi.fn() },
    swap: { canSwap: true, isSwapping: false, execute: vi.fn() },
    actions: {
      setSellAmount: vi.fn(),
      setBuyAmount: vi.fn(),
      setSellToken: vi.fn(),
      setBuyToken: vi.fn(),
      setSlippage: vi.fn(),
      reverseTokens: vi.fn(),
      setPreferredVenue: vi.fn(),
      setMaxSellAmount: vi.fn(),
    },
    quote: {
      id: "reviewed-quote",
      rate: 4308987117.47767,
      minimumReceived: 42874421.8189,
      priceImpact: 94.7875,
      status: "SUCCESS",
      bestVenue: "Uniswap V2",
      uniswapAmountOut: "43089871.174776702040638151",
      refresh: vi.fn(),
      isRefreshing: false,
    },
  };
}

const props = { tokens: BASE_MAINNET_TOKENS, showSettings: false, onSettingsChange: vi.fn() };

describe("Swap impact review", () => {
  it("warns before opening the wallet and requires a separate confirmation", () => {
    const swap = makeSwap();
    render(<SwapCard {...props} swap={swap} />);
    expect(screen.getByRole("alert")).toHaveTextContent("94.79%");
    expect(screen.getByLabelText("Amount to receive")).toHaveValue("43,089,871.17");
    fireEvent.click(screen.getByRole("button", { name: "Review high-impact swap" }));
    expect(swap.swap.execute).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Confirm high price impact" });
    expect(dialog).toHaveTextContent("0.01 ETH");
    expect(dialog).toHaveTextContent("Slippage tolerance does not protect");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "I understand — continue to wallet" })
    );
    expect(swap.swap.execute).toHaveBeenCalledExactlyOnceWith("reviewed-quote");
  });

  it("disables an open confirmation when the quote changes", () => {
    const swap = makeSwap();
    const { rerender } = render(<SwapCard {...props} swap={swap} />);
    fireEvent.click(screen.getByRole("button", { name: "Review high-impact swap" }));
    rerender(<SwapCard {...props} swap={{ ...swap, quote: { ...swap.quote, id: "new-quote" } }} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("changed or expired");
    expect(
      within(dialog).getByRole("button", { name: "I understand — continue to wallet" })
    ).toBeDisabled();
    expect(swap.swap.execute).not.toHaveBeenCalled();
  });

  it("lets the user cancel without submitting anything", () => {
    const swap = makeSwap();
    render(<SwapCard {...props} swap={swap} />);
    fireEvent.click(screen.getByRole("button", { name: "Review high-impact swap" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(swap.swap.execute).not.toHaveBeenCalled();
  });

  it("offers refresh and disables the swap when impact is unavailable", () => {
    const swap = makeSwap();
    swap.quote.priceImpact = null;
    swap.swap.canSwap = false;
    render(<SwapCard {...props} swap={swap} />);
    expect(screen.getByRole("button", { name: "Impact unavailable" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh quote" }));
    expect(swap.quote.refresh).toHaveBeenCalledOnce();
  });

  it("uses the actual trade, includes V3 and highlights the selected venue", () => {
    const swap = makeSwap();
    const { rerender } = render(<PriceChart swap={swap} />);
    expect(screen.getByText("0.01 ETH → SD")).toBeInTheDocument();
    expect(screen.getByText("Uniswap V3")).toBeInTheDocument();
    expect(screen.getByText("Best quoted output").closest("button")).toHaveTextContent(
      "Uniswap V2"
    );
    expect(screen.getByText("43,089,871.17 SD")).toBeInTheDocument();
    expect(screen.queryByText(/USDT/)).not.toBeInTheDocument();
    rerender(
      <PriceChart
        swap={{
          ...swap,
          state: {
            ...swap.state,
            sellAmount: "2",
            buyToken: BASE_MAINNET_TOKENS.find((t) => t.symbol === "USDC")!,
          },
          quote: { ...swap.quote, status: "LOADING" },
        }}
      />
    );
    expect(screen.getByText("2 ETH → USDC")).toBeInTheDocument();
    expect(screen.queryByText("Best quoted output")).not.toBeInTheDocument();
    expect(screen.queryByText("43,089,871.17 SD")).not.toBeInTheDocument();
  });

  it("picks a venue from its quote card and clears the pick from the same card", () => {
    const swap = makeSwap();
    const { rerender } = render(<PriceChart swap={swap} />);
    expect(screen.queryByRole("button", { name: "Use best price" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PancakeSwap V3/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Uniswap V2/ }));
    expect(swap.actions.setPreferredVenue).toHaveBeenCalledExactlyOnceWith("Uniswap V2");

    rerender(
      <PriceChart swap={{ ...swap, quote: { ...swap.quote, preferredVenue: "Uniswap V2" } }} />
    );
    expect(screen.getByRole("button", { name: /Uniswap V2/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Your route")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Uniswap V2/ }));
    expect(swap.actions.setPreferredVenue).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Use best price" }));
    expect(swap.actions.setPreferredVenue).toHaveBeenLastCalledWith(null);
  });

  it("keeps other venues' quotes visible when the picked venue has no route", () => {
    const swap = makeSwap();
    render(
      <PriceChart
        swap={{
          ...swap,
          quote: { ...swap.quote, status: "NO_ROUTE", preferredVenue: "BaseSwap" },
        }}
      />
    );
    expect(screen.getByText("43,089,871.17 SD")).toBeInTheDocument();
    expect(screen.getByText("Best quoted output").closest("button")).toHaveTextContent(
      "Uniswap V2"
    );
    expect(screen.getByRole("button", { name: /BaseSwap/ })).toBeEnabled();
  });

  it("offers a one-tap way out when the picked venue has no route", () => {
    const swap = makeSwap();
    swap.swap.canSwap = false;
    render(
      <SwapCard
        {...props}
        swap={{
          ...swap,
          quote: {
            ...swap.quote,
            status: "NO_ROUTE",
            priceImpact: 0,
            preferredVenue: "BaseSwap",
            routedVenues: ["Uniswap V2"],
          },
        }}
      />
    );
    expect(screen.getByRole("button", { name: "No route on BaseSwap" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Switch to best price" }));
    expect(swap.actions.setPreferredVenue).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("shows the route choice and warns when a pick gives up 1% or more", () => {
    const swap = makeSwap();
    render(
      <SwapCard
        {...props}
        swap={{
          ...swap,
          quote: {
            ...swap.quote,
            preferredVenue: "BaseSwap",
            venueShortfallPercent: 1.5,
            comparisonText: "You chose BaseSwap: 1.50% fewer tokens than Uniswap V2.",
          },
        }}
      />
    );
    expect(screen.getByRole("combobox", { name: "Route" })).toHaveTextContent("BaseSwap");
    expect(screen.getByText(/1\.50% fewer tokens/)).toHaveClass("text-orange-700");
  });
});
