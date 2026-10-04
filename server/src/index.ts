// server/src/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { corsActual } from './cors/actual.js'
// CORS
import { preflight } from './cors/preflight.js'
import { logRequests } from './middleware/log.js'
import { rateLimit } from './middleware/rateLimit.js'
import { withSecurityHeaders } from './middleware/security.js'
import { AdminStore } from './admin/store.js'
import { mountAdminRoutes } from './routes/admin.js'
import { mountCeDeFiRoutes } from './routes/cedefi.js'
// routes
import { mountHealth } from './routes/health.js'
import { mountPriceRoutes } from './routes/prices.js'
import { mountQuoteRoutes } from './routes/quotes.js'
import { mountSsr } from './routes/ssr.js'
import { mountSupabaseDbWebhook } from './routes/webhooks/supabase_db.js'
import { normalizeIp } from './utils/ip.js'
// env & middleware
import { env } from './env.js'

const app = new Hono()

// Helpful diagnostics
app.onError((err, c) => {
  console.error('UNHANDLED ERROR:', err)
  return c.text('Internal Server Error', 500)
})
app.notFound((c) => c.text('Not Found', 404))

// ----- Middleware order (top → bottom = run order) -----
// 1) request logging
app.use('*', logRequests)
// 2) preflight: short-circuits OPTIONS
app.use('*', preflight())
// 3) security headers
app.use('*', withSecurityHeaders)
// 4) CORS headers for non-OPTIONS
app.use('*', corsActual())

// ----- Test endpoint (for CORS verification) -----
app.get('/api/block', (c) => c.json({ ok: true, now: Date.now() }))

// ----- Health -----
mountHealth(app)

// ----- Prices with rate limiting -----
app.use(
  '/api/prices/*',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    identify: (ip) => `prices:${normalizeIp(ip)}`,
  }),
)
mountPriceRoutes(app) // paths at /api/prices/*

// ----- Quote Routes with rate limiting -----
app.use(
  '/api/quote',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    identify: (ip) => `quote:${normalizeIp(ip)}`,
  }),
)
mountQuoteRoutes(app) // POST /api/quote

// ----- CeDeFi Bridge Routes -----
mountCeDeFiRoutes(app) // GET /api/cedefi/status, GET /api/cedefi/quote

// ----- Admin panel (wallet sign-in, local SQLite) -----
mountAdminRoutes(app, {
  store: new AdminStore(env.ADMIN_DB_PATH),
  admins: env.ADMIN_WALLETS,
  origin: env.ORIGIN,
  sessionHours: env.ADMIN_SESSION_HOURS,
  secureCookie: env.NODE_ENV === 'production',
})
if (env.ADMIN_WALLETS.length === 0) {
  console.warn('Admin sign-in disabled: set ADMIN_WALLETS in server/.env')
}

// ----- Webhooks -----
mountSupabaseDbWebhook(app)

// ----- SSR catch-all (after API routes) -----
mountSsr(app)

// ----- Dev route listing (optional) -----
if (env.NODE_ENV !== 'production') {
  try {
    const { showRoutes } = await import('hono/dev')
    showRoutes(app)
  } catch (error) {
    console.warn('Dev route listing unavailable:', error instanceof Error ? error.message : error)
  }
}

// ----- Start server (single place) -----
const port = Number(env.PORT ?? process.env.PORT ?? 8788)
serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`)
})

export default app
