// server/src/routes/webhooks/supabase_db.ts
import { zValidator } from '@hono/zod-validator'

import { env } from '../../env.js'
import { type SupabaseDbWebhook,SupabaseDbWebhookSchema } from '../../schemas/webhooks.js'
import { constantTimeEqual } from '../../utils/hmac.js'

import type { Hono } from 'hono'

function verifySupabaseAuth(header: string | undefined, secret: string): boolean {
  if (!header) return false
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return false
  return constantTimeEqual(token, secret)
}

export function mountSupabaseDbWebhook(app: Hono): void {
  app.post(
    '/api/webhooks/supabase-db',
    // Validate JSON body up front; return 400 on failure
    zValidator('json', SupabaseDbWebhookSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'invalid_body' } as const, 400)
      }
      // satisfy noImplicitReturns
      return
    }),
    async (c) => {
      if (!env.SUPABASE_WEBHOOK_SECRET) {
        return c.json({ error: 'webhook_secret_unconfigured' } as const, 500)
      }

      if (!verifySupabaseAuth(c.req.header('authorization'), env.SUPABASE_WEBHOOK_SECRET)) {
        return c.json({ error: 'invalid_signature' } as const, 401)
      }

      const payload = c.req.valid('json') as SupabaseDbWebhook
      console.log(`[supabase-db] ${payload.type} ${(payload.schema ?? 'public')}.${payload.table}`)

      // TODO: handle INSERT/UPDATE/DELETE for your target tables

      // Fast ACK keeps Supabase happy and reduces retries
      return c.body(null, 204)
      // Or: return c.json({ ok: true } as const)
    }
  )
}
