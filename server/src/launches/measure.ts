// server/src/launches/measure.ts
// Measures first-month trading for every recorded launch and applies the §17.1 thresholds.
//
//   npm --prefix server run launches:measure -- [--api URL] [--rpc URL] [--window YYYY-MM] [--out FILE]
//
// --api     where to read launch records (default https://api.lumsian.com; public GET /api/launches)
// --rpc     Base RPC (default BASE_RPC_URL or https://base-rpc.publicnode.com; mainnet.base.org refuses eth_getLogs)
// --window  first month of the three-month window, for a verdict
// --out     also write the full JSON report to this file
// Read-only: it never signs or sends anything.

import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

import { viemTradingReader } from './trading-chain.js'
import { DailyWethPrice, type LaunchInput, measureLaunch, summarize, verdict } from './trading.js'

const { values } = parseArgs({
  options: {
    api: { type: 'string', default: 'https://api.lumsian.com' },
    rpc: { type: 'string', default: process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com' },
    window: { type: 'string' },
    out: { type: 'string' },
  },
})
if (values.window && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.window)) {
  throw new Error('--window must look like 2026-11')
}

const response = await fetch(`${values.api.replace(/\/+$/, '')}/api/launches?limit=500`)
if (!response.ok) throw new Error(`Launch list request failed: HTTP ${response.status}`)
const { launches } = (await response.json()) as { launches: LaunchInput[] }
if (launches.length === 500) console.warn('Warning: 500 launches returned, the list may be truncated.')

const client = createPublicClient({ chain: base, transport: http(values.rpc, { retryCount: 3 }) })
const reader = viemTradingReader(client)
const latest = await client.getBlock()
const prices = new DailyWethPrice(reader, { block: latest.number, timestamp: Number(latest.timestamp) })

const results = []
for (const launch of launches) {
  console.error(`Measuring ${launch.symbol} (${launch.token_address})...`)
  results.push(await measureLaunch(reader, launch, latest.number, prices))
}

const report = {
  measuredAt: new Date().toISOString(),
  latestBlock: latest.number.toString(),
  launches: results,
  months: summarize(results),
  ...(values.window ? { verdict: verdict(results, values.window) } : {}),
}

console.table(report.months)
if (report.verdict) console.log('Verdict:', report.verdict)
if (values.out) {
  writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`)
  console.error(`Report written to ${values.out}`)
}
