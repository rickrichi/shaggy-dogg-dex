import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { mountFallback } from './fallback.js'

const ORIGIN = 'https://dex.example.com'

function appFor(production: boolean) {
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ ok: true }))
  mountFallback(app, { production, origin: ORIGIN })
  return app
}

describe('fallback route', () => {
  it('describes the service at the root in production', async () => {
    const res = await appFor(true).request('/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, service: 'Shaggy Dogg API', app: ORIGIN })
  })

  it('answers HEAD at the root without an error', async () => {
    const res = await appFor(true).request('/', { method: 'HEAD' })
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown paths in production', async () => {
    const res = await appFor(true).request('/.git/HEAD')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, reason: 'not_found' })
  })

  it('returns 404 for unknown API paths and leaves real ones alone', async () => {
    const app = appFor(true)
    expect((await app.request('/api/nope')).status).toBe(404)
    expect((await app.request('/api/health')).status).toBe(200)
  })

  it('redirects to the Vite app in development', async () => {
    const res = await appFor(false).request('/swap?x=1')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/swap?x=1`)
  })
})
