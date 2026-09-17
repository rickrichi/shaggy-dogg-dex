// src/entry-server.tsx
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

import { flushAnalyticsForRequest } from "./lib/analytics-ssr";
import App, { AppRoutes, Providers } from "./App";

import type { JSX } from "react";

interface RenderContext {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const SsrApp = ({ url }: { url: string }): JSX.Element => (
  <Providers>
    <StaticRouter location={url} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppRoutes />
    </StaticRouter>
  </Providers>
);

export async function render(url: string, ctx: RenderContext = {}): Promise<{ html: string }> {
  // Fallback to client App if StaticRouter is undesirable; keeping App import warms bundle.
  const html = renderToString(<SsrApp url={url} />);

  // Flush any queued analytics events with a request-scoped fetch if provided.
  await flushAnalyticsForRequest(ctx.fetch ?? globalThis.fetch);

  return { html };
}

export default App;
