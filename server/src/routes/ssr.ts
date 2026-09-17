// server/src/routes/ssr.ts
import { env } from '../env.js'

import type { Hono } from 'hono'

// Lazy import to avoid pulling React modules during cold start when unused
async function renderApp(url: string): Promise<string> {
  try {
    // Keep this indirect so the API's declaration build does not pull the
    // separate front-end source tree into the server TypeScript project.
    const entryModule = '../../../src/entry-server.tsx'
    const mod = await import(entryModule)
    if (typeof mod.render !== 'function') {
      throw new Error('entry-server render() missing')
    }
    const { html } = await mod.render(url, { fetch: globalThis.fetch })
    return html
  } catch (error) {
    console.error('[SSR] render failed:', error)
    throw error
  }
}

function buildHtml(body: string): string {
  const clientEntry = env.SSR_CLIENT_ENTRY;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>Shaggy DEX</title>',
    '</head>',
    '<body>',
    `<div id="root">${body}</div>`,
    `<script type="module" src="${clientEntry}"></script>`,
    '</body>',
    '</html>',
  ].join('')
}

export function mountSsr(app: Hono) {
  // Catch-all after API routes to serve the React app via SSR
  app.get('/*', async (c) => {
    // Avoid hijacking API or static assets that matched earlier routes
    const url = new URL(c.req.url)
    if (url.pathname.startsWith('/api')) {
      return c.text('Not Found', 404)
    }

    try {
      const html = await renderApp(url.pathname + url.search)
      return c.newResponse(buildHtml(html), 200, {
        'content-type': 'text/html; charset=utf-8',
      })
    } catch {
      return c.text('SSR rendering failed', 500)
    }
  })
}
