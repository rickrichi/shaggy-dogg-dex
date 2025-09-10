// src/lib/supabase/client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

const getEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const raw = import.meta.env[key] as unknown;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(`Missing env ${key}. Add it to .env.local and restart dev.`);
  }
  return raw.trim();
};

export const supabase: SupabaseClient = (() => {
  if (_client) return _client;
  const url = getEnv('VITE_SUPABASE_URL').replace(/\/+$/, '');
  const anon = getEnv('VITE_SUPABASE_ANON_KEY');
  _client = createClient(url, anon);
  return _client;
})();
