// server/src/routes/launches.ts
// Launch tracking for the launchpad demand test. The client reports its deployment transaction;
// the server records it only after verifying on Base that it deployed the launchpad template.

import { zValidator } from '@hono/zod-validator'
import { type Hash, TransactionNotFoundError, TransactionReceiptNotFoundError } from 'viem'
import { z } from 'zod'

import { LaunchVerificationError, type LaunchChainReader, verifyLaunch } from '../launches/verify.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { normalizeIp } from '../utils/ip.js'

import type { Context, Hono } from 'hono'
import type { LaunchRepository } from '../launches/store.js'

export interface LaunchRouteOptions {
  store: LaunchRepository
  client: LaunchChainReader
  /** Reports per IP per minute. */
  reportRateLimitPerMinute?: number
}

const ReportInput = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid transaction hash') })
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })

/** The store (e.g. a paused Supabase project) is down: say so instead of failing as a 500. */
function storeUnavailable(c: Context, error: unknown) {
  console.error('Launch store unavailable:', error)
  return c.json({ ok: false, reason: 'store_unavailable' }, 503)
}

export function mountLaunchRoutes(app: Hono, options: LaunchRouteOptions) {
  const { store, client } = options

  app.post(
    '/api/launches',
    rateLimit({
      windowMs: 60_000,
      max: options.reportRateLimitPerMinute ?? 10,
      identify: (ip) => `launches:${normalizeIp(ip)}`,
    }),
    zValidator('json', ReportInput),
    async (c) => {
      const txHash = c.req.valid('json').txHash.toLowerCase() as Hash
      let existing
      try {
        existing = await store.get(txHash)
      } catch (error) {
        return storeUnavailable(c, error)
      }
      if (existing) return c.json({ ok: true, launch: existing })
      let verified
      try {
        verified = await verifyLaunch(client, txHash)
      } catch (error) {
        if (error instanceof LaunchVerificationError) {
          return c.json({ ok: false, reason: error.reason }, 422)
        }
        if (error instanceof TransactionNotFoundError || error instanceof TransactionReceiptNotFoundError) {
          return c.json({ ok: false, reason: 'not_found' }, 404)
        }
        console.error('Launch verification failed:', error)
        return c.json({ ok: false, reason: 'chain_unavailable' }, 502)
      }
      try {
        return c.json({ ok: true, launch: await store.record(verified) }, 201)
      } catch (error) {
        return storeUnavailable(c, error)
      }
    },
  )

  app.get('/api/launches', zValidator('query', ListQuery), async (c) => {
    try {
      return c.json({ ok: true, launches: await store.list(c.req.valid('query').limit) })
    } catch (error) {
      return storeUnavailable(c, error)
    }
  })

  app.get('/api/launches/stats', async (c) => {
    let months
    try {
      months = await store.monthly()
    } catch (error) {
      return storeUnavailable(c, error)
    }
    return c.json({
      ok: true,
      total: months.reduce((sum, m) => sum + m.launches, 0),
      months,
      note: 'Verified on-chain launchpad deployments reported by the launchpad. Creators counts wallets, not people.',
    })
  })
}
