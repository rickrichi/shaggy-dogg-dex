// server/src/launches/store.ts
// Launchpad launches verified on Base, in a local SQLite file. This is the launch count that tests
// MCHOW model v0.4's launchpad assumption, so only verified rows are ever written.

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { VerifiedLaunch } from './verify.js'

export interface LaunchRow {
  tx_hash: string
  token_address: string
  creator: string
  recipient: string
  name: string
  symbol: string
  supply: string
  block_number: number
  launched_at: number
  pool_address: string | null
  recorded_at: string
}

export interface MonthlyLaunches {
  month: string
  launches: number
  creators: number
  seeded: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS launches (
  tx_hash TEXT PRIMARY KEY,
  token_address TEXT NOT NULL UNIQUE,
  creator TEXT NOT NULL,
  recipient TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  supply TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  launched_at INTEGER NOT NULL,
  pool_address TEXT,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS launches_launched_at ON launches (launched_at);
`

/** Token names and symbols are creator-chosen; store a bounded copy. */
const clip = (value: string, max: number) => value.slice(0, max)

export class LaunchStore {
  readonly db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(SCHEMA)
  }

  get(txHash: string): LaunchRow | undefined {
    return this.db.prepare(`SELECT * FROM launches WHERE tx_hash = ?`).get(txHash.toLowerCase()) as
      | LaunchRow
      | undefined
  }

  /** Idempotent: recording the same transaction twice keeps the first row. */
  record(launch: VerifiedLaunch): LaunchRow {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO launches (tx_hash, token_address, creator, recipient, name, symbol, supply,
           block_number, launched_at, pool_address, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        launch.txHash.toLowerCase(),
        launch.tokenAddress.toLowerCase(),
        launch.creator.toLowerCase(),
        launch.recipient.toLowerCase(),
        clip(launch.name, 128),
        clip(launch.symbol, 32),
        launch.supply.toString(),
        Number(launch.blockNumber),
        launch.launchedAt,
        launch.poolAddress?.toLowerCase() ?? null,
        new Date().toISOString(),
      )
    return this.get(launch.txHash)!
  }

  list(limit: number): LaunchRow[] {
    return this.db
      .prepare(`SELECT * FROM launches ORDER BY launched_at DESC LIMIT ?`)
      .all(limit) as unknown as LaunchRow[]
  }

  /** Launches per calendar month (UTC), with distinct creator wallets and how many have a pool. */
  monthly(): MonthlyLaunches[] {
    return this.db
      .prepare(
        `SELECT strftime('%Y-%m', launched_at, 'unixepoch') AS month,
                COUNT(*) AS launches,
                COUNT(DISTINCT creator) AS creators,
                COUNT(pool_address) AS seeded
         FROM launches GROUP BY month ORDER BY month`,
      )
      .all() as unknown as MonthlyLaunches[]
  }
}
