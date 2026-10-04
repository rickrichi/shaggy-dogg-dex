import { afterEach, describe, expect, it } from 'vitest'
import { createRpcApp } from './app.js'
import { RpcStore } from './store.js'
import { BaseUpstream } from './upstream.js'
import { parseRequest, validateMethod } from './protocol.js'

const databases: RpcStore[] = []
afterEach(() => { for (const db of databases.splice(0)) db.db.close() })
function setup(options: { chain?: string; error?: boolean; stale?: boolean; rpm?: number } = {}) {
  const store = new RpcStore(':memory:'); databases.push(store)
  const key = store.create('test project', options.rpm ?? 20, 100)
  const forwarded: string[] = []
  const fetcher: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { method: string; id: unknown }
    forwarded.push(request.method)
    const result = request.method === 'eth_chainId' ? options.chain ?? '0x2105'
      : request.method === 'eth_getBlockByNumber' ? { timestamp: `0x${Math.floor(Date.now() / 1000 - (options.stale ? 600 : 0)).toString(16)}` }
        : '0x123'
    return Response.json({ jsonrpc: '2.0', id: request.id,
      ...(options.error && request.method === 'eth_call'
        ? { error: { code: 3, message: 'Secret provider https://private.example/key', data: '0xdeadbeef' } }
        : { result }) })
  }
  const app = createRpcApp(store, new BaseUpstream('http://127.0.0.1:8545', fetcher), ['http://localhost:5173'])
  const post = (body: unknown, secret = key.secret) => app.request('/v1/base', { method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { app, post, key, store, forwarded }
}
const call = (id: number | null = 0, method = 'eth_blockNumber') => ({ jsonrpc: '2.0', id, method, params: [] })

describe('Shaggy-Dogg RPC gateway', () => {
  it('rejects missing/revoked keys before forwarding and stores only hashes', async () => {
    const { app, post, store, key, forwarded } = setup()
    expect((await app.request('/v1/base', { method: 'POST' })).status).toBe(401)
    expect(store.db.prepare('SELECT hash FROM rpc_keys').get()?.hash).not.toBe(key.secret)
    expect(store.revoke(key.id)).toBe(true)
    expect((await post(call())).status).toBe(401)
    expect(forwarded).toEqual([])
  })
  it('preserves zero/null ids and supports wallet URL keys', async () => {
    const { app, key, post } = setup()
    expect(await (await post(call(0))).json()).toEqual({ jsonrpc: '2.0', id: 0, result: '0x123' })
    expect(await (await post(call(null))).json()).toEqual({ jsonrpc: '2.0', id: null, result: '0x123' })
    expect((await app.request(`/v1/base/${key.secret}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call()) })).status).toBe(200)
  })
  it('counts each batch member and omits notification responses', async () => {
    const { post, forwarded } = setup({ rpm: 3 })
    const response = await post([call(1), { jsonrpc: '2.0', method: 'eth_blockNumber' }, call(2)])
    expect((await response.json() as unknown[]).length).toBe(2)
    const count = forwarded.length
    expect((await post(call())).status).toBe(429)
    expect(forwarded.length).toBe(count)
  })
  it('processes notifications without a body, rejects empty batches and invalid ids', async () => {
    const { post } = setup()
    expect((await post({ jsonrpc: '2.0', method: 'eth_blockNumber' })).status).toBe(204)
    expect((await post([])).status).toBe(400)
    expect(parseRequest({ ...call(), id: {} })).toBeNull()
  })
  it('does not forward privileged methods or signed transactions', async () => {
    const { post, forwarded } = setup()
    for (const method of ['personal_unlockAccount', 'admin_peers', 'eth_sendRawTransaction', 'debug_traceTransaction']) {
      const response = await post(call(1, method))
      expect((await response.json() as { error: { code: number } }).error.code).toBe(-32601)
      expect(forwarded).not.toContain(method)
    }
  })
  it('rejects wrong chains and stale upstream heads', async () => {
    for (const options of [{ chain: '0x1' }, { stale: true }]) {
      const { post, forwarded } = setup(options)
      expect((await post(call())).status).toBe(503)
      expect(forwarded).not.toContain('eth_blockNumber')
    }
  })
  it('redacts provider errors while preserving EVM revert bytes', async () => {
    const { post } = setup({ error: true })
    const text = await (await post(call(1, 'eth_call'))).text()
    expect(text).not.toContain('private.example')
    expect(JSON.parse(text).error.data).toBe('0xdeadbeef')
  })
  it('bounds log ranges and blocks disallowed origins', async () => {
    expect(validateMethod({ ...call(), method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x7cf' }] })).toBeNull()
    expect(validateMethod({ ...call(), method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x7d0' }] })).not.toBeNull()
    const { app } = setup()
    expect((await app.request('/v1/base', { method: 'OPTIONS', headers: { Origin: 'https://unexpected.example' } })).status).toBe(403)
    expect((await app.request('/v1/base', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })).headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })
  it('does not partially consume a rejected daily reservation and resets windows', () => {
    const { store, key } = setup()
    const account = store.authenticate(key.secret)!
    expect(store.reserve(account, 20, 1800000000000)).toBe(true)
    expect(store.reserve(account, 1, 1800000000000)).toBe(false)
    expect(store.reserve(account, 20, 1800000060000)).toBe(true)
    expect(store.usage(key.id).find(row => String(row.period).startsWith('d:'))?.calls).toBe(40)
  })
})

describe('opt-in transaction submission', () => {
  it('is rejected unless enabled and validates the raw payload', () => {
    const req = { jsonrpc: '2.0' as const, id: 1, method: 'eth_sendRawTransaction', params: ['0x02f8'] }
    expect(validateMethod(req)).not.toBeNull()
    expect(validateMethod(req, true)).toBeNull()
    expect(validateMethod({ ...req, params: ['nothex'] }, true)).not.toBeNull()
    expect(validateMethod({ ...req, params: ['0x02', '0x03'] }, true)).not.toBeNull()
  })
})
