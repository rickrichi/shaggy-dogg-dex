import type { RpcRequest } from './protocol.js'

export async function readLimited(response: Response, maximum: number) {
  if (Number(response.headers.get('content-length') ?? 0) > maximum) throw new Error('Body too large')
  if (!response.body) return ''
  const reader = response.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  const deadline = Date.now() + 10000
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Body timeout')), Math.max(1, deadline - Date.now()))
        }),
      ]).finally(() => clearTimeout(timer))
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error('Body too large')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { await reader.cancel().catch(() => undefined) }
}

export class BaseUpstream {
  private checkedAt = 0
  private healthy = false
  private checking: Promise<boolean> | undefined
  constructor(private readonly endpoint: string, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new Error('Invalid RPC upstream URL')
    if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Remote upstreams require HTTPS; local nodes can use loopback HTTP')
  }
  async call(request: RpcRequest): Promise<Record<string, unknown>> {
    const response = await this.fetcher(this.endpoint, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, id: request.id ?? 1 }), signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Upstream unavailable')
    const data: unknown = JSON.parse(await readLimited(response, 4 * 1024 * 1024))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid upstream response')
    const result = data as Record<string, unknown>
    if (result.jsonrpc !== '2.0' || result.id !== (request.id ?? 1) ||
      ('result' in result) === ('error' in result)) throw new Error('Invalid upstream response')
    return result
  }
  async ready(): Promise<boolean> {
    if (this.checking) return this.checking
    if (Date.now() - this.checkedAt < 15000) return this.healthy
    this.checking = this.checkHealth()
    try { return await this.checking } finally { this.checking = undefined }
  }
  private async checkHealth(): Promise<boolean> {
    // Do not share a successful health value across a failed subsequent check.
    this.healthy = false
    try {
      const chain = await this.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' })
      const block = await this.call({ jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['latest', false] })
      const head = block.result as { timestamp?: string } | undefined
      const timestamp = head?.timestamp && /^0x[0-9a-f]+$/i.test(head.timestamp) ? Number(BigInt(head.timestamp)) * 1000 : 0
      this.healthy = chain.result === '0x2105' && timestamp > Date.now() - 180000 && timestamp < Date.now() + 30000
    } catch { this.healthy = false }
    this.checkedAt = Date.now()
    return this.healthy
  }
}
