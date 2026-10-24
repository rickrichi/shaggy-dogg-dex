// server/src/launches/supabaseStore.ts
// Launch records in Supabase Postgres, through its REST API (PostgREST), so they survive restarts of
// a host whose local files are ephemeral. The table and the monthly function are created by
// supabase/migrations/20261024000100_launches.sql and are reachable only with the service key.

import { clip, type LaunchRepository, type LaunchRow, type MonthlyLaunches } from './store.js'

import type { VerifiedLaunch } from './verify.js'

export interface SupabaseLaunchStoreOptions {
  url: string
  serviceKey: string
  fetch?: typeof fetch
}

export class SupabaseStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'SupabaseStoreError'
  }
}

export class SupabaseLaunchStore implements LaunchRepository {
  private readonly base: string
  private readonly headers: Record<string, string>
  private readonly fetchImpl: typeof fetch

  constructor(options: SupabaseLaunchStoreOptions) {
    this.base = `${options.url.replace(/\/+$/, '')}/rest/v1`
    this.fetchImpl = options.fetch ?? fetch
    this.headers = { apikey: options.serviceKey, 'content-type': 'application/json' }
    // Legacy service_role keys are JWTs and also go in Authorization; newer sb_secret_ keys go only in apikey.
    if (options.serviceKey.startsWith('eyJ')) this.headers.authorization = `Bearer ${options.serviceKey}`
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: { ...this.headers, ...(init.headers as Record<string, string> | undefined) },
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200)
      throw new SupabaseStoreError(`Supabase ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${response.status} ${detail}`, response.status)
    }
    if (response.status === 201 || response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  async get(txHash: string): Promise<LaunchRow | undefined> {
    const rows = await this.request<LaunchRow[]>(
      `/launches?select=*&tx_hash=eq.${encodeURIComponent(txHash.toLowerCase())}&limit=1`,
    )
    return rows[0]
  }

  async record(launch: VerifiedLaunch): Promise<LaunchRow> {
    await this.request('/launches?on_conflict=tx_hash', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        tx_hash: launch.txHash.toLowerCase(),
        token_address: launch.tokenAddress.toLowerCase(),
        creator: launch.creator.toLowerCase(),
        recipient: launch.recipient.toLowerCase(),
        name: clip(launch.name, 128),
        symbol: clip(launch.symbol, 32),
        supply: launch.supply.toString(),
        block_number: Number(launch.blockNumber),
        launched_at: launch.launchedAt,
        pool_address: launch.poolAddress?.toLowerCase() ?? null,
      }),
    })
    const row = await this.get(launch.txHash)
    if (!row) throw new SupabaseStoreError('Supabase accepted the launch but did not return it', 500)
    return row
  }

  list(limit: number): Promise<LaunchRow[]> {
    return this.request<LaunchRow[]>(`/launches?select=*&order=launched_at.desc&limit=${Math.trunc(limit)}`)
  }

  async monthly(): Promise<MonthlyLaunches[]> {
    const rows = await this.request<MonthlyLaunches[]>('/rpc/launch_monthly_stats', { method: 'POST', body: '{}' })
    // Postgres bigint counts can arrive as strings; the routes and the SQLite store use numbers.
    return rows.map((r) => ({
      month: r.month,
      launches: Number(r.launches),
      creators: Number(r.creators),
      seeded: Number(r.seeded),
    }))
  }
}
