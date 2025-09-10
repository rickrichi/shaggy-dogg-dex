// server/src/index.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

import { env } from './env.js'
import { withCors, withSecurityHeaders } from './middleware/security.js'
import { rateLimit } from './middleware/rateLimit.js'
import { normalizeIp } from './utils/ip.js'

// Routes
import { mountPriceRoutes } from './routes/prices.js'
import { mountQuoteRoutes } from './routes/quote.js' // remove if you haven't added it yet
import { mountSupabaseDbWebhook } from './routes/webhooks/supabase_db.js'

const app = new Hono()

// ── Global hardening ───────────────────────────────────────────────────────────
app.use('*', withSecurityHeaders)
app.use('*', withCors(env.ORIGIN))

app.use(
  '/api/*',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    identify: (ip: string) => `api:${normalizeIp(ip)}`,
  })
)

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get('/health', (c) => c.text('ok'))

// ── API routes ────────────────────────────────────────────────────────────────
mountPriceRoutes(app)    // POST /api/prices
mountQuoteRoutes(app)    // POST /api/quote (comment out if not implemented)
mountSupabaseDbWebhook(app) // POST /webhooks/supabase-db

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.all('*', (c) => c.json({ error: 'not_found' } as const, 404))

// ── Boot (Node adapter keeps process alive) ───────────────────────────────────
serve({ fetch: app.fetch, port: env.PORT })
// eslint-disable-next-line no-console
console.log(`api listening on http://localhost:${env.PORT}`)
