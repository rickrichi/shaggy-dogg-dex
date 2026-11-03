import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchIndicativePrices } from "./usePortfolio";

const SD = "0x051c758521971f5c5a84edaf18eea12854375469";

function stubPrices(prices: unknown[]) {
  const fetchMock = vi.fn(async () =>
    Response.json({ success: true, data: { prices, unpriced: [], failed: [] } })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchIndicativePrices", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns only thin-pool rows, asking with includeThin", async () => {
    const fetchMock = stubPrices([
      { address: `0x${"0".repeat(40)}`, priceUsd: 2256, change24hPercent: 0, symbol: "ETH" },
      {
        address: SD,
        priceUsd: 0.00000226,
        change24hPercent: 0,
        indicative: true,
        liquidityUsd: 4.51,
      },
    ]);

    const quotes = await fetchIndicativePrices(8453, [SD]);

    expect([...quotes.entries()]).toEqual([[SD, { priceUsd: 0.00000226, liquidityUsd: 4.51 }]]);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toMatchObject({ includeThin: true });
  });

  it("makes no request when nothing needs a price", async () => {
    const fetchMock = stubPrices([]);
    expect((await fetchIndicativePrices(8453, [])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves tokens unpriced when the lookup fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      })
    );
    expect((await fetchIndicativePrices(8453, [SD])).size).toBe(0);
  });
});
