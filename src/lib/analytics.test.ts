import { beforeEach, describe, expect, it, vi } from "vitest";

import { analytics, flushAnalyticsQueueWith } from "./analytics";

describe("analytics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    analytics.reset();
  });

  it("exports a ready singleton", () => {
    expect(analytics).toBeDefined();
    expect(analytics.track).toEqual(expect.any(Function));
    expect(analytics.identify).toEqual(expect.any(Function));
  });

  it("tracks without throwing when providers are absent", () => {
    expect(() => analytics.track("page_view", { path: "/swap" })).not.toThrow();
  });

  it("accepts and clears user identity", () => {
    expect(() => {
      analytics.identify("0x1234567890123456789012345678901234567890", { chain_id: 1 });
      analytics.reset();
    }).not.toThrow();
  });

  it("supports consent changes", () => {
    analytics.setConsent(false);
    expect(() => analytics.track("wallet_connected", { chain_id: 1 })).not.toThrow();
    analytics.setConsent(true);
  });

  it("flushes a queued backend event with an injected fetcher", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await flushAnalyticsQueueWith(fetcher);
    expect(fetcher).toEqual(expect.any(Function));
  });
});
