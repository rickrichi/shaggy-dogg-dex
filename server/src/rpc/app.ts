import { Hono } from 'hono'
import { parseRequest, rpcError, validateMethod } from './protocol.js'
import type { RpcRequest } from './protocol.js'
import { RpcStore } from './store.js'
import { BaseUpstream, readLimited } from './upstream.js'

export function createRpcApp(store: RpcStore, upstream: BaseUpstream, origins: string[], options: { allowSend?: boolean } = {}) {
  const app = new Hono()
  let active = 0
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    const origin = c.req.header('Origin')
    if (origin && !origins.includes(origin)) return c.json({ error: 'Origin not allowed' }, 403)
    if (origin) { c.header('Access-Control-Allow-Origin', origin); c.header('Vary', 'Origin') }
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')
      return c.body(null, 204)
    }
    await next()
    return undefined
  })
  app.onError((_error, c) => c.json({ error: 'Internal RPC gateway error' }, 500))
  app.get('/health/live', c => c.json({ service: 'Shaggy-Dogg RPC', alive: true }))
  app.get('/health/ready', async c => {
    const ready = await upstream.ready()
    return c.json({ chainId: 8453, ready }, ready ? 200 : 503)
  })
  app.get('/', c => c.json({ service: 'Shaggy-Dogg RPC', chainId: 8453, version: 1,
    endpoint: '/v1/base', authentication: 'Authorization: Bearer <API_KEY>',
    capabilities: ['HTTP JSON-RPC', 'batch requests', 'Base reads'],
    transactionSubmission: options.allowSend === true, privateRouting: false, websocketSubscriptions: false }))

  const execute = async (request: RpcRequest) => {
    const id = request.id ?? null
    const validation = validateMethod(request, options.allowSend === true)
    if (validation) return rpcError(id, -32601, validation)
    try {
      const response = await upstream.call(request)
      if (response.error) {
        const error = response.error as { code?: unknown; data?: unknown }
        // Keep EVM revert bytes usable by viem, but never echo upstream messages/URLs/headers.
        const data = typeof error.data === 'string' && /^0x[0-9a-fA-F]{0,8192}$/.test(error.data) ? error.data : undefined
        return rpcError(id, typeof error.code === 'number' && Number.isSafeInteger(error.code) ? error.code : -32000,
          'Upstream RPC rejected this call', data)
      }
      return { jsonrpc: '2.0', id, result: response.result }
    } catch { return rpcError(id, -32002, 'Upstream unavailable or response limit exceeded') }
  }

  app.post('/v1/base/:key?', async c => {
    const bearer = c.req.header('Authorization')?.match(/^Bearer (sd_[a-f0-9]{64})$/)?.[1]
    const supplied = [bearer, c.req.header('X-API-Key'), c.req.param('key')].filter((x): x is string => Boolean(x))
    if (!supplied.length || new Set(supplied).size !== 1) return c.json({ error: 'One API key required' }, 401)
    const key = store.authenticate(supplied[0]!)
    if (!key) return c.json({ error: 'Invalid or revoked API key' }, 401)
    if (active >= 16) return c.json({ error: 'Gateway at capacity; retry later' }, 503)
    if (!store.reserve(key, 1)) { c.header('Retry-After', '60'); return c.json({ error: 'API quota exceeded' }, 429) }
    active++
    try {
      if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json'))
        return c.json({ error: 'Content-Type must be application/json' }, 415)
      let payload: unknown
      try { payload = JSON.parse(await readLimited(new Response(c.req.raw.body, { headers: c.req.raw.headers }), 512 * 1024)) }
      catch { return c.json(rpcError(null, -32700, 'Invalid JSON or request size limit exceeded'), 400) }
      const batch = Array.isArray(payload)
      const items: unknown[] = Array.isArray(payload) ? payload : [payload]
      if (items.length === 0 || items.length > 25) return c.json(rpcError(null, -32600, 'Batch must contain 1 to 25 calls'), 400)
      if (items.length > 1 && !store.reserve(key, items.length - 1)) {
        c.header('Retry-After', '60'); return c.json({ error: 'API quota exceeded; batch not forwarded' }, 429)
      }
      if (!await upstream.ready()) return c.json(rpcError(null, -32002, 'Base upstream is unhealthy or on the wrong chain'), 503)
      const results = []
      let responseBytes = 0
      const deadline = Date.now() + 20000
      for (const item of items) {
        const request = parseRequest(item)
        if (!request) { results.push(rpcError(null, -32600, 'Invalid JSON-RPC request')); continue }
        let result = Date.now() > deadline ? rpcError(request.id ?? null, -32002, 'Batch execution deadline exceeded') : await execute(request)
        responseBytes += Buffer.byteLength(JSON.stringify(result))
        if (responseBytes > 8 * 1024 * 1024) result = rpcError(request.id ?? null, -32002, 'Batch response limit exceeded; use smaller requests')
        // Notifications are processed and counted, but never receive a JSON-RPC response.
        if ('id' in request) results.push(result)
      }
      if (!results.length) return c.body(null, 204)
      return c.json(batch ? results : results[0])
    } finally { active-- }
  })
  return app
}
