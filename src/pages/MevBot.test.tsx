import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ARB_SUMMARY_PATH, type ArbSummary, fmtSigned } from "./MevArb";
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

const arb = (): ArbSummary => ({
  version: 1,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  chains: [
    {
      chain: "base",
      mode: "shadow",
      lastBlock: "53816557",
      lastBlockAt: new Date().toISOString(),
      blocksProcessed: 51,
      blocksSkipped: 0,
      venues: { v2: 5, v3: 20, v4: 20 },
      totals: {
        candidates: 102,
        simulated: 6,
        profitableBeforeGas: 1,
        worthSending: 0,
        submissions: 0,
        landed: 0,
        errors: 0,
        rateLimited: 0,
      },
      best: null,
      spreads: [
        {
          pair: "cbBTC/USDC",
          venues: [
            { label: "v3 0.01%", price: 101000, feeBps: 1 },
            { label: "v4 0.01%", price: 101100, feeBps: 1 },
          ],
          bestEdgeBps: 11.68,
          buy: "v4 0.01%",
          sell: "v3 0.01%",
        },
      ],
      recent: [
        {
          t: new Date().toISOString(),
          block: "53816310",
          pair: "cbBTC/USDC",
          buy: "v4 0.01%",
          sell: "v3 0.01%",
          edgeBps: 11.68,
          amountIn: 20,
          quote: "USDC",
          profitQuote: -1.5,
          profitEth: -0.00068,
          gasEth: 0.0000026,
          netEth: -0.00068,
          decision: "no profit at any size",
        },
      ],
      submissions: [],
    },
  ],
});

/** Answers each summary URL with its own body. */
const byUrl = (
  mev: () => Response,
  arbRes: () => Response = () => new Response(JSON.stringify(arb()))
) => vi.fn((url: string) => Promise.resolve(url === ARB_SUMMARY_PATH ? arbRes() : mev()));

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
    const fetchMock = byUrl(() => new Response(JSON.stringify(summary())));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Running")).toBeTruthy();
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain(MEV_SUMMARY_PATH);
    expect(screen.getByText("Shadow — watches, never trades")).toBeTruthy();
    expect(screen.getByText("88,476")).toBeTruthy();
    expect(screen.getByText("WETH→wstETH")).toBeTruthy();
    expect(screen.getByText("WETH→USDC")).toBeTruthy();
  });

  it("shows oracle-update backrun counts when the bot reports them, and hides the card otherwise", async () => {
    const oracle = {
      hints: 120,
      unreplayable: 3,
      aaveUpdates: 14,
      positionsPushedUnder: 5,
      opportunities: 4,
      viable: 1,
      simFailed: 1,
      submissions: 0,
      competitorTargets: 2,
    };
    vi.stubGlobal(
      "fetch",
      byUrl(() => new Response(JSON.stringify(summary({ oracle }))))
    );
    renderPage();
    expect(
      await screen.findByText("Oracle-update backruns (Chainlink SVR via MEV-Share)")
    ).toBeTruthy();
    expect(screen.getByText(/120 oracle updates seen since restart/)).toBeTruthy();
    expect(screen.getByText(/5 borrowers pushed under 1/)).toBeTruthy();
    expect(screen.getByText("1 worth sending")).toBeTruthy();
    expect(screen.getByText(/2 liquidations by other bots/)).toBeTruthy();
  });

  it("omits the oracle card for bot builds that do not report it", async () => {
    vi.stubGlobal(
      "fetch",
      byUrl(() => new Response(JSON.stringify(summary())))
    );
    renderPage();
    expect(await screen.findByText("Running")).toBeTruthy();
    expect(screen.queryByText(/Oracle-update backruns/)).toBeNull();
  });

  it("flags a bot that stopped reporting blocks", async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      byUrl(() => new Response(JSON.stringify(summary({ lastBlockAt: old }))))
    );
    renderPage();
    expect(await screen.findByText("Not responding")).toBeTruthy();
  });

  it("explains when the server is down", async () => {
    vi.stubGlobal(
      "fetch",
      byUrl(() => new Response("", { status: 502 }))
    );
    renderPage();
    expect(await screen.findByText(/HTTP 502/)).toBeTruthy();
  });

  it("shows the Uniswap arbitrage scanner per chain", async () => {
    vi.stubGlobal(
      "fetch",
      byUrl(() => new Response(JSON.stringify(summary())))
    );
    renderPage();
    expect(await screen.findByText("Shadow — simulates, never sends")).toBeTruthy();
    expect(screen.getByText("Base")).toBeTruthy();
    expect(screen.getAllByText("cbBTC/USDC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("11.68 bp").length).toBeGreaterThan(0);
    expect(screen.getByText("no profit at any size")).toBeTruthy();
    expect(screen.getByText(/samples the newest available state/)).toBeTruthy();
    expect(screen.getByText(/state snapshots checked/)).toBeTruthy();
  });

  it("formats signed amounts", () => {
    expect(fmtSigned(-1.5, "USDC")).toBe("−1.5000 USDC");
    expect(fmtSigned(0.00000123, "ETH")).toBe("0.00000123 ETH");
  });
});

describe("MEV-Share backrun card", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows hint counts and priced backruns when the scanner reports them", async () => {
    const withBackrun: ArbSummary = {
      ...arb(),
      backrun: {
        chain: "ethereum",
        mode: "shadow",
        connected: true,
        lastEventAt: new Date().toISOString(),
        totals: {
          events: 2888,
          swapHints: 29,
          withSwapData: 20,
          poolOnly: 9,
          poolOnlyLanded: 4,
          poolOnlySimulated: 1,
          blindWorthSending: 0,
          skippedBusy: 2,
          simulated: 2,
          profitableBeforeGas: 2,
          worthSending: 0,
          bundlesSent: 0,
          landed: 0,
          errors: 0,
          rateLimited: 0,
        },
        best: null,
        recent: [
          {
            t: new Date().toISOString(),
            block: "26362660",
            pair: "WETH/USDC",
            swapVenue: "v3 0.01%",
            buy: "v3 0.01%",
            sell: "v4 0.01%",
            edgeBps: 3.9,
            amountIn: 235.75,
            quote: "USDC",
            profitQuote: 0.042103,
            profitEth: 0.0000188,
            gasEth: 0.0000242,
            bribeEth: 0,
            netEth: -0.0000055,
            decision: "profit does not cover gas",
            poolOnly: {
              tx: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
              blindAmountIn: 100,
              blindProfitQuote: 0.025,
              blindNetEth: -0.000012,
              blindDecision: "profit does not cover gas",
            },
          },
        ],
        submissions: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      byUrl(
        () => new Response(JSON.stringify(summary())),
        () => new Response(JSON.stringify(withBackrun))
      )
    );
    renderPage();
    expect(await screen.findByText("Ethereum backruns (Flashbots MEV-Share)")).toBeTruthy();
    expect(screen.getByText("Listening")).toBeTruthy();
    expect(screen.getByText(/2,888 hints seen/)).toBeTruthy();
    expect(screen.getByText(/4 matched after landing, 1 priced/)).toBeTruthy();
    expect(screen.getByText("User swapped on")).toBeTruthy();
    expect(screen.getByText("v3 0.01% → v4 0.01%")).toBeTruthy();
    expect(screen.getByText(/blind:/)).toBeTruthy();
  });

  it("shows pending outcomes, restart-orphaned bundles and per-stage latency", async () => {
    const funnel = {
      attempts: 6,
      accepted: 4,
      rejected: 2,
      notIncluded: 3,
      reverted: 0,
      landed: 0,
      realizedProfitQuote: 0,
      realizedLossWei: "0",
    };
    const pct = (p50: number, p95: number) => ({ p50, p95 });
    const withStages: ArbSummary = {
      ...arb(),
      backrun: {
        chain: "ethereum",
        mode: "live",
        connected: true,
        lastEventAt: new Date().toISOString(),
        totals: {
          events: 10,
          swapHints: 1,
          withSwapData: 0,
          poolOnly: 1,
          poolOnlyLanded: 0,
          poolOnlySimulated: 0,
          blindWorthSending: 0,
          skippedBusy: 0,
          simulated: 0,
          profitableBeforeGas: 0,
          worthSending: 0,
          bundlesSent: 4,
          landed: 0,
          errors: 0,
          rateLimited: 0,
        },
        execution: { ...funnel, pending: 1, unresolved: 2 },
        sessionExecution: { ...funnel, pending: 1 },
        latencyMs: {
          samples: 3,
          avgTotalMs: 900,
          p50TotalMs: 800,
          p95TotalMs: 1200,
          lastTotalMs: 800,
          avgSimMs: 0,
          avgSendMs: 800,
          send: { samples: 3, p50: 800, p95: 1200 },
          stages: {
            prepMs: pct(5, 9),
            simMs: pct(0, 0),
            signingMs: pct(1, 2),
            relayMs: pct(750, 1100),
            snapshotAgeMs: pct(4000, 11000),
            snapshotLagBlocks: pct(0, 1),
          },
          relayNetworkFailures: 2,
          eventLoopMs: { p50: 1, p99: 40, max: 90, at: new Date().toISOString() },
        },
        best: null,
        recent: [],
        submissions: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      byUrl(
        () => new Response(JSON.stringify(summary())),
        () => new Response(JSON.stringify(withStages))
      )
    );
    renderPage();
    expect(await screen.findByText(/1 awaiting outcome/)).toBeTruthy();
    expect(screen.getByText(/2 unresolved across restarts/)).toBeTruthy();
    expect(screen.getByText(/hint→relay 800 \/ 1200 ms/)).toBeTruthy();
    expect(screen.getByText(/0 \/ 1 blocks behind/)).toBeTruthy();
    expect(screen.getByText(/2 relay timeouts\/network failures/)).toBeTruthy();
    expect(screen.getByText(/event-loop delay p99 40 ms/)).toBeTruthy();
  });
});
