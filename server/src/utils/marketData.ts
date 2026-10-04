// server/src/utils/marketData.ts
// Client for Shaggy Dogg Crypto Market-Data (../shaggy-dogg-market-data, default http://localhost:8010).

import { env } from '../env.js'

import type { AddressHex, PriceRow } from '../schemas/prices.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as AddressHex
const BASE_CHAIN_ID = 8453

interface MdPrice {
  symbol?: string | null
  priceUsd: number
  change24hPercent: number | null
}

async function getJson<T>(path: string): Promise<T | undefined> {
  try {
    const r = await fetch(`${env.MARKET_DATA_URL}${path}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return undefined
    return (await r.json()) as T
  } catch {
    return undefined // service offline: caller decides whether to fall back
  }
}

// The PriceRow contract requires a number; the frontend treats 0 as "no change data yet".
const toRow = (address: AddressHex, p: MdPrice, symbol?: string): PriceRow => ({
  address,
  priceUsd: p.priceUsd,
  change24hPercent: p.change24hPercent ?? 0,
  ...(symbol ?? p.symbol ? { symbol: (symbol ?? p.symbol) as string } : {}),
})

/** Native coin price by symbol (exchange median). */
export async function marketDataNative(symbol: string): Promise<PriceRow | undefined> {
  const p = await getJson<MdPrice>(`/api/market-data/prices/${encodeURIComponent(symbol)}`)
  return p && Number.isFinite(p.priceUsd) ? toRow(ZERO_ADDRESS, p, symbol) : undefined
}

/** ERC-20 prices from on-chain pools. Only Base is supported; other chains return nothing. */
export async function marketDataTokens(chainId: number, addresses: string[]): Promise<PriceRow[]> {
  if (chainId !== BASE_CHAIN_ID) return []
  const rows: PriceRow[] = []
  const queue = [...new Set(addresses.map((a) => a.toLowerCase()))]
  const worker = async () => {
    for (let a = queue.shift(); a !== undefined; a = queue.shift()) {
      const p = await getJson<MdPrice>(`/api/market-data/tokens/base/${a}`)
      if (p && Number.isFinite(p.priceUsd)) rows.push(toRow(a as AddressHex, p))
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return rows
}
