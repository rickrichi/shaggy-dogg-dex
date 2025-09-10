import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { withCors, withSecurityHeaders } from './middleware/security.js';
import { logRequests } from './middleware/log.js';
import { rateLimit } from './middleware/rateLimit.js';
import { normalizeIp } from './utils/ip.js';
import { mountHealth } from './routes/health.js';
import { mountPriceRoutes } from './routes/prices.js';
import { mountSupabaseDbWebhook } from './routes/webhooks/supabase_db.js';

const app = new Hono();

// global middleware
app.use('*', logRequests);
app.use('*', withSecurityHeaders);
app.use('*', withCors(env.ORIGIN));
app.use('/api/*', rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  identify: (ip) => `api:${normalizeIp(ip)}`
}));

// routes
mountHealth(app);
mountPriceRoutes(app);
mountSupabaseDbWebhook(app);

// start (Node adapter keeps the process alive)
serve({ fetch: app.fetch, port: env.PORT });
// eslint-disable-next-line no-console
console.log(`api listening on http://localhost:${env.PORT}`);
