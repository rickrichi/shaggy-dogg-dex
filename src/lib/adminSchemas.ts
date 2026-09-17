// src/lib/adminSchemas.ts
import { z } from "zod";

/**
 * Schema definitions matching your Supabase database
 * Based on: DeFi Platform User and Token Management Schema
 */

// Modern Zod v4 date coercion helper
const dateSchema = z.coerce.date();

// ============================================================================
// User Profiles
// ============================================================================

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(30).nullable().optional(),
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  bio: z.string().nullable().optional(),
  role: z.enum(["admin", "user"]).nullable().optional(),
  created_at: dateSchema.optional(),
  updated_at: dateSchema.optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileInputSchema = ProfileSchema.pick({
  username: true,
  full_name: true,
  avatar_url: true,
  website: true,
  bio: true,
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

// ============================================================================
// DEX Settings (table: dex_settings)
// ============================================================================

export const DexSettingsSchema = z.object({
  id: z.string(), // Primary key (typically 'default')
  default_slippage_bps: z.number().int().min(0).max(10_000),
  max_gas_price_gwei: z.number().int().min(1).max(10_000),
  auto_refresh: z.boolean(),
  updated_at: dateSchema,
});
export type DexSettings = z.infer<typeof DexSettingsSchema>;

export const DexSettingsInputSchema = DexSettingsSchema.pick({
  default_slippage_bps: true,
  max_gas_price_gwei: true,
  auto_refresh: true,
});
export type DexSettingsInput = z.infer<typeof DexSettingsInputSchema>;

// ============================================================================
// Admin Chains (table: admin_chains)
// ============================================================================

export const AdminChainSchema = z.object({
  chain: z.string(), // Primary key
  enabled: z.boolean(),
  updated_at: dateSchema.optional(),
});
export type AdminChain = z.infer<typeof AdminChainSchema>;

export const AdminChainInputSchema = AdminChainSchema.pick({
  chain: true,
  enabled: true,
});
export type AdminChainInput = z.infer<typeof AdminChainInputSchema>;

// ============================================================================
// Featured Tokens (table: admin_featured_tokens)
// ============================================================================

export const FeaturedTokenSchema = z.object({
  id: z.string().uuid().optional(), // Auto-generated
  chain: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  symbol: z.string().min(1).nullable().optional(),
  name: z.string().min(1).nullable().optional(),
  created_at: dateSchema.optional(),
});
export type FeaturedToken = z.infer<typeof FeaturedTokenSchema>;

export const FeaturedTokenInputSchema = FeaturedTokenSchema.pick({
  chain: true,
  address: true,
  symbol: true,
  name: true,
});
export type FeaturedTokenInput = z.infer<typeof FeaturedTokenInputSchema>;

// ============================================================================
// Token Lists (table: admin_token_lists)
// ============================================================================

export const TokenListSchema = z.object({
  id: z.string().uuid().optional(), // Auto-generated
  url: z.string().url(),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  created_at: dateSchema.optional(),
});
export type TokenList = z.infer<typeof TokenListSchema>;

export const TokenListInputSchema = TokenListSchema.pick({
  url: true,
  name: true,
  enabled: true,
});
export type TokenListInput = z.infer<typeof TokenListInputSchema>;

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Admin role check result
 */
export interface AdminStatus {
  isAdmin: boolean;
  userId: string | null;
  email: string | null;
}
