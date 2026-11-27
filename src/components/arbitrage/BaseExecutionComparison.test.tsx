import { MemoryRouter } from "react-router-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { BaseExecutionComparison } from "./BaseExecutionComparison";

vi.mock("wagmi", () => ({ usePublicClient: () => ({}) }));
vi.mock("@/lib/amm/smart-routing", async (original) => ({
  ...(await original<typeof import("@/lib/amm/smart-routing")>()),
  quoteSmartRoutes: async () => ({
    quotes: [{ route: { venue: "Uniswap V2" }, output: 1000000000000000000n }],
    excluded: [{ route: { venue: "Aerodrome" }, output: 1000n }],
    blockNumber: 123n,
    observedAt: Date.now(),
  }),
}));

it("distinguishes admitted quotes, filtered quotes, and missing quotes", async () => {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <BaseExecutionComparison notional={42} />
      </QueryClientProvider>
    </MemoryRouter>
  );
  expect(await screen.findByText("Uniswap V2: 1 WETH")).toBeVisible();
  expect(
    screen.getByText("Aerodrome: Quote excluded by the cross-venue price check")
  ).toBeVisible();
  expect(screen.getByText("Uniswap V3: No quote available")).toBeVisible();
});
