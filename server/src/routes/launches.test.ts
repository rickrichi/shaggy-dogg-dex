import { Hono } from 'hono'
import { TransactionNotFoundError } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { chain } from '../launches/fixtures.js'
import { LaunchStore } from '../launches/store.js'
import { mountLaunchRoutes } from './launches.js'

import type { LaunchChainReader } from '../launches/verify.js'

const HASH = `0x${'cd'.repeat(32)}`

function appWith(client: LaunchChainReader) {
  const app = new Hono()
  const store = new LaunchStore(':memory:')
  mountLaunchRoutes(app, { store, client, reportRateLimitPerMinute: 1000 })
  const report = (txHash: string) =>
    app.request('/api/launches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash }),
    })
  return { app, store, report }
}

describe('launch tracking routes', () => {
  it('records a verified launch once and counts it by month', async () => {
    const { client } = chain()
    const { app, report } = appWith(client)
    const first = await report(HASH)
    expect(first.status).toBe(201)
    await expect(first.json()).resolves.toMatchObject({
      ok: true,
      launch: { tx_hash: HASH, symbol: 'MTT', supply: (10n ** 27n).toString(), pool_address: '0x0000000000000000000000000000000000000f00' },
    })
    expect((await report(HASH.toUpperCase().replace('0X', '0x'))).status).toBe(200)
    expect(client.getTransaction).toHaveBeenCalledTimes(1)

    const stats = await (await app.request('/api/launches/stats')).json()
    expect(stats).toMatchObject({ ok: true, total: 1, months: [{ month: '2026-09', launches: 1, creators: 1, seeded: 1 }] })
    const list = await (await app.request('/api/launches?limit=5')).json()
    expect(list.launches).toHaveLength(1)
  })

  it('refuses a transaction that did not deploy the template, and records nothing', async () => {
    const { report, store } = appWith(chain({ to: '0x000000000000000000000000000000000000beef' }).client)
    const response = await report(HASH)
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ ok: false, reason: 'not_contract_creation' })
    expect(store.list(10)).toEqual([])
  })

  it('distinguishes unknown transactions and chain outages from rejections', async () => {
    const missing = chain().client
    vi.mocked(missing.getTransaction).mockRejectedValue(new TransactionNotFoundError({ hash: HASH as `0x${string}` }))
    expect((await appWith(missing).report(HASH)).status).toBe(404)

    const down = chain().client
    vi.mocked(down.getTransaction).mockRejectedValue(new Error('fetch failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await appWith(down).report(HASH)).status).toBe(502)
  })

  it('reports an unavailable store as 503 without touching the chain', async () => {
    const { client } = chain()
    const failing = {
      get: vi.fn().mockRejectedValue(new Error('project paused')),
      record: vi.fn(),
      list: vi.fn().mockRejectedValue(new Error('project paused')),
      monthly: vi.fn().mockRejectedValue(new Error('project paused')),
    }
    const app = new Hono()
    mountLaunchRoutes(app, { store: failing, client, reportRateLimitPerMinute: 1000 })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const report = await app.request('/api/launches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: HASH }),
    })
    expect(report.status).toBe(503)
    await expect(report.json()).resolves.toEqual({ ok: false, reason: 'store_unavailable' })
    expect(client.getTransaction).not.toHaveBeenCalled()
    expect((await app.request('/api/launches/stats')).status).toBe(503)
    expect((await app.request('/api/launches')).status).toBe(503)
  })

  it('validates the hash before touching the chain', async () => {
    const { client } = chain()
    const response = await appWith(client).report('0x1234')
    expect(response.status).toBe(400)
    expect(client.getTransaction).not.toHaveBeenCalled()
  })
})
