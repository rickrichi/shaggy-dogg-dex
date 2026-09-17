# Supabase Integration Guide

## Overview

This project uses Supabase as the backend for admin features, authentication, and data management.

## Setup

### 1. Get Your Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (or create a new one)
3. Navigate to **Settings** → **API**
4. Copy your credentials:
   - **Project URL**: `https://your-project.supabase.co`
   - **anon/public key**: Your anonymous key

### 2. Configure Environment Variables

Add to your `.env.local` file:

```env
VITE_SUPABASE_URL=https://kedtpoczmattmsagnpkp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_actual_publishable_key_here
```

**Important:** Replace `your_actual_publishable_key_here` with your real publishable key from the dashboard.

### 3. Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## Usage

### Import the Client

```typescript
import { supabase } from "@/lib/supabase/client";
```

### Authentication Examples

#### Sign In with OAuth

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "github", // or 'google'
  options: {
    redirectTo: `${window.location.origin}/admin`,
  },
});
```

#### Get Current Session

```typescript
const {
  data: { session },
  error,
} = await supabase.auth.getSession();
```

#### Sign Out

```typescript
await supabase.auth.signOut();
```

#### Listen for Auth Changes

```typescript
const { data } = supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth event:", event, session);
});

// Cleanup
data.subscription.unsubscribe();
```

### Database Examples

#### Fetch Data

```typescript
const { data, error } = await supabase.from("admin_settings").select("*").eq("id", 1).single();
```

#### Insert Data

```typescript
const { data, error } = await supabase.from("featured_tokens").insert({
  chain_id: 1,
  address: "0x...",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
});
```

#### Update Data

```typescript
const { data, error } = await supabase
  .from("admin_settings")
  .update({ slippage_bps: 50 })
  .eq("id", 1)
  .select()
  .single();
```

#### Delete Data

```typescript
const { error } = await supabase
  .from("featured_tokens")
  .delete()
  .match({ chain_id: 1, address: "0x..." });
```

## Database Schema

### Tables

#### `admin_settings`

```sql
CREATE TABLE admin_settings (
  id INTEGER PRIMARY KEY,
  slippage_bps INTEGER NOT NULL,
  max_gas_gwei INTEGER NOT NULL,
  auto_refresh BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id)
);
```

#### `featured_tokens`

```sql
CREATE TABLE featured_tokens (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  logo_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (chain_id, address)
);
```

#### `token_lists`

```sql
CREATE TABLE token_lists (
  url TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id)
);
```

## Row Level Security (RLS)

Enable RLS on all tables:

```sql
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_lists ENABLE ROW LEVEL SECURITY;
```

### Example Policies

#### Allow authenticated users to read

```sql
CREATE POLICY "Allow authenticated read"
ON admin_settings
FOR SELECT
TO authenticated
USING (true);
```

#### Allow specific users to update

```sql
CREATE POLICY "Allow admin users to update"
ON admin_settings
FOR UPDATE
TO authenticated
USING (auth.uid() IN (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
))
WITH CHECK (auth.uid() IN (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
));
```

## Features Using Supabase

- ✅ **Admin Panel** (`/admin`) - Settings management, featured tokens, token lists
- ✅ **OAuth Authentication** - GitHub and Google sign-in
- ✅ **Session Management** - Automatic token refresh and persistence
- ✅ **Real-time Updates** - Database subscriptions (optional)

## API Reference

Full documentation: https://supabase.com/docs/reference/javascript

## Troubleshooting

### "Supabase client not configured"

- Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env`
- Restart your dev server after adding env vars
- Check that values don't contain placeholders like `your_`

### "Invalid API key"

- Verify you're using the **anon/public** key, not the service role key
- Check for extra spaces or newlines in your `.env` file

### "Not authorized"

- Make sure RLS policies are set up correctly
- Check that your user is authenticated
- Verify the user has the required permissions

## Security Best Practices

1. ✅ Use the **anon key** for client-side code
2. ✅ Never commit secrets to git (use `.env.local` for sensitive data)
3. ✅ Enable RLS on all tables
4. ✅ Create specific policies for each operation
5. ✅ Validate data on both client and server
6. ✅ Use environment variables for all credentials
