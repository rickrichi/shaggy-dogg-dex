// src/lib/adminSchemas.ts
import { z } from 'zod';

export const SettingsSchema = z.object({
  id: z.literal(1),
  slippage_bps: z.number().int().min(0).max(10_000),
  max_gas_gwei: z.number().int().positive(),
  auto_refresh: z.boolean(),
  updated_at: z.union([z.coerce.date(), z.string().pipe(z.coerce.date())]),
  updated_by: z.uuid().nullable().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const FeaturedTokenSchema = z.object({
  chain_id: z.number().int(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address'),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(255),
  logo_uri: z.url().optional().nullable(),
  created_at: z.union([z.coerce.date(), z.string().pipe(z.coerce.date())]).optional(),
  created_by: z.uuid().optional().nullable(),
});
export type FeaturedToken = z.infer<typeof FeaturedTokenSchema>;

export const TokenListSchema = z.object({
  url: z.url(),
  name: z.string().min(1),
  added_at: z.union([z.coerce.date(), z.string().pipe(z.coerce.date())]).optional(),
  added_by: z.uuid().optional().nullable(),
});
export type TokenList = z.infer<typeof TokenListSchema>;

// Input schemas for form validation (stricter, no optional server fields)
export const SettingsInputSchema = SettingsSchema.pick({
  slippage_bps: true,
  max_gas_gwei: true,
  auto_refresh: true,
});
export type SettingsInput = z.infer<typeof SettingsInputSchema>;

export const FeaturedTokenInputSchema = FeaturedTokenSchema.pick({
  chain_id: true,
  address: true,
  symbol: true,
  name: true,
  decimals: true,
  logo_uri: true,
});
export type FeaturedTokenInput = z.infer<typeof FeaturedTokenInputSchema>;

export const TokenListInputSchema = TokenListSchema.pick({
  url: true,
  name: true,
});
export type TokenListInput = z.infer<typeof TokenListInputSchema>;