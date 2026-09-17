# Shaggy Dogg DEX Session Handoff - 2026-06-21

## Current Runtime Defaults

- Frontend dev server: `http://localhost:5173`
- Backend API dev server: `http://localhost:8787`
- The app was moved back to Vite defaults. Do not use `8111` unless explicitly testing an alternate port.
- `server/.env` should keep `ORIGIN=http://localhost:5173`.

## Supabase Project

New hosted Supabase project:

```text
Project ref: kedtpoczmattmsagnpkp
URL: https://kedtpoczmattmsagnpkp.supabase.co
```

`.env.local` now points at the new Supabase project and uses Supabase's newer publishable key naming:

```text
VITE_SUPABASE_URL=https://kedtpoczmattmsagnpkp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable___a9Ukzafc5bzwbYWwWwnw_NLhpXhMR
```

The app code was updated to accept either:

```text
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_ANON_KEY
```

The publishable key is preferred.

## Supabase Migration Implemented

Created:

```text
supabase/migrations/20260621000100_admin_schema.sql
supabase/seed.sql
supabase/promote-admin.sql
```

The migration restores the app-facing public schema without importing stale Supabase-managed internals from the old paused project backup.

Included tables:

```text
public.profiles
public.dex_settings
public.admin_chains
public.admin_featured_tokens
public.admin_token_lists
```

Included database logic:

- `public.user_role` enum with `admin` and `user`
- `public.is_admin()`
- `public.touch_updated_at()`
- `public.handle_new_user()`
- `public.prevent_profile_role_self_promotion()`
- trigger to auto-create a profile when a Supabase Auth user signs up
- trigger to prevent normal users from promoting themselves to admin
- RLS policies for admin tables and user profile access
- default `dex_settings` row seeded in the migration

The migration was pushed successfully:

```text
Local migration:  20260621000100
Remote migration: 20260621000100
```

Command used:

```bash
npx supabase link --project-ref kedtpoczmattmsagnpkp
npx supabase db push
```

The push completed. A Docker cache warning appeared afterward, but the remote migration applied successfully.

## Admin Sign-In Remaining Steps

In Supabase dashboard:

1. Enable Google Auth provider.
2. Add this redirect URL:

```text
http://localhost:5173/admin
```

Then:

1. Restart Vite so `.env.local` is reloaded.
2. Open `http://localhost:5173/admin`.
3. Sign in once with Google.
4. Open `supabase/promote-admin.sql`.
5. Replace `your-google-email@example.com` with the Google email used to sign in.
6. Run that SQL in Supabase SQL Editor.

That promotes the newly created profile row to `admin`.

## Supabase Backup Notes

Old backup files found in `/home/blklaw/docs`:

```text
db_cluster-08-09-2025@06-40-39.backup.gz
db_cluster-08-09-2025@06-40-39.backup
```

The backup contained old public tables and one old admin profile:

```text
ec00eaeb-3c17-43b3-824d-178c4c6485ad
```

That old profile was not seeded into the new project because it is tied to the old Auth user ID and would not match a new Google login unless old Auth users are deliberately restored.

## Supabase Skill Installed

Installed project-level skill:

```text
.agents/skills/supabase-postgres-best-practices
```

Installed global helper:

```text
~/.agents/skills/find-skills
```

The Supabase skill contains Postgres, RLS, indexing, and performance references. Use it when changing migrations, policies, or schema.

## MetaMask Connection Implementation

Implemented wallet connector changes to prefer MetaMask and avoid Rainbow/generic injected wallets taking over:

```text
src/wagmi.ts
src/components/WalletConnect.tsx
```

Key behavior:

- `metaMask()` connector is ordered before generic `injected()`.
- Wallet button selects the MetaMask connector only.
- Button disables only while a connect attempt is pending.
- Errors render instead of silently leaving the button dead.

## Swap Implementation Changes

Implemented production-safety fixes in:

```text
src/hooks/useSwap.tsx
src/pages/Swap.tsx
src/components/swap/SwapCard.tsx
```

Key behavior:

- Quote status enum added: `IDLE`, `LOADING`, `SUCCESS`, `NO_ROUTE`, `ERROR`
- Actual successful quote route is tracked as `activeRoutePath`
- Swap execution uses `activeRoutePath` instead of rebuilding `[sellToken, buyToken]`
- `priceImpactBps` falls back to `null` instead of `undefined`
- Swap button handles:
  - wrong network
  - switching network
  - quote loading
  - route unavailable
  - approval required
  - insufficient balance
- Mainnet guard added for swap execution.

## Admin Page Implementation Changes

Admin page now uses the shared Supabase client and the current admin tables:

```text
src/pages/Admin.tsx
src/lib/adminApi.ts
src/lib/adminSchemas.ts
src/hooks/useAdminData.ts
```

Important table mapping:

```text
dex_settings
admin_chains
admin_featured_tokens
admin_token_lists
profiles
```

The old backup tables `featured_tokens`, `token_lists`, and `admin_settings` are legacy and are not the current app path.

## Verification

Passed:

```bash
npm run type-check
npx supabase migration list
```

Known issue:

```bash
npm test -- --run src/hooks/useSwap.test.ts
```

The swap tests are stale and fail due to old assumptions such as nonexistent `state.canSwap`, `state.error`, and `actions.flipTokens`, plus test state updates outside `act()`.

## Next Practical Steps

1. Restart Vite.
2. Enable Google Auth in Supabase.
3. Sign in at `/admin`.
4. Promote the signed-in Google user with `supabase/promote-admin.sql`.
5. Verify admin table reads/writes from the UI.
6. Update stale swap tests to match the current hook API.
