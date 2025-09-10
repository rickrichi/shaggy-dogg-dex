// server/src/routes/prices.ts
import type { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  PricesRequestSchema,
  PricesResponseOkSchema,
  PricesResponseFailSchema,
  type PriceRow,
  type AddressHex,
} from '../schemas/prices.js'
import { env } from '../env.js'
import { makeTtlCache } from '../utils/cache.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as AddressHex
const ZERO_LC = ZERO_ADDRESS.toLowerCase()

const PLATFORM: Record<number, { platform: string; nativeId: string; nativeSymbol: string }> = {
  1: { platform: 'ethereum',            nativeId: 'ethereum',      nativeSymbol: 'ETH' },
  10:{ platform: 'optimistic-ethereum', nativeId: 'ethereum',      nativeSymbol: 'ETH' },
  137:{ platform: 'polygon-pos',        nativeId: 'matic-network',  nativeSymbol: 'MATIC' },
  42161:{ platform: 'arbitrum-one',     nativeId: 'ethereum',      nativeSymbol: 'ETH' },
  8453:{ platform: 'base',              nativeId: 'ethereum',      nativeSymbol: 'ETH' },
}

async function fetchNative(chainId: number): Promise<PriceRow | undefined> {
  const meta = PLATFORM[chainId]
  if (!meta) return undefined

  const url = new URL(`${env.PRICE_API_FALLBACK}/simple/price`)
  url.searchParams.set('ids', meta.nativeId)
  url.searchParams.set('vs_currencies', 'usd')
  url.searchParams.set('include_24hr_change', 'true')

  const headers: Record<string, string> = {}
  if (env.COINGECKO_API_KEY) headers['x-cg-pro-api-key'] = env.COINGECKO_API_KEY

  const r = await fetch(url, { headers })
  if (!r.ok) return undefined

  const j = (await r.json()) as Record<string, { usd?: number; usd_24h_change?: number }>
  const row = j[meta.nativeId]
  if (!row) return undefined

  return {
    address: ZERO_ADDRESS,
    priceUsd: Number(row.usd ?? 0),
    change24hPercent: Number(row.usd_24h_change ?? 0),
    symbol: meta.nativeSymbol,
  }
}

async function fetchErc20s(chainId: number, addresses: readonly AddressHex[]): Promise<PriceRow[]> {
  if (addresses.length === 0) return []
  const meta = PLATFORM[chainId]
  if (!meta) return []

  const url = new URL(`${env.PRICE_API_FALLBACK}/simple/token_price/${meta.platform}`)
  url.searchParams.set('contract_addresses', addresses.join(','))
  url.searchParams.set('vs_currencies', 'usd')
  url.searchParams.set('include_24hr_change', 'true')

  const headers: Record<string, string> = {}
  if (env.COINGECKO_API_KEY) headers['x-cg-pro-api-key'] = env.COINGECKO_API_KEY

  const r = await fetch(url, { headers })
  if (!r.ok) return []

  type TokenResp = { usd?: number; usd_24h_change?: number; symbol?: string }
  const j = (await r.json()) as Record<string, TokenResp> // keys are lowercased addrs

  const out: PriceRow[] = []
  const index = new Set(addresses.map((a) => a.toLowerCase()))
  for (const [key, val] of Object.entries(j)) {
    const addr = `0x${key.replace(/^0x/i, '')}` as AddressHex
    if (!index.has(addr.toLowerCase())) continue
    out.push({
      address: addr,
      priceUsd: Number(val.usd ?? 0),
      change24hPercent: Number(val.usd_24h_change ?? 0),
      symbol: typeof val.symbol === 'string' ? val.symbol.toUpperCase() : undefined,
    })
  }
  return out
}

// ── small TTL caches to protect upstream ───────────────────────────────────────
// Your makeTtlCache now takes an options object; pass { ttlMs }.
const nativeCache = makeTtlCache<PriceRow | undefined>({ ttlMs: 15_000 })
const erc20Cache  = makeTtlCache<PriceRow[]>({ ttlMs: 15_000 })

async function fetchNativeCached(chainId: number) {
  const k = String(chainId)
  const hit = nativeCache.get(k)
  if (hit !== undefined) return hit
  const row = await fetchNative(chainId)
  nativeCache.set(k, row)
  return row
}

async function fetchErc20sCached(chainId: number, addresses: readonly AddressHex[]) {
  const key = `${chainId}:${addresses.map((a) => a.toLowerCase()).sort().join(',')}`
  const hit = erc20Cache.get(key)
  if (hit) return hit
  const rows = await fetchErc20s(chainId, addresses)
  erc20Cache.set(key, rows)
  return rows
}

export function mountPriceRoutes(app: Hono): void {
  app.post(
    '/api/prices',
    zValidator('json', PricesRequestSchema),
    async (c) => {
      const { chainId, addresses } = c.req.valid('json') as { chainId: number; addresses: AddressHex[] }
      try {
        const filtered = addresses.filter((a) => a.toLowerCase() !== ZERO_LC)
        const [nativeRow, erc20Rows] = await Promise.all([
          fetchNativeCached(chainId),
          fetchErc20sCached(chainId, filtered),
        ])

        const prices = (nativeRow ? [nativeRow, ...erc20Rows] : erc20Rows) as readonly PriceRow[]
        const payload = { success: true, data: { prices } } as const

        const ok = PricesResponseOkSchema.safeParse(payload)
        if (!ok.success) return c.json({ success: false, error: 'schema_mismatch' } as const, 500)

        return c.json(ok.data)
      } catch {
        const err = { success: false, error: 'upstream_error', chainId } as const
        const fail = PricesResponseFailSchema.safeParse(err)
        return c.json(fail.success ? fail.data : err, 502)
      }
    }
  )
}
