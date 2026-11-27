import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { CeDeFiStudio } from "./CeDeFiStudio";

const stream = vi.hoisted(() => ({ isLive: false }));

vi.mock("wagmi", () => ({
  useGasPrice: () => ({ data: undefined }),
  useReadContract: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useLiveAccounts", () => ({
  useLiveAccounts: () => ({
    krakenAccount: null,
    alpacaAccount: null,
    connected: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCeFiArbStream", () => ({
  useCeFiArbStream: () => ({
    lagMs: 0,
    venues: [{ symbol: "ETH/USD", exchange: "kraken" }],
    opportunities: [],
    isLive: stream.isLive,
    refetchSnapshot: vi.fn(),
  }),
}));
vi.mock("./LiveVenueComparison", () => ({ LiveVenueComparison: () => null }));
vi.mock("./KrakenTriangleJournal", () => ({ KrakenTriangleJournal: () => null }));

beforeEach(() => {
  stream.isLive = false;
});

it("says a live stream has no quotes for an unlisted pair instead of spinning forever", () => {
  stream.isLive = true;
  render(<CeDeFiStudio initialSymbol="DOGE/XYZ" />);
  expect(
    screen.getByText(/No exchange is streaming DOGE\/XYZ\. Choose one of the listed pairs\./)
  ).toBeVisible();
  expect(screen.queryByText("Connecting to exchange WebSockets...")).toBeNull();
});

it("keeps the connecting state until the stream is live", () => {
  render(<CeDeFiStudio initialSymbol="DOGE/XYZ" />);
  expect(screen.getByText("Connecting to exchange WebSockets...")).toBeVisible();
});
