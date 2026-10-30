import { Hono } from 'hono'

import { mountPaymasterRoutes } from '../../server/src/routes/paymaster.js'

import type { Env } from '../../server/src/env.js'

export const config = { runtime: 'edge' }

const app = new Hono()

mountPaymasterRoutes(app, {
  BASE_RPC_URL: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
  PAYMASTER_ADDRESS: process.env.PAYMASTER_ADDRESS,
  PAYMASTER_SIGNER_PRIVATE_KEY: process.env.PAYMASTER_SIGNER_PRIVATE_KEY,
  PAYMASTER_BUNDLER_URL: process.env.PAYMASTER_BUNDLER_URL,
  PAYMASTER_ALLOWED_WALLETS: (process.env.PAYMASTER_ALLOWED_WALLETS ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean),
} as Env)

export default function handler(request: Request): Promise<Response> {
  return app.fetch(request)
}
