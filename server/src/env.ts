// server/src/env.ts

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  ORIGIN: z.url().default('http://localhost:5173'),

  // Aggregator (0x-style)
  AGGREGATOR_URL: z.url().default('https://api.0x.org'),
  AGGREGATOR_API_KEY: z.string().min(10).optional(),

  // Pricing provider (CoinGecko)
  COINGECKO_API_KEY: z.string().min(10).optional(),
  PRICE_API_FALLBACK: z.url().default('https://api.coingecko.com/api/v3'),

  // Webhook shared secret (if you enable DB webhooks later)
  SUPABASE_WEBHOOK_SECRET: z.string().min(10).optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);