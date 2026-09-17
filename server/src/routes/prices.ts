// server/src/routes/prices.ts
import { env } from '../env.js'
import { makeTtlCache } from '../utils/cache.js'

import type { Hono as HonoApp } from 'hono'
import type { AddressHex,PriceRow } from '../schemas/prices.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as AddressHex

interface PlatformMeta { platform: string; nativeId: string; nativeSymbol: string }
const PLATFORM = {
  1:     { platform: 'ethereum',            nativeId: 'ethereum',      nativeSymbol: 'ETH' },
  10:    { platform: 'optimistic-ethereum', nativeId: 'ethereum',      nativeSymbol: 'ETH' },
  137:   { platform: 'polygon-pos',         nativeId: 'matic-network', nativeSymbol: 'MATIC' },
  42161: { platform: 'arbitrum-one',        nativeId: 'ethereum',      nativeSymbol: 'ETH' },
  8453:  { platform: 'base',                nativeId: 'ethereum',      nativeSymbol: 'ETH' },
} as const satisfies Record<number, PlatformMeta>

const getPlatform = (chainId: number): PlatformMeta | null =>
  (PLATFORM as Record<number, PlatformMeta>)[chainId] ?? null

const findChainIdByNativeSymbol = (symbol: string): number | null => {
  const s = symbol.toUpperCase()
  for (const [id, meta] of Object.entries(PLATFORM) as Array<[string, PlatformMeta]>) {
    if (meta.nativeSymbol.toUpperCase() === s) return Number(id)
  }
  return null
}

async function fetchNative(chainId: number): Promise<PriceRow | undefined> {
  const meta = getPlatform(chainId)
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

const nativeCache = makeTtlCache<PriceRow | undefined>({ ttlMs: 15_000 })
async function fetchNativeCached(chainId: number) {
  const k = String(chainId)
  const hit = nativeCache.get(k)
  if (hit !== undefined) return hit
  const row = await fetchNative(chainId)
  nativeCache.set(k, row)
  return row
}

export function mountPriceRoutes(app: HonoApp): void {
  // GET /api/prices?symbol=ETH
  app.get('/api/prices', async (c) => {
    const symbol = (c.req.query('symbol') || '').trim().toUpperCase()
    if (!symbol) return c.json({ error: 'symbol is required' }, 400)

    const chainId = symbol === 'ETH' ? 1 : findChainIdByNativeSymbol(symbol)
    if (!chainId || !getPlatform(chainId)) return c.json({ error: 'unsupported symbol' }, 400)

    const row = await fetchNativeCached(chainId)
    if (!row) return c.json({ error: 'upstream_error' }, 502)

    return c.json({ symbol, priceUsd: row.priceUsd, change24hPercent: row.change24hPercent })
  })

  // POST /api/prices - Portfolio page endpoint
  app.post('/api/prices', async (c) => {
    let body: { chainId?: number; addresses?: string[] }

    try {
      body = await c.req.json()
    } catch {
      return c.json({ success: false, error: 'invalid_json' }, 400)
    }

    const { chainId, addresses } = body

    if (typeof chainId !== 'number' || !Array.isArray(addresses)) {
      return c.json({ success: false, error: 'invalid_body' }, 400)
    }

    const platform = getPlatform(chainId)
    if (!platform) {
      return c.json({ success: false, error: 'unsupported_chain', chainId }, 400)
    }

    try {
      const prices: PriceRow[] = []

      // 1. Fetch native token price (always included)
      const nativeRow = await fetchNativeCached(chainId)
      if (nativeRow) {
        prices.push(nativeRow)
      }

      // 2. Fetch ERC20 token prices via CoinGecko contract API
      if (addresses.length > 0) {
        const erc20Prices = await fetchErc20Prices(platform.platform, addresses)
        prices.push(...erc20Prices)
      }

      return c.json({
        success: true,
        data: { prices },
      })
    } catch (error) {
      console.error('[POST /api/prices] Error:', error)
      return c.json({ success: false, error: 'upstream_error' }, 502)
    }
  })
}

/**
 * Fetch ERC20 token prices from CoinGecko's contract price API
 *
 * @param platform - CoinGecko platform ID (e.g., 'base', 'ethereum', 'polygon-pos')
 * @param addresses - Array of contract addresses
 * @returns Array of price rows
 *
 * @example
 * // Fetch WETH price on Base
 * const prices = await fetchErc20Prices('base', ['0x4200000000000000000000000000000000000006'])
 */
async function fetchErc20Prices(
  platform: string,
  addresses: string[]
): Promise<PriceRow[]> {
  if (addresses.length === 0) return []

  // CoinGecko allows up to 100 addresses per request, but we'll batch by 50 for safety
  const BATCH_SIZE = 50
  const batches: string[][] = []

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    batches.push(addresses.slice(i, i + BATCH_SIZE))
  }

  const allPrices: PriceRow[] = []

  for (const batch of batches) {
    const batchPrices = await fetchErc20PriceBatch(platform, batch)
    allPrices.push(...batchPrices)
  }

  return allPrices
}

/**
 * Fetch a single batch of ERC20 prices from CoinGecko
 */
async function fetchErc20PriceBatch(
  platform: string,
  addresses: string[]
): Promise<PriceRow[]> {
  // Normalize addresses to lowercase for CoinGecko API
  const normalizedAddresses = addresses.map(a => a.toLowerCase())

  // Build CoinGecko API URL
  // Endpoint: /simple/token_price/{platform}
  const baseUrl = env.PRICE_API_FALLBACK || 'https://api.coingecko.com/api/v3'
  const url = new URL(`${baseUrl}/simple/token_price/${platform}`)

  url.searchParams.set('contract_addresses', normalizedAddresses.join(','))
  url.searchParams.set('vs_currencies', 'usd')
  url.searchParams.set('include_24hr_change', 'true')

  // Add API key header if available (Pro API)
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (env.COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = env.COINGECKO_API_KEY
  }

  try {
    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status} ${response.statusText}`)
      return []
    }

    const data = await response.json() as Record<string, {
      usd?: number
      usd_24h_change?: number
    }>

    // Parse response into PriceRow format
    const prices: PriceRow[] = []

    for (const [address, priceData] of Object.entries(data)) {
      if (!priceData || typeof priceData.usd !== 'number') continue

      prices.push({
        address: address as AddressHex,
        priceUsd: priceData.usd,
        change24hPercent: priceData.usd_24h_change ?? 0,
        symbol: undefined, // CoinGecko contract API doesn't return symbol
      })
    }

    return prices
  } catch (error) {
    console.error('[fetchErc20PriceBatch] Error:', error)
    return [] // Return empty array on error (graceful degradation)
  }
}
