import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type AuthoritySummary,
  LENDING_MONITORS,
  LendingMonitorCard,
  type LendingMonitorSummary,
  MevAuthorityCard,
} from "./MevBot";

const account = "0x1111111111111111111111111111111111111111";

function renderMonitor(
  key: string,
  backfill: LendingMonitorSummary["backfill"] = {
    from: "50",
    syncedTo: "100",
    target: "100",
    done: true,
  }
) {
  const monitor = LENDING_MONITORS.find((m) => m.path === `/api/mev/${key}/summary`)!;
  const now = new Date().toISOString();
  const summary: LendingMonitorSummary = {
    protocol: key,
    mode: "shadow",
    startedAt: now,
    updatedAt: now,
    lastBlock: "100",
    lastBlockAt: now,
    backfill,
    markets: 1,
    positions: 1,
    hot: 1,
    liquidatableNow: 1,
    totals: { scans: 1, liquidatableSeen: 1, competitorLiquidations: 0, errors: 0, rateLimited: 0 },
    best: null,
    recent: [
      {
        t: now,
        block: "100",
        market: "WETH",
        account,
        hf: 0.9,
        debt: 10,
        estBonus: 1,
        unit: "ETH",
      },
    ],
  };
  const authority: AuthoritySummary = {
    version: 1,
    startedAt: now,
    updatedAt: now,
    healthy: 1,
    total: 1,
    instances: [
      {
        name: key,
        kind: "monitor",
        state: "running",
        healthy: true,
        restarts: 0,
        lastError: null,
        summary,
      },
    ],
  };
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["lending-monitor", monitor.path], summary);
  client.setQueryData(["mev-authority"], authority);
  render(
    <QueryClientProvider client={client}>
      <MevAuthorityCard now={Date.now()} />
      <LendingMonitorCard {...monitor} now={Date.parse(now)} />
    </QueryClientProvider>
  );
}

describe("lending monitor evidence", () => {
  it.each([
    ["compound", "https://etherscan.io"],
    ["morpho", "https://etherscan.io"],
    ["euler", "https://etherscan.io"],
    ["aave-base", "https://basescan.org"],
    ["aave-arbitrum", "https://arbiscan.io"],
    ["aave-optimism", "https://optimistic.etherscan.io"],
    ["aave-polygon", "https://polygonscan.com"],
    ["aave-avalanche", "https://snowtrace.io"],
  ])("opens %s borrower evidence on the same chain", (key, explorer) => {
    renderMonitor(key);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`${explorer}/address/${account}`);
  });

  it.each([
    { syncedTo: "0", target: null, suffix: "" },
    { syncedTo: "45", target: "100", suffix: " 0%" },
    { syncedTo: "75", target: "100", suffix: " 50%" },
    { syncedTo: "105", target: "100", suffix: " 100%" },
  ])("shows consistent progress for $syncedTo of $target", ({ syncedTo, target, suffix }) => {
    renderMonitor("morpho", { from: "50", syncedTo, target, done: false });
    expect(screen.getByText(`indexing${suffix}`)).toBeTruthy();
    expect(screen.getByText(`Indexing history${suffix}`)).toBeTruthy();
  });
});
