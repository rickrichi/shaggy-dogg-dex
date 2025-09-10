import type { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { env } from '../env.js'
import { makeTtlCache } from '../utils/cache.js'
import { z } from 'zod'

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(a => `0x${a.slice(2).toLowerCase()}`)
const QuoteReq = z.object({
  chainId: z.number().int().positive(),
  sellToken: Address,
  buyToken: Address,
  sellAmount: z.string().regex(/^\d+$/).optional(),
  buyAmount: z.string().regex(/^\d+$/).optional(),
  takerAddress: Address.optional(),
  slippageBps: z.number().int().min(1).max(500).default(50),
}).refine(v => (v.sellAmount ? !v.buyAmount : !!v.buyAmount),
  { path: ['sellAmount'], message: 'Provide exactly one of sellAmount or buyAmount' })

type QuoteData = {
  to: string; data: string; value: string
  allowanceTarget?: string
  buyAmount: string; sellAmount: string
  gas?: string; gasPrice?: string
  sources?: { name: string; proportion: string }[]
}
type Ok = { success: true; data: QuoteData }
type Fail = { success: false; error: string; chainId?: number }

const cache = makeTtlCache<Ok>(8_000)

export function mountQuoteRoutes(app: Hono): void {
  app.post('/api/quote', zValidator('json', QuoteReq), async (c) => {
    const req = c.req.valid('json')
    if (!env.AGGREGATOR_URL) return c.json<Fail>({ success: false, error: 'aggregator_unconfigured' }, 500)

    const key = JSON.stringify(req)
    const hit = cache.get(key)
    if (hit) return c.json(hit)

    const url = new URL(`${env.AGGREGATOR_URL.replace(/\/+$/, '')}/swap/v1/quote`)
    if (req.sellAmount) url.searchParams.set('sellAmount', req.sellAmount)
    if (req.buyAmount)  url.searchParams.set('buyAmount',  req.buyAmount)
    url.searchParams.set('sellToken', req.sellToken)
    url.searchParams.set('buyToken',  req.buyToken)
    url.searchParams.set('slippagePercentage', String(req.slippageBps / 10_000))
    if (req.takerAddress) url.searchParams.set('takerAddress', req.takerAddress)
    url.searchParams.set('chainId', String(req.chainId))

    const headers: Record<string, string> = { accept: 'application/json' }
    if (env.AGGREGATOR_API_KEY) headers['0x-api-key'] = env.AGGREGATOR_API_KEY

    const r = await fetch(url, { headers })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return c.json<Fail>({ success: false, error: `upstream_${r.status}${body ? `:${body}` : ''}`, chainId: req.chainId }, 502)
    }

    const j = await r.json() as Record<string, unknown>
    const out: Ok = {
      success: true,
      data: {
        to: String(j['to'] ?? ''),
        data: String(j['data'] ?? ''),
        value: String(j['value'] ?? '0'),
        allowanceTarget: typeof j['allowanceTarget'] === 'string' ? j['allowanceTarget'] : undefined,
        buyAmount: String(j['buyAmount'] ?? '0'),
        sellAmount: String(j['sellAmount'] ?? '0'),
        gas: typeof j['gas'] === 'string' ? j['gas'] : undefined,
        gasPrice: typeof j['gasPrice'] === 'string' ? j['gasPrice'] : undefined,
        sources: Array.isArray(j['sources']) ? (j['sources'] as QuoteData['sources']) : undefined,
      },
    }

    cache.set(key, out)
    return c.json(out)
  })
}
