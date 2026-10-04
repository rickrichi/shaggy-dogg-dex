import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createRpcApp } from './app.js'
import { RpcStore } from './store.js'
import { BaseUpstream } from './upstream.js'

const store = new RpcStore(process.env.SHAGGY_RPC_DB ?? 'data/rpc.sqlite')
const upstream = new BaseUpstream(process.env.SHAGGY_RPC_UPSTREAM ?? 'http://127.0.0.1:8545')
const origins = (process.env.SHAGGY_RPC_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5174').split(',').map(s => s.trim()).filter(Boolean)
const port = Number(process.env.SHAGGY_RPC_PORT ?? 8790)
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SHAGGY_RPC_PORT')
const app = createRpcApp(store, upstream, origins, { allowSend: process.env.SHAGGY_RPC_ALLOW_SEND === 'true' })
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`Shaggy-Dogg RPC listening on http://127.0.0.1:${port}; upstream URL and API keys are not logged`)
})
if ('requestTimeout' in server) server.requestTimeout = 15000
if ('headersTimeout' in server) server.headersTimeout = 10000
const cleanup = setInterval(() => store.prune(), 60000)
cleanup.unref()
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  clearInterval(cleanup)
  server.close(() => { store.db.close(); process.exit(0) })
})
