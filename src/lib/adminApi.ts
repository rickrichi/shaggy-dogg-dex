// src/lib/adminApi.ts
import { createClient } from '@supabase/supabase-js';
import { SettingsSchema, type Settings, FeaturedTokenSchema, type FeaturedToken, TokenListSchema, type TokenList } from './adminSchemas';

const supabase = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!url || !anon) throw new Error('Missing Supabase env vars');
  return createClient(url, anon);
})();

// SETTINGS
export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('admin_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return SettingsSchema.parse(data);
}

export async function updateSettings(patch: Pick<Settings, 'slippage_bps' | 'max_gas_gwei' | 'auto_refresh'>): Promise<Settings> {
  const { data, error } = await supabase
    .from('admin_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single();
  if (error) throw error;
  return SettingsSchema.parse(data);
}

// FEATURED TOKENS
export async function listFeaturedTokens(): Promise<FeaturedToken[]> {
  const { data, error } = await supabase.from('featured_tokens').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => FeaturedTokenSchema.parse(row));
}

export async function addFeaturedToken(ft: Omit<FeaturedToken, 'created_at' | 'created_by'>): Promise<void> {
  FeaturedTokenSchema.pick({
    chain_id: true, address: true, symbol: true, name: true, decimals: true, logo_uri: true,
  }).parse(ft);
  const { error } = await supabase.from('featured_tokens').insert(ft);
  if (error) throw error;
}

export async function removeFeaturedToken(chain_id: number, address: string): Promise<void> {
  const { error } = await supabase.from('featured_tokens').delete().match({ chain_id, address });
  if (error) throw error;
}

// TOKEN LISTS
export async function listTokenLists(): Promise<TokenList[]> {
  const { data, error } = await supabase.from('token_lists').select('*').order('added_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => TokenListSchema.parse(row));
}

export async function addTokenList(url: string, name = 'Custom List'): Promise<void> {
  TokenListSchema.pick({ url: true, name: true }).parse({ url, name });
  const { error } = await supabase.from('token_lists').insert({ url, name });
  if (error) throw error;
}

export async function removeTokenList(url: string): Promise<void> {
  const { error } = await supabase.from('token_lists').delete().eq('url', url);
  if (error) throw error;
}

