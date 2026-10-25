import { type Address, type Hash, parseEther } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { readChunked } from './trading-chain.js'
import {
  BLOCK_SECONDS,
  DailyWethPrice,
  FIRST_MONTH_SECONDS,
  type LaunchInput,
  type LaunchTrading,
  measureLaunch,
  median,
  monthOf,
  type PoolMint,
  type PoolSwap,
  summarize,
  type TradingChainReader,
  usdPerWeth,
  verdict,
} from './trading.js'

const POOL = `0x${'aa'.repeat(20)}` as Address
const PRICE_POOL = `0x${'bb'.repeat(20)}` as Address
// Above WETH (0x42…) in byte order, so WETH is token0 of the launch pool.
const TOKEN = `0x${'f0'.repeat(20)}` as Address
const CREATOR = `0x${'c1'.repeat(20)}` as Address
const RECIPIENT = `0x${'c2'.repeat(20)}` as Address
const TRADER = `0x${'d1'.repeat(20)}` as Address

// sqrtPriceX96 for $2,000 per WETH with WETH as token0 (WETH 18 decimals, USDC 6).
const SQRT_2000 = BigInt(Math.round(Math.sqrt(2000 / 1e12) * 2 ** 96))
const LAUNCHED_AT = Date.UTC(2026, 10, 3, 12) / 1000 // 3 Nov 2026 12:00 UTC
const START = 1_000_000n
const MONTH_BLOCKS = BigInt(FIRST_MONTH_SECONDS / BLOCK_SECONDS)

const launch: LaunchInput = {
  tx_hash: `0x${'01'.repeat(32)}`,
  token_address: TOKEN,
  creator: CREATOR,
  recipient: RECIPIENT,
  symbol: 'TEST',
  block_number: Number(START),
  launched_at: LAUNCHED_AT,
  pool_address: POOL,
}

const txHash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hash
const swap = (n: number, block: bigint, wethWei: bigint): PoolSwap => ({
  blockNumber: block,
  txHash: txHash(n),
  amount0: wethWei,
  amount1: -1n,
  sqrtPriceX96: 1n,
})

function fakeReader(opts: { mints: PoolMint[]; swaps: PoolSwap[]; senders: Record<string, Address> }) {
  const reader: TradingChainReader = {
    latestBlock: async () => START + MONTH_BLOCKS + 10n,
    poolFor: async () => PRICE_POOL,
    mints: vi.fn(async (_pool, from, to) => opts.mints.filter((m) => m.blockNumber >= from && m.blockNumber <= to)),
    swaps: vi.fn(async (pool, from, to) =>
      pool === PRICE_POOL
        ? [{ blockNumber: from, txHash: txHash(999), amount0: 1n, amount1: -1n, sqrtPriceX96: SQRT_2000 }]
        : opts.swaps.filter((s) => s.blockNumber >= from && s.blockNumber <= to),
    ),
    txSender: async (hash) => opts.senders[hash] ?? TRADER,
  }
  return reader
}

const prices = (reader: TradingChainReader) => new DailyWethPrice(reader, { block: START, timestamp: LAUNCHED_AT })

describe('usdPerWeth', () => {
  it('reads dollars per WETH from either token order', () => {
    expect(usdPerWeth(SQRT_2000, true)).toBeCloseTo(2000, 0)
    const inverted = BigInt(Math.round(Math.sqrt(1e12 / 2000) * 2 ** 96))
    expect(usdPerWeth(inverted, false)).toBeCloseTo(2000, 0)
  })
})

describe('measureLaunch', () => {
  it('counts first-month WETH volume in dollars and leaves out the creator and recipient', async () => {
    const reader = fakeReader({
      mints: [{ blockNumber: START + 5n, amount0: parseEther('0.1'), amount1: 10n ** 24n }],
      swaps: [
        swap(1, START + 100n, parseEther('1')),
        swap(2, START + 200n, -parseEther('0.5')),
        swap(3, START + 300n, parseEther('7')),
        swap(4, START + 400n, parseEther('9')),
        swap(5, START + MONTH_BLOCKS + 5n, parseEther('100')), // after the first month
      ],
      senders: { [txHash(3)]: CREATOR, [txHash(4)]: RECIPIENT },
    })
    const result = await measureLaunch(reader, launch, START + MONTH_BLOCKS + 10n, prices(reader))
    expect(result).toMatchObject({
      month: '2026-11',
      seeded: true,
      seedWei: parseEther('0.1').toString(),
      complete: true,
      swaps: 4,
      excludedSwaps: 2,
      volumeWei: parseEther('1.5').toString(),
    })
    expect(result.volumeUsd).toBeCloseTo(3000, 0)
  })

  it('does not count a pool seeded below 0.05 WETH, or liquidity added after the first day', async () => {
    const reader = fakeReader({
      mints: [
        { blockNumber: START + 5n, amount0: parseEther('0.04'), amount1: 1n },
        { blockNumber: START + 50_000n, amount0: parseEther('5'), amount1: 1n },
      ],
      swaps: [],
      senders: {},
    })
    const result = await measureLaunch(reader, launch, START + MONTH_BLOCKS + 10n, prices(reader))
    expect(result.seeded).toBe(false)
    expect(result.seedWei).toBe(parseEther('0.04').toString())
  })

  it('marks a launch still inside its first month as incomplete', async () => {
    const reader = fakeReader({ mints: [], swaps: [swap(1, START + 10n, parseEther('1'))], senders: {} })
    const result = await measureLaunch(reader, launch, START + 1_000n, prices(reader))
    expect(result.complete).toBe(false)
    expect(result.swaps).toBe(1)
  })

  it('reports a launch without a pool as unseeded with no trading', async () => {
    const reader = fakeReader({ mints: [], swaps: [], senders: {} })
    reader.poolFor = async () => null
    const result = await measureLaunch(reader, { ...launch, pool_address: null }, START + 10n, prices(reader))
    expect(result).toMatchObject({ pool: null, seeded: false, swaps: 0, volumeUsd: 0 })
  })
})

const result = (month: string, volumeUsd: number, extra: Partial<LaunchTrading> = {}): LaunchTrading => ({
  txHash: '0x',
  token: '0x',
  symbol: 'T',
  month,
  pool: '0x',
  seedWei: '0',
  seeded: true,
  complete: true,
  swaps: 1,
  excludedSwaps: 0,
  volumeWei: '0',
  volumeUsd,
  ...extra,
})

const many = (n: number, usd: number) =>
  ['2026-11', '2026-12', '2027-01'].flatMap((m) => Array.from({ length: n }, () => result(m, usd)))
const AFTER_WINDOW = Date.UTC(2027, 2, 15) / 1000

describe('summaries and the §17.1 verdict', () => {
  it('takes the median of complete seeded launches only', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
    const months = summarize([
      result('2026-11', 10),
      result('2026-11', 30),
      result('2026-11', 1_000, { complete: false }),
      result('2026-11', 0, { seeded: false }),
    ])
    expect(months).toEqual([
      { month: '2026-11', launches: 4, seeded: 3, seededComplete: 2, medianUsd: 20, meanUsd: 20 },
    ])
  })

  it('proceeds, re-models, or stops on the adopted thresholds', () => {
    expect(verdict(many(15, 40_000), '2026-11', AFTER_WINDOW).outcome).toBe('proceed')
    expect(verdict(many(14, 90_000), '2026-11', AFTER_WINDOW).outcome).toBe('re-model')
    expect(verdict(many(20, 30_000), '2026-11', AFTER_WINDOW).outcome).toBe('re-model')
    expect(verdict(many(4, 90_000), '2026-11', AFTER_WINDOW).outcome).toBe('stop')
    expect(verdict(many(20, 24_999), '2026-11', AFTER_WINDOW).outcome).toBe('stop')
  })

  it('ignores launches outside the window and waits until every first month is over', () => {
    const inWindow = many(15, 50_000)
    expect(verdict([...inWindow, ...many(30, 0).map((r) => ({ ...r, month: '2027-02' }))], '2026-11', AFTER_WINDOW))
      .toMatchObject({ outcome: 'proceed', seededPerMonth: 15 })
    expect(verdict(inWindow, '2026-11', Date.UTC(2027, 0, 20) / 1000).outcome).toBe('incomplete')
    const pending = [...inWindow, result('2027-01', 0, { complete: false })]
    expect(verdict(pending, '2026-11', AFTER_WINDOW).outcome).toBe('incomplete')
  })

  it('labels months in UTC', () => {
    expect(monthOf(Date.UTC(2026, 10, 30, 23, 59) / 1000)).toBe('2026-11')
    expect(monthOf(Date.UTC(2026, 11, 1, 0, 0) / 1000)).toBe('2026-12')
  })
})

describe('readChunked', () => {
  it('covers the range exactly and shrinks chunks the node refuses', async () => {
    const calls: Array<[bigint, bigint]> = []
    const read = async (from: bigint, to: bigint) => {
      if (to - from + 1n > 4n) throw new Error('range too large')
      calls.push([from, to])
      return [from]
    }
    const out = await readChunked(0n, 9n, read, { initialSpan: 16n, minSpan: 2n, retryDelayMs: 0 })
    expect(calls).toEqual([
      [0n, 3n],
      [4n, 7n],
      [8n, 9n],
    ])
    expect(out).toEqual([0n, 4n, 8n])
  })

  it('gives up once the chunk is already at the minimum', async () => {
    await expect(readChunked(0n, 9n, async () => Promise.reject(new Error('down')), { minSpan: 4n, initialSpan: 8n, retryDelayMs: 0 }))
      .rejects.toThrow('down')
  })
})
