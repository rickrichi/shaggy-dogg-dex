import { describe, expect, it, vi } from 'vitest'

import { SupabaseLaunchStore, SupabaseStoreError } from './supabaseStore.js'

import type { VerifiedLaunch } from './verify.js'

const HASH = `0x${'AB'.repeat(32)}` as const
const launch: VerifiedLaunch = {
  txHash: HASH,
  tokenAddress: `0x${'1'.repeat(40)}`,
  creator: `0x${'2'.repeat(40)}`,
  recipient: `0x${'3'.repeat(40)}`,
  name: 'x'.repeat(200),
  symbol: 'MTT',
  supply: 10n ** 30n,
  blockNumber: 123n,
  launchedAt: 1_790_000_000,
  poolAddress: null,
}
const row = { tx_hash: HASH.toLowerCase(), supply: (10n ** 30n).toString(), launched_at: 1_790_000_000 }

/** A fetch stub that answers each call in order and records what was sent. */
function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => responses.shift()!)
  return fetchMock
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('SupabaseLaunchStore', () => {
  it('sends the service key in apikey, and as a bearer token only when it is a JWT', async () => {
    for (const [serviceKey, bearer] of [
      ['eyJhbGciOiJIUzI1NiJ9.service.role', true],
      ['sb_secret_abcdefghijklmnopqrstuv', false],
    ] as const) {
      const fetchMock = stubFetch(json([]))
      await new SupabaseLaunchStore({ url: 'https://ref.supabase.co/', serviceKey, fetch: fetchMock }).get(HASH)
      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe(`https://ref.supabase.co/rest/v1/launches?select=*&tx_hash=eq.${HASH.toLowerCase()}&limit=1`)
      const headers = init!.headers as Record<string, string>
      expect(headers.apikey).toBe(serviceKey)
      expect(headers.authorization).toBe(bearer ? `Bearer ${serviceKey}` : undefined)
    }
  })

  it('inserts idempotently with normalized, bounded fields and returns the stored row', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 201 }), json([row]))
    const store = new SupabaseLaunchStore({ url: 'https://ref.supabase.co', serviceKey: 'sb_secret_abcdefghijklmnopqrstuv', fetch: fetchMock })
    await expect(store.record(launch)).resolves.toEqual(row)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://ref.supabase.co/rest/v1/launches?on_conflict=tx_hash')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>).prefer).toBe('resolution=ignore-duplicates,return=minimal')
    const body = JSON.parse(init!.body as string)
    expect(body).toMatchObject({ tx_hash: HASH.toLowerCase(), symbol: 'MTT', supply: '1' + '0'.repeat(30), block_number: 123, pool_address: null })
    expect(body.name).toHaveLength(128)
    expect(body).not.toHaveProperty('recorded_at')
  })

  it('converts monthly counts to numbers', async () => {
    const fetchMock = stubFetch(json([{ month: '2026-10', launches: '3', creators: '2', seeded: 1 }]))
    const store = new SupabaseLaunchStore({ url: 'https://ref.supabase.co', serviceKey: 'sb_secret_abcdefghijklmnopqrstuv', fetch: fetchMock })
    await expect(store.monthly()).resolves.toEqual([{ month: '2026-10', launches: 3, creators: 2, seeded: 1 }])
    expect(fetchMock.mock.calls[0]![0]).toBe('https://ref.supabase.co/rest/v1/rpc/launch_monthly_stats')
  })

  it('raises a SupabaseStoreError on a failed request instead of returning bad data', async () => {
    const fetchMock = stubFetch(new Response('project paused', { status: 503 }))
    const store = new SupabaseLaunchStore({ url: 'https://ref.supabase.co', serviceKey: 'sb_secret_abcdefghijklmnopqrstuv', fetch: fetchMock })
    const failure = store.list(10)
    await expect(failure).rejects.toBeInstanceOf(SupabaseStoreError)
    await expect(failure).rejects.toMatchObject({ status: 503 })
  })
})
