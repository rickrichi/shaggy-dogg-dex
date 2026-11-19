import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ARB_SUMMARY_PATH, type ArbSummary, fmtSigned } from "./MevArb";
import MevBot, {
  fmtEth,
  fmtSettlement,
  LENDING_MONITORS,
  type LendingMonitorSummary,
  MEV_SUMMARY_PATH,
  type MevSummary,
  SPARK_SUMMARY_PATH,
} from "./MevBot";

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
    settlementSymbol: "USDC",
    settlementProfit: 0.0018,
    profitRaw: "1800",
    bribeEth: 0,
    lifecycle: "simulated",
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
  arbRes: () => Response = () => new Response(JSON.stringify(arb())),
  sparkRes: () => Response = () => new Response("{}", { status: 404 }),
  monitorRes: (url: string) => Response = () => new Response("{}", { status: 404 })
) =>
  vi.fn((url: string) =>
    Promise.resolve(
      url === ARB_SUMMARY_PATH
        ? arbRes()
        : url === SPARK_SUMMARY_PATH
          ? sparkRes()
          : LENDING_MONITORS.some((m) => m.path === url)
            ? monitorRes(url)
            : mev()
    )
  );

const monitorSummary = (over: Partial<LendingMonitorSummary> = {}): LendingMonitorSummary => ({
  protocol: "compound",
  mode: "shadow",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastBlock: "26449200",
  lastBlockAt: new Date().toISOString(),
  backfill: { from: "100", syncedTo: "26449200", target: "26449200", done: true },
  markets: 3,
  positions: 4321,
  hot: 12,
  liquidatableNow: 1,
  totals: { scans: 10, liquidatableSeen: 2, competitorLiquidations: 5, errors: 0, rateLimited: 0 },
  best: {
    t: new Date().toISOString(),
    block: "26449199",
    market: "cWETHv3",
    account: "0x1111111111111111111111111111111111111111",
    hf: 0.97,
    debt: 12.5,
    estBonus: 0.25,
    unit: "ETH",
    estBonusUsd: 450,
  },
  recent: [],
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
    expect(fmtSettlement(summary().best!)).toBe("0.0018 USDC");
    const { settlementProfit: _omitted, ...withoutSettlement } = summary().best!;
    expect(fmtSettlement(withoutSettlement)).toBe("—");
  });

  it("shows each lending monitor from its own endpoint, with backfill progress", async () => {
    const fetchMock = byUrl(
      () => new Response("{}", { status: 503 }),
      undefined,
      undefined,
      (url) =>
        new Response(
          JSON.stringify(
            url.includes("/morpho/")
              ? monitorSummary({
                  protocol: "morpho",
                  lastBlockAt: null,
                  backfill: { from: "0", syncedTo: "25", target: "100", done: false },
                })
              : monitorSummary()
          )
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Compound III liquidations")).toBeTruthy();
    expect(await screen.findByText("Indexing history 25%")).toBeTruthy();
    for (const m of LENDING_MONITORS)
      expect(fetchMock.mock.calls.map((c) => c[0])).toContain(m.path);
    expect(screen.getAllByText("4,321").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        /cWETHv3 · health 0.970 · debt 12.5 ETH · est. reward 0.25 ETH \(≈\$450\)/
      ).length
    ).toBeGreaterThan(0);
  });

  it("shows the SparkLend card from its own endpoint while it indexes borrowers", async () => {
    const fetchMock = byUrl(
      () => new Response("{}", { status: 503 }),
      undefined,
      () =>
        new Response(
          JSON.stringify(summary({ lastBlock: null, lastBlockAt: null, borrowersIndexed: 1234 }))
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Indexing borrowers")).toBeTruthy();
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain(SPARK_SUMMARY_PATH);
    expect(screen.getByText("SparkLend liquidations")).toBeTruthy();
    expect(screen.getByText("1,234")).toBeTruthy();
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
    expect(screen.getByText("Settlement profit")).toBeTruthy();
    expect(screen.getByText("0.0018 USDC")).toBeTruthy();
    expect(screen.getByText("Builder payment")).toBeTruthy();
    expect(screen.getByText("Projected net")).toBeTruthy();
    expect(screen.getByText("Simulated opportunity total")).toBeTruthy();
    expect(screen.getByText(/not earned, landed, or realized P&L/)).toBeTruthy();
    expect(screen.getAllByText("simulated").length).toBeGreaterThan(0);
  });

  it("renders settlement economics and lifecycle in the recent evidence ledger", async () => {
    const tx = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const row = {
      ...summary().best!,
      settlementSymbol: "USDC",
      settlementProfit: 23_795.357879,
      profitRaw: "23795357879",
      profitEth: 11.6463,
      gasEth: 0.0000439,
      bribeEth: 0.05,
      netEth: 11.5963,
      lifecycle: "realized" as const,
      realizedProfit: 23_700.125,
      realizedProfitEth: 11.6,
      tx,
      decision: "send",
    };
    const landed = {
      ...row,
      lifecycle: "landed" as const,
      realizedProfit: null,
      realizedProfitEth: null,
    };
    vi.stubGlobal(
      "fetch",
      byUrl(
        () =>
          new Response(
            JSON.stringify(
              summary({
                best: landed,
                recentOpportunities: [row],
                sumProfitEth: 99,
                simulatedOpportunityTotalEth: 11.6463,
              })
            )
          )
      )
    );
    renderPage();
    expect((await screen.findAllByText("23,795.357879 USDC")).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("0.0500 ETH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("11.5963 ETH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("landed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("realized").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23,700.125 USDC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("11.6000 ETH").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: /0xabcd/ })
        .every((link) => link.getAttribute("href") === `https://etherscan.io/tx/${tx}`)
    ).toBe(true);
    expect(screen.getAllByText("11.6463 ETH").length).toBeGreaterThan(0);
    expect(screen.queryByText("99.0000 ETH")).toBeNull();
    expect(screen.getAllByText("projected viable").length).toBeGreaterThan(0);
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

  it("shows what winning liquidators paid the builder", async () => {
    const stats = (txs: number, bonusEth: number, paidEth: number, median: number) => ({
      txs,
      bonusEth,
      paidEth,
      shareP25: median - 0.05,
      shareMedian: median,
      shareP75: median + 0.05,
    });
    const winners = {
      oracleBackruns: stats(11, 49.52, 48.96, 0.988),
      other: stats(8, 0.3367, 0.257, 0.743),
      recent: [
        {
          t: new Date().toISOString(),
          block: "26385480",
          tx: "0xc5d9552baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          liquidator: "0xCDB5681700000000000000000000000000000000",
          pairs: ["wstETH→USDT", "WETH→USDC"],
          bonusEth: 32.57,
          paidEth: 32.17,
          share: 0.988,
          afterOracleUpdate: true,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      byUrl(() => new Response(JSON.stringify(summary({ winners }))))
    );
    renderPage();
    expect(await screen.findByText("What winning liquidators paid")).toBeTruthy();
    expect(screen.getByText(/11 transactions/)).toBeTruthy();
    expect(screen.getByText(/median 98.8%/)).toBeTruthy();
    expect(screen.getByText("wstETH→USDT, WETH→USDC")).toBeTruthy();
    expect(screen.getByText("32.5700 ETH")).toBeTruthy();
    expect(screen.getByText("Oracle backrun?")).toBeTruthy();
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

  it("does not link private transactions that were never included", async () => {
    const data = arb();
    const chain = data.chains[0]!;
    chain.submissions = [
      {
        t: new Date().toISOString(),
        block: "53816558",
        pair: "WETH/USDC",
        tx: "0xd877af273f4e37c9b801b89252c8aa95bd3b50e050d827b317945ce9936293d9",
        quote: "USDC",
        profitQuote: 0,
        status: "not included",
      },
    ];
    chain.sessionTotals = { ...chain.totals, errors: 1, rateLimited: 0 };
    vi.stubGlobal(
      "fetch",
      byUrl(
        () => new Response(JSON.stringify(summary())),
        () => new Response(JSON.stringify(data))
      )
    );
    renderPage();
    expect(await screen.findByText(/Private submissions marked not included/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /0xd877af27/ })).toBeNull();
    expect(screen.getByTitle(/Private transaction hash/)).toHaveTextContent("0xd877af27…");
    expect(screen.getByText(/this session: 1 errors \(0 RPC rate limits\)/)).toBeTruthy();
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
        tier3: {
          shadowEnabled: true,
          authorityEnabled: true,
          modelVersion: "experimental-bid-v2",
          halted: false,
          haltReason: null,
          control: { resolved: 19, landed: 3, landingRate: 3 / 19 },
          experiment: { resolved: 1, landed: 0, landingRate: 0 },
          totals: {
            proposals: 20,
            insufficientEvidence: 20,
            assignedExperiment: 1,
            appliedExperiment: 0,
          },
          last: {
            pair: "WETH/USDC",
            assignedGroup: "experiment",
            appliedGroup: "control",
            proposalStatus: "insufficient-evidence",
            sharePpm: null,
            expectedNetWei: null,
          },
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
    expect(screen.getByText("Tier 3 bid experiment")).toBeTruthy();
    expect(screen.getByText("5% authority")).toBeTruthy();
    expect(screen.getByText(/1 assigned to 5% cohort/)).toBeTruthy();
    expect(screen.getByText(/experiment → control/)).toBeTruthy();
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
        missAudit: {
          total: 5,
          outcomes: {
            competitor_backran: 2,
            would_have_succeeded: 1,
            user_swap_not_landed: 1,
            inconclusive: 1,
          },
          retries: 3,
          errors: 4,
          queueDropped: 1,
        },
        sessionMissAudit: {
          total: 2,
          outcomes: { competitor_backran: 1, would_have_succeeded: 1 },
          retries: 1,
          errors: 1,
          queueDropped: 0,
        },
        orderFlow: {
          mevblocker: {
            connected: true,
            lastEventAt: null,
            lastError: null,
            txs: 40,
            traced: 30,
            traceErrors: 0,
            droppedBusy: 2,
            withSwaps: 9,
            noRoute: 4,
            priced: 12,
            worthSending: 1,
            bestNetEth: 0.0042,
          },
        },
        competitorLosses: [
          {
            t: "2026-11-18T14:44:13Z",
            hash: "0x39d5",
            pair: "LINK/USDC",
            block: "26442616",
            builder: null,
            userTx: null,
            userIndex: 157,
            competitor: {
              tx: "0x08e635dbd0ecada455fb",
              from: null,
              to: null,
              index: 158,
              priorityFeeWei: "0",
              coinbaseTransferWei: "3000000000000000",
              pools: ["v4 0.3%"],
            },
            ourBidWei: "1000000000000000",
            ourNetEth: 0.0072,
            sendLagMs: 1756,
          },
        ],
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
    expect(screen.getByText(/Accepted-bundle outcome audit: current session 2/)).toBeTruthy();
    expect(screen.getByText(/1 still profitable; builder\/bid lost/)).toBeTruthy();
    expect(screen.getByText(/Lifetime 5/)).toBeTruthy();
    expect(screen.getByText(/1 inconclusive after audit failures/)).toBeTruthy();
    expect(
      screen.getByText(/Reliability: current session 1 retries · 1 RPC errors · 0 queue drops/)
    ).toBeTruthy();
    expect(screen.getByText(/lifetime 3 retries · 4 RPC errors · 1 queue drops/)).toBeTruthy();
    expect(screen.getByText(/Lost to competitors/)).toBeTruthy();
    expect(screen.getByText(/MEV Blocker feed/)).toBeTruthy();
    expect(
      screen.getByText(/9 moved our pools \(4 opened no price gap\) · 12 routes/)
    ).toBeTruthy();
    expect(screen.getByText(/best net 0.0042 ETH · 2 skipped \(busy\)/)).toBeTruthy();
    expect(screen.getByText(/paid 0.0030 ETH to the builder · we bid 0.0010 ETH/)).toBeTruthy();
    expect(screen.getByText(/we sent 1.76 s after the block started \(too late\)/)).toBeTruthy();
  });
});
