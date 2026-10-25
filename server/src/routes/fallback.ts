// server/src/routes/fallback.ts
import type { Hono } from 'hono'

export interface FallbackOptions {
  production: boolean
  /** Where the web app lives (Vite in development, the public site in production). */
  origin: string
}

// Catch-all after the API routes. The web app is served elsewhere (Vercel in production, Vite in
// development), so this server only says what it is at "/" and answers 404 for anything else.
export function mountFallback(app: Hono, { production, origin }: FallbackOptions) {
  app.get('/*', (c) => {
    const url = new URL(c.req.url)
    if (url.pathname.startsWith('/api')) {
      return c.json({ ok: false, reason: 'not_found' }, 404)
    }
    if (!production) {
      return c.redirect(`${origin}${url.pathname}${url.search}`, 302)
    }
    if (url.pathname === '/') {
      return c.json({ ok: true, service: 'Shaggy Dogg API', app: origin })
    }
    return c.json({ ok: false, reason: 'not_found' }, 404)
  })
}
