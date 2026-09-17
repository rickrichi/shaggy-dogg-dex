// src/lib/analytics-ssr.ts
// SSR helper to flush queued analytics events using a provided fetcher.
import { flushAnalyticsQueueWith } from "./analytics";

/**
 * Flush analytics events during SSR after rendering has completed.
 * Call this near the end of your request handler with a request-scoped fetch.
 */
export async function flushAnalyticsForRequest(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = globalThis.fetch
): Promise<void> {
  if (typeof fetcher !== "function") return;
  await flushAnalyticsQueueWith(fetcher);
}
