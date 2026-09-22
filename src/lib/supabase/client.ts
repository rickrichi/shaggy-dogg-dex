/**
 * Supabase Client - Connect to your project
 *
 * Official Supabase client initialization following standardized best practices.
 * All projects have a RESTful endpoint that you can use with your project's API key
 * to query and manage your database.
 *
 * API Settings: https://supabase.com/dashboard/project/_/settings/api
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Get environment variable with validation
 */
const getEnv = (
  key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY" | "VITE_SUPABASE_PUBLISHABLE_KEY"
): string | null => {
  const value = import.meta.env[key];

  if (typeof value !== "string" || value.trim().length === 0 || value.includes("your_")) {
    if (import.meta.env.DEV) {
      console.warn(
        `⚠️  Supabase: Missing or placeholder value for ${key}\n` +
          `   Add your actual credentials to .env and restart the dev server.\n` +
          `   Get them from: https://supabase.com/dashboard/project/_/settings/api`
      );
    }
    return null;
  }

  return value.trim();
};

/**
 * Create a dummy client for graceful degradation when credentials are missing
 */
const createDummyClient = (): SupabaseClient => {
  return createClient("https://placeholder.supabase.co", "placeholder-key");
};

/**
 * Initialize Supabase client
 *
 * The Supabase client is your entrypoint to the rest of the Supabase functionality
 * and is the easiest way to interact with everything we offer within the Supabase ecosystem.
 */
const initializeSupabase = (): SupabaseClient => {
  // Get credentials from environment
  const supabaseUrl = getEnv("VITE_SUPABASE_URL");
  const supabaseKey = getEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");

  // Validate credentials are present
  if (!supabaseUrl || !supabaseKey) {
    if (import.meta.env.DEV) {
      console.warn(
        "🔒 Supabase client not configured.\n" +
          "   Admin features will be disabled until you add credentials to .env\n" +
          "   Example:\n" +
          "   VITE_SUPABASE_URL=https://your-project.supabase.co\n" +
          "   VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here"
      );
    }
    return createDummyClient();
  }

  // Initialize the Supabase client with your project credentials
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  if (import.meta.env.DEV) {
    console.log("✅ Supabase client initialized:", supabaseUrl);
  }

  return client;
};

/**
 * Export singleton Supabase client
 * This ensures only one client instance is created across your entire application
 */
export const supabase: SupabaseClient = initializeSupabase();
