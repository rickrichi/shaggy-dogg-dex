import { Hono } from 'hono'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { describe, expect, it } from 'vitest'

import { AdminStore } from '../admin/store.js'

import { ADMIN_COOKIE, mountAdminRoutes } from './admin.js'

const ORIGIN = 'http://localhost:5173'
const admin = privateKeyToAccount(generatePrivateKey())
const stranger = privateKeyToAccount(generatePrivateKey())

function setup(admins: string[] = [admin.address.toLowerCase()], store = new AdminStore(':memory:')) {
  const app = new Hono()
  mountAdminRoutes(app, { store, admins, origin: ORIGIN, sessionHours: 8, secureCookie: false, authRateLimitPerMinute: 10_000 })
  return { app, store }
}

const post = (body: unknown, cookie?: string) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    'X-Admin-Request': '1',
    ...(cookie ? { Cookie: cookie } : {}),
  },
  body: JSON.stringify(body),
})

async function signIn(app: Hono, account = admin, overrides: { domain?: string; uri?: string } = {}) {
  const { nonce } = (await (await app.request('/api/admin/nonce')).json()) as { nonce: string }
  const message = createSiweMessage({
    domain: overrides.domain ?? 'localhost:5173',
    uri: overrides.uri ?? ORIGIN,
    address: account.address,
    version: '1',
    chainId: 8453,
    nonce,
    issuedAt: new Date(),
  })
  const signature = await account.signMessage({ message })
  const res = await app.request('/api/admin/login', post({ message, signature }))
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  return { res, cookie, message, signature }
}

describe('admin wallet sign-in', () => {
  it('signs in an allowlisted wallet and grants access to settings', async () => {
    const { app } = setup()
    const { res, cookie } = await signIn(app)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/)
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=Strict/)
    expect(cookie?.startsWith(`${ADMIN_COOKIE}=`)).toBe(true)

    const settings = await app.request('/api/admin/settings', { headers: { Cookie: cookie! } })
    expect(settings.status).toBe(200)
    expect(await settings.json()).toMatchObject({ default_slippage_bps: 50, auto_refresh: true })

    const put = await app.request('/api/admin/settings', {
      ...post({ default_slippage_bps: 75, max_gas_price_gwei: 30, auto_refresh: false }, cookie),
      method: 'PUT',
    })
    expect(await put.json()).toMatchObject({ default_slippage_bps: 75, auto_refresh: false })
  })

  it('refuses a wallet that is not on the allowlist', async () => {
    const { app } = setup()
    const { res, cookie } = await signIn(app, stranger)
    expect(res.status).toBe(403)
    expect(cookie).toBeUndefined()
  })

  it('refuses a replayed signature', async () => {
    const { app } = setup()
    const first = await signIn(app)
    expect(first.res.status).toBe(200)
    const replay = await app.request('/api/admin/login', post({ message: first.message, signature: first.signature }))
    expect(replay.status).toBe(401)
  })

  it('refuses a message signed for another site', async () => {
    const { app } = setup()
    const { res } = await signIn(app, admin, { domain: 'evil.example', uri: 'https://evil.example' })
    expect(res.status).toBe(401)
  })

  it('is disabled when no admin wallets are configured', async () => {
    const { app } = setup([])
    const { res } = await signIn(app)
    expect(res.status).toBe(503)
  })

  it('requires a session, the app origin and the admin header', async () => {
    const { app } = setup()
    expect((await app.request('/api/admin/settings')).status).toBe(401)
    const { cookie } = await signIn(app)
    const foreign = await app.request('/api/admin/settings', { headers: { Cookie: cookie!, Origin: 'https://evil.example' } })
    expect(foreign.status).toBe(403)
    const noHeader = await app.request('/api/admin/featured-tokens', {
      method: 'POST',
      headers: { Cookie: cookie!, Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'base', address: `0x${'a'.repeat(40)}` }),
    })
    expect(noHeader.status).toBe(403)
  })

  it('revokes sessions when a wallet is removed from the allowlist', async () => {
    const { app, store } = setup()
    const { cookie } = await signIn(app)
    const { app: reconfigured } = setup([stranger.address.toLowerCase()], store)
    expect((await reconfigured.request('/api/admin/settings', { headers: { Cookie: cookie! } })).status).toBe(401)
  })

  it('logs out by deleting the server-side session', async () => {
    const { app } = setup()
    const { cookie } = await signIn(app)
    await app.request('/api/admin/logout', post({}, cookie))
    expect((await app.request('/api/admin/settings', { headers: { Cookie: cookie! } })).status).toBe(401)
  })
})

describe('sign-in rate limit', () => {
  it('throttles repeated nonce requests', async () => {
    const app = new Hono()
    mountAdminRoutes(app, {
      store: new AdminStore(':memory:'),
      admins: [admin.address.toLowerCase()],
      origin: ORIGIN,
      sessionHours: 8,
      secureCookie: false,
      authRateLimitPerMinute: 3,
    })
    const statuses = []
    for (let i = 0; i < 4; i++) {
      statuses.push((await app.request('/api/admin/nonce', { headers: { 'X-Forwarded-For': '203.0.113.9' } })).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })
})

describe('admin data', () => {
  it('manages featured tokens and token lists', async () => {
    const { app } = setup()
    const { cookie } = await signIn(app)
    const token = { chain: 'base', address: `0x${'A'.repeat(40)}`, symbol: 'TKN', name: 'Token' }
    const created = await app.request('/api/admin/featured-tokens', post(token, cookie))
    expect(created.status).toBe(201)
    const row = (await created.json()) as { id: string; address: string }
    expect(row.address).toBe(`0x${'a'.repeat(40)}`)
    expect((await app.request('/api/admin/featured-tokens', post(token, cookie))).status).toBe(409)

    const list = await app.request('/api/admin/token-lists', post({ url: 'https://tokens.example/list.json', name: 'Example' }, cookie))
    const listRow = (await list.json()) as { id: string; enabled: boolean }
    expect(listRow.enabled).toBe(true)
    const toggled = await app.request(`/api/admin/token-lists/${listRow.id}`, { ...post({ enabled: false }, cookie), method: 'PATCH' })
    expect(toggled.status).toBe(200)
    const lists = (await (await app.request('/api/admin/token-lists', { headers: { Cookie: cookie! } })).json()) as Array<{ enabled: boolean }>
    expect(lists[0]?.enabled).toBe(false)

    const removed = await app.request(`/api/admin/featured-tokens/${row.id}`, { ...post({}, cookie), method: 'DELETE' })
    expect(removed.status).toBe(200)
  })

  it('rejects token lists with unsupported URL schemes', async () => {
    const { app } = setup()
    const { cookie } = await signIn(app)
    const res = await app.request('/api/admin/token-lists', post({ url: 'javascript:alert(1)', name: 'x' }, cookie))
    expect(res.status).toBe(400)
  })
})
