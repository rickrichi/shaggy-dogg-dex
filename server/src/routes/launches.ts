// server/src/routes/launches.ts
// Launch tracking for the launchpad demand test. The client reports its deployment transaction;
// the server records it only after verifying on Base that it deployed the launchpad template.

import { zValidator } from '@hono/zod-validator'
import { type Hash, TransactionNotFoundError, TransactionReceiptNotFoundError } from 'viem'
import { z } from 'zod'

import { LaunchVerificationError, type LaunchChainReader, verifyLaunch } from '../launches/verify.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { normalizeIp } from '../utils/ip.js'

import type { Hono } from 'hono'
import type { LaunchStore } from '../launches/store.js'

export interface LaunchRouteOptions {
  store: LaunchStore
  client: LaunchChainReader
  /** Reports per IP per minute. */
  reportRateLimitPerMinute?: number
}

const ReportInput = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid transaction hash') })
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })

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
      const existing = store.get(txHash)
      if (existing) return c.json({ ok: true, launch: existing })
      try {
        const launch = store.record(await verifyLaunch(client, txHash))
        return c.json({ ok: true, launch }, 201)
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
    },
  )

  app.get('/api/launches', zValidator('query', ListQuery), (c) =>
    c.json({ ok: true, launches: store.list(c.req.valid('query').limit) }),
  )

  app.get('/api/launches/stats', (c) => {
    const months = store.monthly()
    return c.json({
      ok: true,
      total: months.reduce((sum, m) => sum + m.launches, 0),
      months,
      note: 'Verified on-chain launchpad deployments reported by the launchpad. Creators counts wallets, not people.',
    })
  })
}
