// src/lib/adminApi.ts
import { supabase } from "./supabase/client";
import {
  type AdminChain,
  type AdminChainInput,
  AdminChainSchema,
  type AdminStatus,
  type DexSettings,
  type DexSettingsInput,
  DexSettingsSchema,
  type FeaturedToken,
  type FeaturedTokenInput,
  FeaturedTokenInputSchema,
  FeaturedTokenSchema,
  type Profile,
  type ProfileInput,
  ProfileSchema,
  type TokenList,
  type TokenListInput,
  TokenListInputSchema,
  TokenListSchema,
} from "./adminSchemas";

// ============================================================================
// Admin Status Check
// ============================================================================

/**
 * Check if current user is an admin
 * Uses the is_admin() RLS function from your database
 */
export async function checkAdminStatus(): Promise<AdminStatus> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { isAdmin: false, userId: null, email: null };
  }

  // Check profile for admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  return {
    isAdmin,
    userId: user.id,
    email: user.email ?? null,
  };
}

// ============================================================================
// Profile Management
// ============================================================================

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

  if (error) throw error;
  return ProfileSchema.parse(data);
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(input)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return ProfileSchema.parse(data);
}

// ============================================================================
// DEX Settings (table: dex_settings)
// ============================================================================

export async function fetchDexSettings(): Promise<DexSettings> {
  const { data, error } = await supabase
    .from("dex_settings")
    .select("*")
    .eq("id", "default")
    .single();

  if (error) throw error;
  return DexSettingsSchema.parse(data);
}

export async function updateDexSettings(input: DexSettingsInput): Promise<DexSettings> {
  const { data, error } = await supabase
    .from("dex_settings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", "default")
    .select()
    .single();

  if (error) throw error;
  return DexSettingsSchema.parse(data);
}

// ============================================================================
// Admin Chains (table: admin_chains)
// ============================================================================

export async function listAdminChains(): Promise<AdminChain[]> {
  const { data, error } = await supabase
    .from("admin_chains")
    .select("*")
    .order("chain", { ascending: true });

  if (error) throw error;
  return data.map((row) => AdminChainSchema.parse(row));
}

export async function upsertAdminChain(input: AdminChainInput): Promise<void> {
  const { error } = await supabase.from("admin_chains").upsert({
    chain: input.chain,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function deleteAdminChain(chain: string): Promise<void> {
  const { error } = await supabase.from("admin_chains").delete().eq("chain", chain);

  if (error) throw error;
}

// ============================================================================
// Featured Tokens (table: admin_featured_tokens)
// ============================================================================

export async function listFeaturedTokens(): Promise<FeaturedToken[]> {
  const { data, error } = await supabase
    .from("admin_featured_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map((row) => FeaturedTokenSchema.parse(row));
}

export async function addFeaturedToken(input: FeaturedTokenInput): Promise<void> {
  // Validate input
  FeaturedTokenInputSchema.parse(input);

  const { error } = await supabase.from("admin_featured_tokens").insert({
    chain: input.chain,
    address: input.address.toLowerCase(), // Normalize address
    symbol: input.symbol ?? null,
    name: input.name ?? null,
  });

  if (error) throw error;
}

export async function removeFeaturedToken(id: string): Promise<void> {
  const { error } = await supabase.from("admin_featured_tokens").delete().eq("id", id);

  if (error) throw error;
}

// ============================================================================
// Token Lists (table: admin_token_lists)
// ============================================================================

export async function listTokenLists(): Promise<TokenList[]> {
  const { data, error } = await supabase
    .from("admin_token_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map((row) => TokenListSchema.parse(row));
}

export async function addTokenList(input: TokenListInput): Promise<void> {
  // Validate input
  TokenListInputSchema.parse(input);

  const { error } = await supabase.from("admin_token_lists").insert({
    url: input.url,
    name: input.name,
    enabled: input.enabled ?? true,
  });

  if (error) throw error;
}

export async function updateTokenList(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("admin_token_lists").update({ enabled }).eq("id", id);

  if (error) throw error;
}

export async function removeTokenList(id: string): Promise<void> {
  const { error } = await supabase.from("admin_token_lists").delete().eq("id", id);

  if (error) throw error;
}
