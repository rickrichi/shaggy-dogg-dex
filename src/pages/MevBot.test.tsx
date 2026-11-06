import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MevBot, { fmtEth, MEV_SUMMARY_PATH, type MevSummary } from "./MevBot";

const summary = (over: Partial<MevSummary> = {}): MevSummary => ({
  version: 1,
  mode: "shadow",
  chain: "ethereum",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastBlock: "26353685",
  lastBlockAt: new Date().toISOString(),
  borrowersIndexed: 88476,
  hotAccounts: 381,
  blocksProcessed: 4,
  blocksSkipped: 0,
  totals: {
    opportunities: 36,
    viable: 0,
    simFailed: 37,
    submissions: 0,
    competitorLiquidations: 1,
    competitorSeenByUs: 1,
    errors: 27,
    rateLimited: 27,
  },
  best: {
    t: new Date().toISOString(),
    block: "26353114",
    user: "0x7206608Eee4a6f9f56686b07622720F2190FD546",
    hf: 0.9975,
    pair: "WETH→wstETH",
    funding: "morpho",
    profitEth: 8.8e-7,
    gasEth: 3.7e-5,
    netEth: null,
    decision: "profit does not cover gas",
  },
  sumProfitEth: 0,
  recentOpportunities: [],
  recentCompetitors: [
    {
      t: new Date().toISOString(),
      block: "26353700",
      tx: "0x294e6984aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      user: "0x2",
      liquidator: "0x1111111111111111111111111111111111111111",
      pair: "WETH→USDC",
      seenByUs: true,
    },
  ],
  decisions: {},
  ...over,
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MevBot />
    </QueryClientProvider>
  );

describe("MEV bot page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("formats dust without rounding it to zero", () => {
    expect(fmtEth(8.8e-7)).toBe("8.80e-7 ETH");
    expect(fmtEth(0.1234)).toBe("0.1234 ETH");
    expect(fmtEth(null)).toBe("—");
  });

  it("shows the live summary from the bot's endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(summary())));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Running")).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(MEV_SUMMARY_PATH);
    expect(screen.getByText("Shadow — watches, never trades")).toBeTruthy();
    expect(screen.getByText("88,476")).toBeTruthy();
    expect(screen.getByText("WETH→wstETH")).toBeTruthy();
    expect(screen.getByText("WETH→USDC")).toBeTruthy();
  });

  it("flags a bot that stopped reporting blocks", async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(summary({ lastBlockAt: old }))))
    );
    renderPage();
    expect(await screen.findByText("Not responding")).toBeTruthy();
  });

  it("explains when the server is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })));
    renderPage();
    expect(await screen.findByText(/HTTP 502/)).toBeTruthy();
  });
});
