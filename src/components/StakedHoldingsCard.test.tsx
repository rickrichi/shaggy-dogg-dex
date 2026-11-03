import { MemoryRouter } from "react-router-dom";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StakedHoldingsCard } from "./StakedHoldingsCard";

const PROJECT = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const MRWD = "0xC17227AAa33C54634B6cE7AD0bf33A156563c179";

const mocks = vi.hoisted(() => ({ portfolio: {} as Record<string, unknown> }));
vi.mock("@/hooks/useStakedPortfolio", () => ({ useStakedPortfolio: () => mocks.portfolio }));

const card = (address: `0x${string}`) =>
  render(
    <MemoryRouter>
      <StakedHoldingsCard address={address} />
    </MemoryRouter>
  );

describe("StakedHoldingsCard", () => {
  beforeEach(() => {
    mocks.portfolio = {
      data: {
        positions: [],
        incomplete: false,
        tokens: [{ address: MRWD, symbol: "MRWD", name: "Mutt Rewards", sources: ["LP staked ×4"] }],
      },
      isPending: false,
      isFetching: false,
      isError: false,
    };
  });

  it("shows staked tokens and the project wallet's tokens, once each", () => {
    card(PROJECT);
    expect(screen.getByText("EQX")).toBeTruthy();
    expect(screen.getAllByText("MRWD")).toHaveLength(1);
    expect(screen.getByText("LP staked ×4")).toBeTruthy();
  });

  it("does not claim project tokens for another wallet", () => {
    card(OTHER);
    expect(screen.queryByText("EQX")).toBeNull();
    expect(screen.getByText("MRWD")).toBeTruthy();
  });

  it("says when a wallet has nothing staked", () => {
    mocks.portfolio = {
      data: { positions: [], tokens: [], incomplete: false },
      isPending: false,
      isFetching: false,
      isError: false,
    };
    card(OTHER);
    expect(screen.getByText("No staked or project tokens for this wallet.")).toBeTruthy();
  });

  it("reports failed reads instead of implying an empty list", () => {
    mocks.portfolio = { isPending: false, isFetching: false, isError: true };
    card(OTHER);
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
  });
});
