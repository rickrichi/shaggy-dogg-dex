// server/src/launches/trading.ts
// First-month trading per seeded launch for the launchpad demand test (whitepaper v2.0 §17.1).
// Everything is read from public Base data, so anyone can rerun the measurement and get the same
// numbers. Only the Uniswap V3 1% WETH pool that the launchpad seeds (verify.ts) is measured.

import { type Address, type Hash, parseEther } from 'viem'

import { BASE_WETH, LAUNCH_POOL_FEE } from './verify.js'

import type { LaunchRow } from './store.js'

/** Base produces a block every two seconds, so block heights convert to times without lookups. */
export const BLOCK_SECONDS = 2
export const FIRST_MONTH_SECONDS = 30 * 86_400
/** Liquidity added within this long after deployment counts as the launch's seed. */
export const SEED_WINDOW_SECONDS = 86_400
export const MIN_SEED_WETH = parseEther('0.05')
export const BASE_USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
/** WETH/USDC pool fee tier used to price WETH in dollars. */
export const PRICE_POOL_FEE = 500

export interface PoolSwap {
  blockNumber: bigint
  txHash: Hash
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
}

export interface PoolMint {
  blockNumber: bigint
  amount0: bigint
  amount1: bigint
}

/** The chain reads the measurement needs; trading-chain.ts implements them with viem. */
export interface TradingChainReader {
  latestBlock(): Promise<bigint>
  poolFor(tokenA: Address, tokenB: Address, fee: number): Promise<Address | null>
  swaps(pool: Address, fromBlock: bigint, toBlock: bigint): Promise<PoolSwap[]>
  mints(pool: Address, fromBlock: bigint, toBlock: bigint): Promise<PoolMint[]>
  txSender(txHash: Hash): Promise<Address>
}

export type LaunchInput = Pick<
  LaunchRow,
  'tx_hash' | 'token_address' | 'creator' | 'recipient' | 'symbol' | 'block_number' | 'launched_at' | 'pool_address'
>

export interface LaunchTrading {
  txHash: string
  token: string
  symbol: string
  /** UTC calendar month of the deployment, YYYY-MM. */
  month: string
  pool: string | null
  /** WETH (wei) added to the pool within a day of deployment. */
  seedWei: string
  seeded: boolean
  /** True once the full 30-day first month has passed. */
  complete: boolean
  swaps: number
  /** Swaps sent by the creator or the supply recipient, left out of the volume. */
  excludedSwaps: number
  volumeWei: string
  volumeUsd: number
}

const abs = (n: bigint) => (n < 0n ? -n : n)
const lower = (a: string) => a.toLowerCase()

export const monthOf = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 7)

/** Dollars per WETH from a WETH/USDC pool's sqrtPriceX96. */
export function usdPerWeth(sqrtPriceX96: bigint, wethIsToken0: boolean): number {
  const squared = sqrtPriceX96 * sqrtPriceX96
  if (squared === 0n) return 0
  // WETH has 18 decimals and USDC 6, hence the 10^12; the extra 10^6 keeps cents through the division.
  const scaled = wethIsToken0
    ? (squared * 10n ** 12n * 1_000_000n) >> 192n
    : ((1n << 192n) * 10n ** 12n * 1_000_000n) / squared
  return Number(scaled) / 1_000_000
}

/** Prices WETH once per UTC day from swaps in the WETH/USDC pool around that day's noon. */
export class DailyWethPrice {
  private readonly cache = new Map<number, Promise<number>>()
  private poolPromise: Promise<Address | null> | undefined

  constructor(
    private readonly reader: TradingChainReader,
    /** Any block with its timestamp, used to place days on the block axis. */
    private readonly anchor: { block: bigint; timestamp: number },
  ) {}

  usdOn(unixSeconds: number): Promise<number> {
    const day = Math.floor(unixSeconds / 86_400)
    let price = this.cache.get(day)
    if (!price) {
      price = this.lookup(day)
      this.cache.set(day, price)
    }
    return price
  }

  private async lookup(day: number): Promise<number> {
    this.poolPromise ??= this.reader.poolFor(BASE_WETH, BASE_USDC, PRICE_POOL_FEE)
    const pool = await this.poolPromise
    if (!pool) throw new Error('WETH/USDC price pool not found on Base')
    const noon = day * 86_400 + 43_200
    const noonBlock = this.anchor.block + BigInt(Math.round((noon - this.anchor.timestamp) / BLOCK_SECONDS))
    const wethIsToken0 = lower(BASE_WETH) < lower(BASE_USDC)
    // Five minutes of blocks is plenty for this pool; widen to an hour if it was somehow quiet.
    for (const span of [150n, 1_800n]) {
      const swaps = await this.reader.swaps(pool, noonBlock, noonBlock + span)
      const last = swaps.at(-1)
      if (last) return usdPerWeth(last.sqrtPriceX96, wethIsToken0)
    }
    throw new Error(`No WETH/USDC swaps near noon UTC on day ${day}`)
  }
}

/** Maps over items with at most `limit` promises in flight. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

export async function measureLaunch(
  reader: TradingChainReader,
  launch: LaunchInput,
  latestBlock: bigint,
  prices: DailyWethPrice,
): Promise<LaunchTrading> {
  const token = lower(launch.token_address) as Address
  const startBlock = BigInt(launch.block_number)
  const pool = launch.pool_address
    ? (lower(launch.pool_address) as Address)
    : await reader.poolFor(BASE_WETH, token, LAUNCH_POOL_FEE)
  const base: LaunchTrading = {
    txHash: launch.tx_hash,
    token,
    symbol: launch.symbol,
    month: monthOf(launch.launched_at),
    pool: pool ? lower(pool) : null,
    seedWei: '0',
    seeded: false,
    complete: false,
    swaps: 0,
    excludedSwaps: 0,
    volumeWei: '0',
    volumeUsd: 0,
  }
  if (!pool) return base

  const wethIsToken0 = lower(BASE_WETH) < token
  const wethOf = (amount0: bigint, amount1: bigint) => abs(wethIsToken0 ? amount0 : amount1)
  const min = (a: bigint, b: bigint) => (a < b ? a : b)

  const seedEnd = min(startBlock + BigInt(SEED_WINDOW_SECONDS / BLOCK_SECONDS), latestBlock)
  const mints = await reader.mints(pool, startBlock, seedEnd)
  const seedWei = mints.reduce((sum, m) => sum + wethOf(m.amount0, m.amount1), 0n)

  const monthEnd = startBlock + BigInt(FIRST_MONTH_SECONDS / BLOCK_SECONDS)
  const swaps = await reader.swaps(pool, startBlock, min(monthEnd, latestBlock))

  // Self-trading by the creator does not show demand, so their swaps are left out.
  const excluded = new Set([lower(launch.creator), lower(launch.recipient)])
  const txHashes = [...new Set(swaps.map((s) => s.txHash))]
  const senders = new Map(
    await mapLimited(txHashes, 8, async (hash) => [hash, lower(await reader.txSender(hash))] as const),
  )

  let volumeWei = 0n
  let volumeUsd = 0
  let excludedSwaps = 0
  for (const swap of swaps) {
    if (excluded.has(senders.get(swap.txHash)!)) {
      excludedSwaps++
      continue
    }
    const weth = wethOf(swap.amount0, swap.amount1)
    const at = launch.launched_at + Number(swap.blockNumber - startBlock) * BLOCK_SECONDS
    volumeWei += weth
    volumeUsd += (Number(weth) / 1e18) * (await prices.usdOn(at))
  }

  return {
    ...base,
    seedWei: seedWei.toString(),
    seeded: seedWei >= MIN_SEED_WETH,
    complete: latestBlock >= monthEnd,
    swaps: swaps.length,
    excludedSwaps,
    volumeWei: volumeWei.toString(),
    volumeUsd: Math.round(volumeUsd * 100) / 100,
  }
}

export interface MonthSummary {
  month: string
  launches: number
  seeded: number
  /** Seeded launches whose first month is over; only these have final trading numbers. */
  seededComplete: number
  medianUsd: number | null
  meanUsd: number | null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function summarize(results: LaunchTrading[]): MonthSummary[] {
  const months = [...new Set(results.map((r) => r.month))].sort()
  return months.map((month) => {
    const inMonth = results.filter((r) => r.month === month)
    const done = inMonth.filter((r) => r.seeded && r.complete).map((r) => r.volumeUsd)
    return {
      month,
      launches: inMonth.length,
      seeded: inMonth.filter((r) => r.seeded).length,
      seededComplete: done.length,
      medianUsd: median(done),
      meanUsd: done.length ? Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 100) / 100 : null,
    }
  })
}

export type Outcome = 'proceed' | 're-model' | 'stop' | 'incomplete'

export interface Verdict {
  window: string[]
  outcome: Outcome
  seededPerMonth: number
  medianUsd: number | null
  reason: string
}

const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Applies the §17.1 table to the three months starting at `startMonth`. */
export function verdict(results: LaunchTrading[], startMonth: string, nowSeconds = Date.now() / 1000): Verdict {
  const window = [startMonth, nextMonth(startMonth), nextMonth(nextMonth(startMonth))]
  const seeded = results.filter((r) => r.seeded && window.includes(r.month))
  const seededPerMonth = Math.round((seeded.length / 3) * 100) / 100
  const medianUsd = median(seeded.filter((r) => r.complete).map((r) => r.volumeUsd))
  const decide = (outcome: Outcome, reason: string): Verdict => ({ window, outcome, seededPerMonth, medianUsd, reason })

  if (window[2]! >= monthOf(nowSeconds)) return decide('incomplete', 'the three-month window has not ended')
  const pending = seeded.filter((r) => !r.complete).length
  if (pending > 0) return decide('incomplete', `${pending} seeded launch(es) are still in their first month`)
  // A month with 15+ launches but a median between $25,000 and $40,000 is neither proceed nor stop,
  // so it falls to re-model, the cautious reading of the table.
  if (seededPerMonth < 5 || medianUsd === null || medianUsd < 25_000) {
    return decide('stop', 'fewer than 5 seeded launches a month, or median first-month trading below $25,000')
  }
  if (seededPerMonth >= 15 && medianUsd >= 40_000) {
    return decide('proceed', '15 or more seeded launches a month and median first-month trading of $40,000 or more')
  }
  return decide('re-model', 'between the stop and proceed lines')
}
