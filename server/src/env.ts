// server/src/env.ts

import 'dotenv/config';

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8788),
  ORIGIN: z.url().default('http://localhost:5173'),

  // Aggregator (0x-style)
  AGGREGATOR_URL: z.url().default('https://api.0x.org'),
  AGGREGATOR_API_KEY: z.string().min(10).optional(),


  // Shaggy Dogg Crypto Market-Data: the only price source.
  MARKET_DATA_URL: z.url().default('http://localhost:8010').transform((u) => u.replace(/\/+$/, '')),

  // Webhook shared secret (if you enable DB webhooks later)
  SUPABASE_WEBHOOK_SECRET: z.string().min(10).optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  // Admin panel: wallet sign-in (SIWE). Comma-separated EVM addresses allowed to administer the DEX.
  // Empty = admin sign-in disabled.
  ADMIN_WALLETS: z
    .string()
    .default('')
    .transform((raw, ctx) => {
      const list = raw.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
      for (const a of list) {
        if (!/^0x[0-9a-f]{40}$/.test(a)) {
          ctx.addIssue({ code: 'custom', message: `ADMIN_WALLETS: invalid address ${a}` });
        }
      }
      return list;
    }),
  // SQLite file holding admin settings and sessions (relative to the server working directory).
  ADMIN_DB_PATH: z.string().default('data/admin.sqlite'),
  ADMIN_SESSION_HOURS: z.coerce.number().positive().max(72).default(8),

  // Launchpad launch tracking: Base RPC used to verify reported launches, and its SQLite file.
  BASE_RPC_URL: z.url().default('https://mainnet.base.org'),
  LAUNCH_DB_PATH: z.string().default('data/launches.sqlite'),
  // Set both to keep launch records in Supabase instead (survives restarts of ephemeral hosts).
  // The service key is server-only; never expose it through a VITE_ variable.
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  // SSR client entry (used by server-side renderer)
  SSR_CLIENT_ENTRY: z.string().default('/src/main.tsx'),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);
