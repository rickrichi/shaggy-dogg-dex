// server/src/admin/store.ts
// Admin settings + wallet sessions in a local SQLite file (node:sqlite, no external service).
// Row shapes mirror the former Supabase tables so the frontend schemas stay unchanged.

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export interface DexSettingsRow {
  id: string
  default_slippage_bps: number
  max_gas_price_gwei: number
  auto_refresh: boolean
  updated_at: string
}

export interface AdminChainRow {
  chain: string
  enabled: boolean
  updated_at: string
}

export interface FeaturedTokenRow {
  id: string
  chain: string
  address: string
  symbol: string | null
  name: string | null
  created_at: string
}

export interface TokenListRow {
  id: string
  url: string
  name: string
  enabled: boolean
  created_at: string
}

export interface AdminSession {
  address: string
  expiresAt: number
}

export class ConflictError extends Error {}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dex_settings (
  id TEXT PRIMARY KEY,
  default_slippage_bps INTEGER NOT NULL CHECK (default_slippage_bps BETWEEN 0 AND 10000),
  max_gas_price_gwei INTEGER NOT NULL CHECK (max_gas_price_gwei BETWEEN 1 AND 10000),
  auto_refresh INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_chains (
  chain TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_featured_tokens (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  address TEXT NOT NULL CHECK (address GLOB '0x[0-9a-f]*' AND length(address) = 42),
  symbol TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (chain, address)
);
CREATE TABLE IF NOT EXISTS admin_token_lists (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const iso = () => new Date().toISOString()

function unique<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError('Already exists')
    }
    throw error
  }
}

export class AdminStore {
  readonly db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    this.db.exec(SCHEMA)
    this.db
      .prepare(
        `INSERT OR IGNORE INTO dex_settings (id, default_slippage_bps, max_gas_price_gwei, auto_refresh, updated_at)
         VALUES ('default', 50, 20, 1, ?)`,
      )
      .run(iso())
  }

  // ── settings ───────────────────────────────────────────────────────────────
  getSettings(): DexSettingsRow {
    const row = this.db.prepare(`SELECT * FROM dex_settings WHERE id = 'default'`).get() as
      | (Omit<DexSettingsRow, 'auto_refresh'> & { auto_refresh: number })
      | undefined
    if (!row) throw new Error('dex_settings default row missing')
    return { ...row, auto_refresh: row.auto_refresh === 1 }
  }

  updateSettings(input: { default_slippage_bps: number; max_gas_price_gwei: number; auto_refresh: boolean }) {
    this.db
      .prepare(
        `UPDATE dex_settings SET default_slippage_bps = ?, max_gas_price_gwei = ?, auto_refresh = ?, updated_at = ?
         WHERE id = 'default'`,
      )
      .run(input.default_slippage_bps, input.max_gas_price_gwei, input.auto_refresh ? 1 : 0, iso())
    return this.getSettings()
  }

  // ── chains ─────────────────────────────────────────────────────────────────
  listChains(): AdminChainRow[] {
    const rows = this.db.prepare('SELECT * FROM admin_chains ORDER BY chain').all() as Array<
      Omit<AdminChainRow, 'enabled'> & { enabled: number }
    >
    return rows.map((r) => ({ ...r, enabled: r.enabled === 1 }))
  }

  upsertChain(chain: string, enabled: boolean) {
    this.db
      .prepare(
        `INSERT INTO admin_chains (chain, enabled, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (chain) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(chain, enabled ? 1 : 0, iso())
  }

  deleteChain(chain: string): boolean {
    return Number(this.db.prepare('DELETE FROM admin_chains WHERE chain = ?').run(chain).changes) > 0
  }

  // ── featured tokens ────────────────────────────────────────────────────────
  listFeaturedTokens(): FeaturedTokenRow[] {
    return this.db
      .prepare('SELECT * FROM admin_featured_tokens ORDER BY created_at DESC')
      .all() as unknown as FeaturedTokenRow[]
  }

  addFeaturedToken(input: { chain: string; address: string; symbol?: string | null | undefined; name?: string | null | undefined }) {
    const row: FeaturedTokenRow = {
      id: randomUUID(),
      chain: input.chain,
      address: input.address.toLowerCase(),
      symbol: input.symbol || null,
      name: input.name || null,
      created_at: iso(),
    }
    unique(() =>
      this.db
        .prepare('INSERT INTO admin_featured_tokens (id, chain, address, symbol, name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.id, row.chain, row.address, row.symbol, row.name, row.created_at),
    )
    return row
  }

  removeFeaturedToken(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM admin_featured_tokens WHERE id = ?').run(id).changes) > 0
  }

  // ── token lists ────────────────────────────────────────────────────────────
  listTokenLists(): TokenListRow[] {
    const rows = this.db.prepare('SELECT * FROM admin_token_lists ORDER BY created_at DESC').all() as Array<
      Omit<TokenListRow, 'enabled'> & { enabled: number }
    >
    return rows.map((r) => ({ ...r, enabled: r.enabled === 1 }))
  }

  addTokenList(input: { url: string; name: string; enabled?: boolean | undefined }) {
    const row: TokenListRow = {
      id: randomUUID(),
      url: input.url,
      name: input.name,
      enabled: input.enabled ?? true,
      created_at: iso(),
    }
    unique(() =>
      this.db
        .prepare('INSERT INTO admin_token_lists (id, url, name, enabled, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(row.id, row.url, row.name, row.enabled ? 1 : 0, row.created_at),
    )
    return row
  }

  setTokenListEnabled(id: string, enabled: boolean): boolean {
    return (
      Number(this.db.prepare('UPDATE admin_token_lists SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id).changes) > 0
    )
  }

  removeTokenList(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM admin_token_lists WHERE id = ?').run(id).changes) > 0
  }

  // ── sign-in nonces (single use) ────────────────────────────────────────────
  createNonce(): string {
    // SIWE nonces must be alphanumeric, >= 8 chars.
    const nonce = randomBytes(16).toString('hex')
    this.db.prepare('INSERT INTO admin_nonces (nonce, created_at) VALUES (?, ?)').run(nonce, Date.now())
    return nonce
  }

  /** Atomically consumes a nonce; false if unknown, already used, or older than maxAgeMs. */
  consumeNonce(nonce: string, maxAgeMs: number): boolean {
    const deleted = this.db
      .prepare('DELETE FROM admin_nonces WHERE nonce = ? AND created_at >= ?')
      .run(nonce, Date.now() - maxAgeMs)
    return Number(deleted.changes) === 1
  }

  // ── sessions (only a hash of the cookie token is stored) ───────────────────
  createSession(address: string, ttlMs: number): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + ttlMs
    this.db
      .prepare('INSERT INTO admin_sessions (token_hash, address, expires_at) VALUES (?, ?, ?)')
      .run(sha256(token), address.toLowerCase(), expiresAt)
    return { token, expiresAt }
  }

  getSession(token: string): AdminSession | null {
    const row = this.db
      .prepare('SELECT address, expires_at FROM admin_sessions WHERE token_hash = ?')
      .get(sha256(token)) as { address: string; expires_at: number } | undefined
    if (!row) return null
    if (row.expires_at <= Date.now()) {
      this.deleteSession(token)
      return null
    }
    return { address: row.address, expiresAt: row.expires_at }
  }

  deleteSession(token: string) {
    this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token))
  }

  purgeExpired(nonceMaxAgeMs: number) {
    this.db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now())
    this.db.prepare('DELETE FROM admin_nonces WHERE created_at < ?').run(Date.now() - nonceMaxAgeMs)
  }
}
