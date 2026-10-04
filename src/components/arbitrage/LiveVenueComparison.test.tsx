import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveVenueComparison } from "./LiveVenueComparison";

afterEach(() => vi.unstubAllGlobals());

const quote = {
  id: "bfec3556-5856-45ed-845e-696882eb877a",
  symbol: "ETH/USD",
  buyVenue: "kraken",
  sellVenue: "alpaca",
  executable: true,
  reasons: [],
  buyQty: 1,
  sellQty: 1,
  buyLimit: 100,
  sellLimit: 110,
  expiresAt: Date.now() + 60000,
};

describe("live pair confirmation", () => {
  it("does not submit on mount or preview; retries an ambiguous request with the same ID", async () => {
    const executeBodies: unknown[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/comparison")) return { ok: true, json: async () => ({ routes: [quote] }) };
      if (url.endsWith("/preview")) return { ok: true, json: async () => quote };
      if (url.endsWith("/execute")) {
        executeBodies.push(JSON.parse(String(init?.body)));
        throw new TypeError("Connection lost");
      }
      return { ok: true, json: async () => ({ executions: [] }) };
    });
    vi.stubGlobal("fetch", fetcher);
    render(<LiveVenueComparison symbol="ETH/USD" notional={100} onExecuted={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview live trade" }));
    const execute = await screen.findByRole("button", { name: "Execute live pair" });
    expect(executeBodies).toHaveLength(0);
    fireEvent.click(execute);
    fireEvent.click(await screen.findByRole("button", { name: "Retry same live request" }));
    await waitFor(() => expect(executeBodies).toHaveLength(2));
    expect(executeBodies[0]).toEqual(executeBodies[1]);
    expect(executeBodies[0]).toMatchObject({ confirmLive: true, previewId: quote.id });
  });

  it("disables preview for unavailable inventory or unprofitable routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("/comparison")
            ? {
                routes: [
                  {
                    ...quote,
                    executable: false,
                    reasons: ["Insufficient available USD on kraken"],
                  },
                ],
              }
            : { executions: [] },
      }))
    );
    render(<LiveVenueComparison symbol="ETH/USD" notional={100} onExecuted={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Preview live trade" })).toBeDisabled();
    expect(screen.getByText("Insufficient available USD on kraken")).toBeInTheDocument();
  });
});
