// server/src/routes/admin.ts
// Admin panel API. Sign-in is Sign-In with Ethereum (EIP-4361) against an allowlist of admin
// wallets; no third-party identity provider. A successful sign-in sets an HttpOnly session cookie.

import { zValidator } from '@hono/zod-validator'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { type Hex, verifyMessage } from 'viem'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'
import { z } from 'zod'

import { type AdminStore, ConflictError } from '../admin/store.js'
import { normalizeOrigin } from '../cors/origins.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { normalizeIp } from '../utils/ip.js'

import type { Context, Hono, MiddlewareHandler } from 'hono'

export const ADMIN_COOKIE = 'sd_admin'
const NONCE_MAX_AGE_MS = 5 * 60_000

export interface AdminRouteOptions {
  store: AdminStore
  /** Lowercased allowlisted admin addresses. */
  admins: readonly string[]
  /** The app origin the user signs in from, e.g. http://localhost:5173 */
  origin: string
  sessionHours: number
  secureCookie: boolean
  /** Nonce + login requests per IP per minute. */
  authRateLimitPerMinute?: number
}

type AdminEnv = { Variables: { adminAddress: string } }

const SettingsInput = z.object({
  default_slippage_bps: z.number().int().min(0).max(10_000),
  max_gas_price_gwei: z.number().int().min(1).max(10_000),
  auto_refresh: z.boolean(),
})
const ChainInput = z.object({ chain: z.string().trim().min(1).max(64), enabled: z.boolean() })
const FeaturedTokenInput = z.object({
  chain: z.string().trim().min(1).max(64),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address'),
  symbol: z.string().trim().max(32).nullish(),
  name: z.string().trim().max(128).nullish(),
})
const TokenListInput = z.object({
  url: z.string().trim().max(2048).regex(/^(https?|ipfs):\/\//, 'URL must start with http(s):// or ipfs://'),
  name: z.string().trim().min(1).max(128),
  enabled: z.boolean().optional(),
})
const LoginInput = z.object({
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})

export type LoginFailure =
  | 'disabled'
  | 'malformed'
  | 'wrong_domain'
  | 'expired'
  | 'not_admin'
  | 'bad_signature'
  | 'nonce_used'

/** Verifies a signed SIWE message; consumes its nonce only after the signature checks out. */
export async function verifyAdminLogin(
  opts: Pick<AdminRouteOptions, 'store' | 'admins' | 'origin'>,
  message: string,
  signature: Hex,
  now = new Date(),
): Promise<{ ok: true; address: string } | { ok: false; reason: LoginFailure }> {
  if (opts.admins.length === 0) return { ok: false, reason: 'disabled' }

  const parsed = parseSiweMessage(message)
  if (!parsed.address || !parsed.nonce || !parsed.uri || !parsed.domain || !parsed.issuedAt) {
    return { ok: false, reason: 'malformed' }
  }
  const origin = new URL(opts.origin)
  // Domain and URI bind the signature to this app, so a message signed for another site is useless here.
  if (parsed.domain !== origin.host || normalizeOrigin(new URL(parsed.uri).origin) !== normalizeOrigin(origin.origin)) {
    return { ok: false, reason: 'wrong_domain' }
  }
  const age = now.getTime() - parsed.issuedAt.getTime()
  if (age > NONCE_MAX_AGE_MS || age < -60_000 || !validateSiweMessage({ message: parsed, time: now })) {
    return { ok: false, reason: 'expired' }
  }
  const address = parsed.address.toLowerCase()
  if (!opts.admins.includes(address)) return { ok: false, reason: 'not_admin' }

  let valid = false
  try {
    valid = await verifyMessage({ address: parsed.address, message, signature })
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'bad_signature' }
  if (!opts.store.consumeNonce(parsed.nonce, NONCE_MAX_AGE_MS)) return { ok: false, reason: 'nonce_used' }
  return { ok: true, address }
}

const LOGIN_MESSAGES: Record<LoginFailure, string> = {
  disabled: 'Admin sign-in is disabled: set ADMIN_WALLETS in server/.env',
  malformed: 'Sign-in message is malformed',
  wrong_domain: 'Sign-in message was not created for this app',
  expired: 'Sign-in message expired; try again',
  not_admin: 'This wallet is not an admin',
  bad_signature: 'Signature does not match the wallet',
  nonce_used: 'Sign-in request already used or expired; try again',
}

export function mountAdminRoutes(app: Hono, opts: AdminRouteOptions) {
  const { store } = opts
  const expectedOrigin = normalizeOrigin(opts.origin)

  // Reject any admin request from a foreign page. Same-origin GETs may omit Origin; anything that
  // changes state must carry the app's Origin and a custom header (forces CORS preflight cross-site).
  const sameOrigin: MiddlewareHandler = async (c, next) => {
    const origin = c.req.header('Origin')
    if (origin !== undefined && normalizeOrigin(origin) !== expectedOrigin) {
      return c.json({ error: 'Forbidden origin' }, 403)
    }
    if (c.req.method !== 'GET' && (origin === undefined || c.req.header('X-Admin-Request') !== '1')) {
      return c.json({ error: 'Missing same-origin admin request headers' }, 403)
    }
    return next()
  }

  const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
    const token = getCookie(c, ADMIN_COOKIE)
    const session = token ? store.getSession(token) : null
    // Re-check the allowlist each request so removing a wallet from ADMIN_WALLETS revokes it immediately.
    if (!session || !opts.admins.includes(session.address)) {
      return c.json({ error: 'Not signed in' }, 401)
    }
    c.set('adminAddress', session.address)
    return next()
  }

  const limitAuth = rateLimit({
    windowMs: 60_000,
    max: opts.authRateLimitPerMinute ?? 20,
    identify: (ip) => `admin-auth:${normalizeIp(ip)}`,
  })

  app.use('/api/admin/*', sameOrigin)
  app.use('/api/admin/nonce', limitAuth)
  app.use('/api/admin/login', limitAuth)

  app.get('/api/admin/nonce', (c) => {
    store.purgeExpired(NONCE_MAX_AGE_MS)
    c.header('Cache-Control', 'no-store')
    return c.json({ nonce: store.createNonce(), enabled: opts.admins.length > 0 })
  })

  app.post('/api/admin/login', zValidator('json', LoginInput), async (c) => {
    const { message, signature } = c.req.valid('json')
    const result = await verifyAdminLogin(opts, message, signature as Hex)
    if (!result.ok) {
      const status = result.reason === 'disabled' ? 503 : result.reason === 'not_admin' ? 403 : 401
      return c.json({ error: LOGIN_MESSAGES[result.reason] }, status)
    }
    const ttlMs = opts.sessionHours * 3_600_000
    const session = store.createSession(result.address, ttlMs)
    setCookie(c, ADMIN_COOKIE, session.token, {
      httpOnly: true,
      secure: opts.secureCookie,
      sameSite: 'Strict',
      path: '/api/admin',
      maxAge: Math.floor(ttlMs / 1000),
    })
    return c.json({ address: result.address, expiresAt: session.expiresAt })
  })

  app.post('/api/admin/logout', (c) => {
    const token = getCookie(c, ADMIN_COOKIE)
    if (token) store.deleteSession(token)
    deleteCookie(c, ADMIN_COOKIE, { path: '/api/admin' })
    return c.json({ ok: true })
  })

  // Everything below requires a signed-in admin wallet.
  const admin = app as unknown as Hono<AdminEnv>
  for (const path of ['/api/admin/session', '/api/admin/settings', '/api/admin/chains', '/api/admin/featured-tokens', '/api/admin/token-lists']) {
    admin.use(path, requireAdmin)
    admin.use(`${path}/*`, requireAdmin)
  }

  admin.get('/api/admin/session', (c) => {
    const token = getCookie(c, ADMIN_COOKIE) ?? ''
    return c.json({ address: c.get('adminAddress'), expiresAt: store.getSession(token)?.expiresAt ?? null })
  })

  admin.get('/api/admin/settings', (c) => c.json(store.getSettings()))
  admin.put('/api/admin/settings', zValidator('json', SettingsInput), (c) =>
    c.json(store.updateSettings(c.req.valid('json'))),
  )

  admin.get('/api/admin/chains', (c) => c.json(store.listChains()))
  admin.put('/api/admin/chains', zValidator('json', ChainInput), (c) => {
    const { chain, enabled } = c.req.valid('json')
    store.upsertChain(chain, enabled)
    return c.json({ ok: true })
  })
  admin.delete('/api/admin/chains/:chain', (c) =>
    store.deleteChain(c.req.param('chain')) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404),
  )

  admin.get('/api/admin/featured-tokens', (c) => c.json(store.listFeaturedTokens()))
  admin.post('/api/admin/featured-tokens', zValidator('json', FeaturedTokenInput), (c) =>
    conflictAware(c, () => c.json(store.addFeaturedToken(c.req.valid('json')), 201)),
  )
  admin.delete('/api/admin/featured-tokens/:id', (c) =>
    store.removeFeaturedToken(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404),
  )

  admin.get('/api/admin/token-lists', (c) => c.json(store.listTokenLists()))
  admin.post('/api/admin/token-lists', zValidator('json', TokenListInput), (c) =>
    conflictAware(c, () => c.json(store.addTokenList(c.req.valid('json')), 201)),
  )
  admin.patch('/api/admin/token-lists/:id', zValidator('json', z.object({ enabled: z.boolean() })), (c) =>
    store.setTokenListEnabled(c.req.param('id'), c.req.valid('json').enabled)
      ? c.json({ ok: true })
      : c.json({ error: 'Not found' }, 404),
  )
  admin.delete('/api/admin/token-lists/:id', (c) =>
    store.removeTokenList(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404),
  )
}

function conflictAware(c: Context, fn: () => Response): Response {
  try {
    return fn()
  } catch (error) {
    if (error instanceof ConflictError) return c.json({ error: 'Already exists' }, 409)
    throw error
  }
}
