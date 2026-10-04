import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export interface ApiKey {
  id: string
  name: string
  per_minute: number
  per_day: number
  revoked: number
}
const digest = (secret: string) => createHash('sha256').update(secret).digest('hex')

export class RpcStore {
  readonly db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS rpc_keys (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT UNIQUE NOT NULL,
        per_minute INTEGER NOT NULL, per_day INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rpc_usage (
        key_id TEXT NOT NULL, period TEXT NOT NULL, calls INTEGER NOT NULL,
        PRIMARY KEY(key_id, period));`)
  }
  create(name: string, perMinute = 120, perDay = 10000) {
    if (!name.trim() || name.length > 80 || !Number.isSafeInteger(perMinute) || perMinute < 1 ||
      !Number.isSafeInteger(perDay) || perDay < 1) throw new Error('Invalid name or quotas')
    const secret = `sd_${randomBytes(32).toString('hex')}`
    const id = randomUUID()
    this.db.prepare('INSERT INTO rpc_keys (id,name,hash,per_minute,per_day) VALUES (?,?,?,?,?)')
      .run(id, name.trim(), digest(secret), perMinute, perDay)
    return { id, secret }
  }
  authenticate(secret: string): ApiKey | undefined {
    if (!/^sd_[0-9a-f]{64}$/.test(secret)) return undefined
    return this.db.prepare('SELECT id,name,per_minute,per_day,revoked FROM rpc_keys WHERE hash=? AND revoked=0')
      .get(digest(secret)) as unknown as ApiKey | undefined
  }
  list() {
    return this.db.prepare('SELECT id,name,per_minute,per_day,revoked FROM rpc_keys').all()
  }
  revoke(id: string) {
    return this.db.prepare('UPDATE rpc_keys SET revoked=1 WHERE id=?').run(id).changes === 1
  }
  usage(id: string) {
    return this.db.prepare('SELECT period,calls FROM rpc_usage WHERE key_id=? ORDER BY period DESC LIMIT 100').all(id)
  }
  // A transaction makes quotas consistent across concurrent worker processes sharing this file.
  reserve(key: ApiKey, calls: number, now = Date.now()) {
    const minute = `m:${Math.floor(now / 60000)}`
    const day = `d:${new Date(now).toISOString().slice(0, 10)}`
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const active = this.db.prepare('SELECT revoked FROM rpc_keys WHERE id=?').get(key.id)
      if (!active || active.revoked !== 0) { this.db.exec('ROLLBACK'); return false }
      for (const [period, limit] of [[minute, key.per_minute], [day, key.per_day]] as const) {
        const row = this.db.prepare('SELECT calls FROM rpc_usage WHERE key_id=? AND period=?').get(key.id, period)
        if (Number(row?.calls ?? 0) + calls > limit) { this.db.exec('ROLLBACK'); return false }
      }
      for (const period of [minute, day]) {
        this.db.prepare(`INSERT INTO rpc_usage VALUES (?,?,?) ON CONFLICT(key_id,period)
          DO UPDATE SET calls=calls+excluded.calls`).run(key.id, period, calls)
      }
      this.db.exec('COMMIT')
      return true
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  prune(now = Date.now()) {
    this.db.prepare("DELETE FROM rpc_usage WHERE period LIKE 'm:%' AND CAST(substr(period,3) AS INTEGER) < ?")
      .run(Math.floor(now / 60000) - 60)
    this.db.prepare("DELETE FROM rpc_usage WHERE period LIKE 'd:%' AND period < ?")
      .run(`d:${new Date(now - 90 * 86400000).toISOString().slice(0, 10)}`)
  }
}
