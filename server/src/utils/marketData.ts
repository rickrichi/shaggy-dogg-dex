// server/src/utils/marketData.ts
// Client for Shaggy Dogg Crypto Market-Data (../shaggy-dogg-market-data, default http://localhost:8010).

import { env } from '../env.js'

import { makeTtlCache } from './cache.js'

import type { AddressHex, PriceRow } from '../schemas/prices.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as AddressHex
const BASE_CHAIN_ID = 8453

const NATIVE_TIMEOUT_MS = 5_000
// Token lookups may outlive the batch deadline: their answers land in the caches for the next scan.
const TOKEN_TIMEOUT_MS = 30_000
const BATCH_DEADLINE_MS = 7_000 // stays inside the browser's 10s fetch timeout
const BATCH_CONCURRENCY = 4
const RATE_LIMIT_COOLDOWN_MS = 30_000
// An older Market-Data without the batch route is re-probed after this long.
const BATCH_UNSUPPORTED_RETRY_MS = 10 * 60_000

interface MdPrice {
  symbol?: string | null
  priceUsd: number
  change24hPercent: number | null
  /** Set by Market-Data (allowThin) when the pool is below its liquidity floor. */
  indicative?: boolean
  pool?: { liquidityUsd?: number }
}

/**
 * ok: priced. missing: the service answered that it cannot price this (no contract, no deep enough
 * pool). failed: the service did not answer usefully (offline, timeout, 429, 5xx, challenge page).
 */
type Fetched<T> = { kind: 'ok'; value: T } | { kind: 'missing'; detail?: string } | { kind: 'failed' }

// Set when the service (or the CDN in front of it) rate-limits us; requests pause until then.
let rateLimitedUntil = 0

async function getJson<T>(path: string, timeoutMs: number): Promise<Fetched<T>> {
  if (Date.now() < rateLimitedUntil) return { kind: 'failed' }
  try {
    const r = await fetch(`${env.MARKET_DATA_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
    if (r.status === 429) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
      console.warn(`[market-data] 429 on ${path}; pausing requests for ${RATE_LIMIT_COOLDOWN_MS / 1000}s`)
      return { kind: 'failed' }
    }
    if (r.status === 400 || r.status === 404 || r.status === 422) {
      const body = (await r.json().catch(() => undefined)) as { detail?: unknown } | undefined
      return typeof body?.detail === 'string' ? { kind: 'missing', detail: body.detail } : { kind: 'missing' }
    }
    if (!r.ok) {
      console.warn(`[market-data] HTTP ${r.status} on ${path}`)
      return { kind: 'failed' }
    }
    return { kind: 'ok', value: (await r.json()) as T }
  } catch (error) {
    // Offline, timed out, or a non-JSON body such as a CDN challenge page.
    console.warn(`[market-data] ${path}: ${error instanceof Error ? error.name : 'error'}`)
    return { kind: 'failed' }
  }
}

// The PriceRow contract requires a number; the frontend treats 0 as "no change data yet".
const toRow = (address: AddressHex, p: MdPrice, symbol?: string): PriceRow => ({
  address,
  priceUsd: p.priceUsd,
  change24hPercent: p.change24hPercent ?? 0,
  ...(symbol ?? p.symbol ? { symbol: (symbol ?? p.symbol) as string } : {}),
  ...(p.indicative
    ? { indicative: true, ...(Number.isFinite(p.pool?.liquidityUsd) ? { liquidityUsd: p.pool?.liquidityUsd as number } : {}) }
    : {}),
})

/** Native coin price by symbol (exchange median). */
export async function marketDataNative(symbol: string): Promise<PriceRow | undefined> {
  const p = await getJson<MdPrice>(`/api/market-data/prices/${encodeURIComponent(symbol)}`, NATIVE_TIMEOUT_MS)
  return p.kind === 'ok' && Number.isFinite(p.value.priceUsd) ? toRow(ZERO_ADDRESS, p.value, symbol) : undefined
}

type TokenOutcome = { kind: 'ok'; row: PriceRow } | { kind: 'missing' } | { kind: 'failed' }

// Prices are kept 60s so a full sweep of a chain's list can finish before early answers expire;
// "cannot price" answers change rarely, so they are kept longer to stop re-asking for them.
// Keys carry the mode, so a thin-pool answer is never served to a caller that did not ask for one.
const tokenPriceCache = makeTtlCache<PriceRow>({ ttlMs: 60_000, maxSize: 1_000 })
const tokenMissingCache = makeTtlCache<true>({ ttlMs: 10 * 60_000, maxSize: 1_000 })
const tokenInFlight = new Map<string, Promise<TokenOutcome>>()

const cacheKey = (address: string, thin: boolean) => `${thin ? 'thin' : 'strict'}:${address}`
const thinQuery = (thin: boolean) => (thin ? 'allowThin=true' : '')

/** A "cannot price" answer, except when it is really the service's own ETH/USDC feeds being down. */
function missingOutcome(address: string, thin: boolean, detail: string | undefined): TokenOutcome {
  if (detail?.startsWith('No live')) return { kind: 'failed' }
  tokenMissingCache.set(cacheKey(address, thin), true)
  return { kind: 'missing' }
}

function pricedOutcome(address: string, thin: boolean, p: MdPrice): TokenOutcome {
  if (!Number.isFinite(p.priceUsd)) return { kind: 'failed' }
  const row = toRow(address as AddressHex, p)
  tokenPriceCache.set(cacheKey(address, thin), row)
  return { kind: 'ok', row }
}

interface MdBatch {
  tokens: Record<string, MdPrice>
  errors: Record<string, { status: number; detail?: string }>
}

let batchUnsupportedUntil = 0
const batchInFlight = new Map<string, Promise<Map<string, TokenOutcome> | 'unsupported'>>()

/**
 * All addresses in one request (two batched RPC reads on the service side). Addresses absent from
 * the answer count as failed. 'unsupported' means the service predates the batch route.
 */
function fetchBatch(addresses: AddressHex[], thin: boolean): Promise<Map<string, TokenOutcome> | 'unsupported'> {
  const list = [...addresses].sort().join(',')
  const key = cacheKey(list, thin)
  const pending = batchInFlight.get(key)
  if (pending) return pending
  const query = [`addresses=${list}`, thinQuery(thin)].filter(Boolean).join('&')
  const request = getJson<MdBatch>(`/api/market-data/tokens/base?${query}`, TOKEN_TIMEOUT_MS)
    .then((p): Map<string, TokenOutcome> | 'unsupported' => {
      const outcomes = new Map<string, TokenOutcome>()
      if (p.kind === 'missing') {
        batchUnsupportedUntil = Date.now() + BATCH_UNSUPPORTED_RETRY_MS
        console.warn('[market-data] batch token route unavailable; using per-token requests')
        return 'unsupported'
      }
      if (p.kind === 'failed') return outcomes
      for (const [address, price] of Object.entries(p.value.tokens ?? {})) {
        outcomes.set(address.toLowerCase(), pricedOutcome(address.toLowerCase(), thin, price))
      }
      for (const [address, error] of Object.entries(p.value.errors ?? {})) {
        const a = address.toLowerCase()
        outcomes.set(a, error.status === 404 || error.status === 422 ? missingOutcome(a, thin, error.detail) : { kind: 'failed' })
      }
      return outcomes
    })
    .finally(() => batchInFlight.delete(key))
  batchInFlight.set(key, request)
  return request
}

function fetchToken(address: string, thin: boolean): Promise<TokenOutcome> {
  const key = cacheKey(address, thin)
  const pending = tokenInFlight.get(key)
  if (pending) return pending
  const query = thin ? `?${thinQuery(thin)}` : ''
  const request = getJson<MdPrice>(`/api/market-data/tokens/base/${address}${query}`, TOKEN_TIMEOUT_MS)
    .then((p): TokenOutcome => {
      if (p.kind === 'ok') return pricedOutcome(address, thin, p.value)
      return p.kind === 'missing' ? missingOutcome(address, thin, p.detail) : { kind: 'failed' }
    })
    .finally(() => tokenInFlight.delete(key))
  tokenInFlight.set(key, request)
  return request
}

export interface TokenPrices {
  readonly rows: PriceRow[]
  /** Answered by the service as not priceable (no contract, no pool, or below the floor when not thin). */
  readonly unpriced: AddressHex[]
  /** No answer within the deadline, or the service errored; worth retrying later. */
  readonly failed: AddressHex[]
}

/**
 * ERC-20 prices from on-chain pools. Only Base is supported; other chains report every address unpriced.
 * thin: also accept pools below Market-Data's liquidity floor; those rows carry `indicative: true`.
 */
export async function marketDataTokens(chainId: number, addresses: string[], thin = false): Promise<TokenPrices> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase() as AddressHex))]
  if (chainId !== BASE_CHAIN_ID) return { rows: [], unpriced: unique, failed: [] }

  const rows: PriceRow[] = []
  const unpriced: AddressHex[] = []
  const failed: AddressHex[] = []
  const queue: AddressHex[] = []
  for (const a of unique) {
    const cached = tokenPriceCache.get(cacheKey(a, thin))
    if (cached) rows.push(cached)
    else if (tokenMissingCache.has(cacheKey(a, thin))) unpriced.push(a)
    else queue.push(a)
  }

  const record = (a: AddressHex, outcome: TokenOutcome) => {
    if (outcome.kind === 'ok') rows.push(outcome.row)
    else if (outcome.kind === 'missing') unpriced.push(a)
    else failed.push(a)
  }

  // Requests left running at the deadline still finish and fill the caches for the next call.
  const deadline = Date.now() + BATCH_DEADLINE_MS
  const beforeDeadline = async <T>(request: Promise<T>, expiredValue: T): Promise<T> => {
    let timer: NodeJS.Timeout | undefined
    const expired = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(expiredValue), Math.max(0, deadline - Date.now()))
    })
    try {
      return await Promise.race([request, expired])
    } finally {
      clearTimeout(timer)
    }
  }

  if (queue.length > 0 && Date.now() >= batchUnsupportedUntil) {
    const batch = await beforeDeadline(fetchBatch(queue, thin), new Map<string, TokenOutcome>())
    if (batch !== 'unsupported') {
      for (const a of queue) record(a, batch.get(a) ?? { kind: 'failed' })
      return { rows, unpriced, failed }
    }
  }

  // Fallback for a Market-Data without the batch route: one request per token, a few at a time.
  const worker = async () => {
    for (let a = queue.shift(); a !== undefined; a = queue.shift()) {
      const outcome: TokenOutcome = Date.now() < deadline
        ? await beforeDeadline(fetchToken(a, thin), { kind: 'failed' })
        : { kind: 'failed' }
      record(a, outcome)
    }
  }
  await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker))
  return { rows, unpriced, failed }
}

/** Test hook: forget cached answers and any rate-limit pause. */
export function resetMarketDataCaches(): void {
  tokenPriceCache.clear()
  tokenMissingCache.clear()
  tokenInFlight.clear()
  batchInFlight.clear()
  rateLimitedUntil = 0
  batchUnsupportedUntil = 0
}
