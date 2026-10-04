// server/src/routes/prices.ts
// All prices come from Shaggy Dogg Crypto Market-Data (../shaggy-dogg-market-data): exchange order-book
// medians for native coins, Base on-chain pools for ERC-20s. No third-party price API.
import { makeTtlCache } from '../utils/cache.js'
import { marketDataNative, marketDataTokens } from '../utils/marketData.js'

import type { Hono as HonoApp } from 'hono'
import type { PriceRow } from '../schemas/prices.js'

const NATIVE_SYMBOL: Record<number, string> = {
  1: 'ETH',
  10: 'ETH',
  137: 'POL',
  42161: 'ETH',
  8453: 'ETH',
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

const nativeCache = makeTtlCache<PriceRow | undefined>({ ttlMs: 15_000 })
async function nativeCached(symbol: string): Promise<PriceRow | undefined> {
  const hit = nativeCache.get(symbol)
  if (hit !== undefined) return hit
  const row = await marketDataNative(symbol)
  if (row) nativeCache.set(symbol, row)
  return row
}

/** Native + ERC-20 rows for one chain; tokens Market-Data cannot price are simply absent. */
async function chainPrices(chainId: number, addresses: string[]): Promise<{ native?: PriceRow; tokens: PriceRow[] }> {
  const symbol = NATIVE_SYMBOL[chainId]
  const [native, tokens] = await Promise.all([
    symbol ? nativeCached(symbol) : Promise.resolve(undefined),
    addresses.length > 0 ? marketDataTokens(chainId, addresses) : Promise.resolve([]),
  ])
  return { ...(native ? { native } : {}), tokens }
}

export function mountPriceRoutes(app: HonoApp): void {
  // GET /api/prices?symbol=ETH                        -> { symbol, priceUsd, change24hPercent }
  // GET /api/prices?chainId=8453&contracts=0x..,0x..  -> { native: {...}, tokens: { addr: {...} } } (portfolio)
  app.get('/api/prices', async (c) => {
    const symbol = (c.req.query('symbol') || '').trim().toUpperCase()
    if (symbol) {
      if (!/^[A-Z0-9]{1,15}$/.test(symbol)) return c.json({ error: 'invalid symbol' }, 400)
      const row = await nativeCached(symbol)
      if (!row) return c.json({ error: 'no_price', detail: `No fresh exchange price for ${symbol}` }, 404)
      return c.json({ symbol, priceUsd: row.priceUsd, change24hPercent: row.change24hPercent })
    }

    const chainId = Number(c.req.query('chainId'))
    if (!Number.isInteger(chainId) || !NATIVE_SYMBOL[chainId]) {
      return c.json({ error: 'symbol or a supported chainId is required' }, 400)
    }
    const contracts = (c.req.query('contracts') || '').split(',').map((a) => a.trim()).filter(Boolean)
    if (contracts.length > 100 || contracts.some((a) => !ADDRESS.test(a))) {
      return c.json({ error: 'contracts must be up to 100 comma-separated addresses' }, 400)
    }
    const { native, tokens } = await chainPrices(chainId, contracts)
    if (!native) return c.json({ error: 'no_price', detail: 'Native price unavailable' }, 502)
    return c.json({
      native: { symbol: native.symbol ?? NATIVE_SYMBOL[chainId], usd: native.priceUsd, usd_24h_change: native.change24hPercent },
      tokens: Object.fromEntries(
        tokens.map((t) => [t.address.toLowerCase(), { usd: t.priceUsd, usd_24h_change: t.change24hPercent }]),
      ),
    })
  })

  // POST /api/prices { chainId, addresses } -> { success, data: { prices: PriceRow[] } }
  app.post('/api/prices', async (c) => {
    let body: { chainId?: unknown; addresses?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ success: false, error: 'invalid_json' }, 400)
    }
    const { chainId, addresses } = body
    if (typeof chainId !== 'number' || !Array.isArray(addresses) || addresses.some((a) => typeof a !== 'string' || !ADDRESS.test(a))) {
      return c.json({ success: false, error: 'invalid_body' }, 400)
    }
    if (!NATIVE_SYMBOL[chainId]) return c.json({ success: false, error: 'unsupported_chain', chainId }, 400)
    if (addresses.length > 100) return c.json({ success: false, error: 'too_many_addresses' }, 400)

    const { native, tokens } = await chainPrices(chainId, addresses as string[])
    return c.json({ success: true, data: { prices: [...(native ? [native] : []), ...tokens] } })
  })

  // GET /api/price/:symbol?currency=usd -> { symbol, price, currency, timestamp, change24h, source }
  app.get('/api/price/:symbol', async (c) => {
    const symbol = c.req.param('symbol').trim().toUpperCase()
    const currency = (c.req.query('currency') || 'usd').toLowerCase()
    if (!/^[A-Z0-9]{1,15}$/.test(symbol)) return c.json({ error: 'invalid symbol' }, 400)
    if (currency !== 'usd') return c.json({ error: 'Only USD prices are available' }, 400)
    const row = await nativeCached(symbol)
    if (!row) return c.json({ error: 'no_price', detail: `No fresh exchange price for ${symbol}` }, 404)
    return c.json({
      symbol,
      price: row.priceUsd,
      currency,
      timestamp: Date.now(),
      change24h: row.change24hPercent,
      source: 'market-data',
    })
  })
}
