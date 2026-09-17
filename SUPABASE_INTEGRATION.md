# 🎯 Supabase Database Integration - Complete

## ✅ What's Been Integrated

Your Shaggy Dogg DEX application is now fully integrated with your Supabase database schema. All tables, RLS policies, and admin functions are properly connected.

---

## 📊 Database Tables Connected

### 1. **profiles** - User Management
```typescript
// Usage in your app
import { useProfile, useUpdateProfile } from '@/hooks/useAdminData';

const { data: profile } = useProfile(userId);
const updateProfile = useUpdateProfile();
```

**Fields:**
- `id` (UUID) - Primary key, references auth.users
- `username` - Unique username (3-30 chars)
- `full_name` - User's full name
- `avatar_url` - Profile picture URL
- `website` - Personal website
- `bio` - User bio
- `role` - 'admin' | 'user'

### 2. **dex_settings** - DEX Configuration
```typescript
// Usage in your app
import { useDexSettings } from '@/hooks/useAdminData';

const { settings, save } = useDexSettings();

// Update settings
save.mutate({
  default_slippage_bps: 50,
  max_gas_price_gwei: 20,
  auto_refresh: true,
});
```

**Fields:**
- `id` (text) - Always 'default'
- `default_slippage_bps` (0-10000) - Default slippage in basis points
- `max_gas_price_gwei` (1-10000) - Max gas price in Gwei
- `auto_refresh` (boolean) - Auto-refresh quotes

### 3. **admin_chains** - Supported Chains
```typescript
// Usage in your app
import { useAdminChains } from '@/hooks/useAdminData';

const { chains, upsert, remove } = useAdminChains();

// Toggle chain
upsert.mutate({ chain: 'ethereum', enabled: true });
```

**Fields:**
- `chain` (text) - Primary key (e.g., 'ethereum', 'base')
- `enabled` (boolean) - Chain enabled/disabled
- `updated_at` - Last update timestamp

### 4. **admin_featured_tokens** - Featured Tokens
```typescript
// Usage in your app
import { useFeaturedTokens } from '@/hooks/useAdminData';

const { tokens, add, remove } = useFeaturedTokens();

// Add token
add.mutate({
  chain: 'ethereum',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  name: 'USD Coin',
});

// Remove token
remove.mutate(tokenId);
```

**Fields:**
- `id` (UUID) - Auto-generated primary key
- `chain` (text) - Chain name
- `address` (text) - EVM address (0x + 40 hex chars)
- `symbol` (text) - Token symbol
- `name` (text) - Token name
- `created_at` - Creation timestamp

**Note:** Unique constraint on (chain, address) - case-insensitive

### 5. **admin_token_lists** - Token Lists
```typescript
// Usage in your app
import { useTokenLists } from '@/hooks/useAdminData';

const { lists, add, toggle, remove } = useTokenLists();

// Add list
add.mutate({
  url: 'https://tokens.uniswap.org',
  name: 'Uniswap Default List',
  enabled: true,
});

// Toggle enabled
toggle.mutate({ id: listId, enabled: false });
```

**Fields:**
- `id` (UUID) - Auto-generated primary key
- `url` (text) - Unique URL
- `name` (text) - List name
- `enabled` (boolean) - List enabled/disabled
- `created_at` - Creation timestamp

---

## 🔐 Admin Access

Your database uses **Row Level Security (RLS)** with the `is_admin()` function.

### Make Yourself Admin

```sql
-- 1. Find your user ID
select id, email from auth.users order by created_at desc;

-- 2. Set admin role (replace with your ID)
insert into public.profiles (id, role)
values ('your-user-id-here', 'admin')
on conflict (id) do update set role = excluded.role;
```

### Check Admin Status in App

```typescript
import { useAdminStatus } from '@/hooks/useAdminData';

const { data: adminStatus } = useAdminStatus();

if (adminStatus?.isAdmin) {
  // User is admin
}
```

---

## 🚀 Quick Start

### 1. **Add Your Supabase Credentials**

Update `.env`:
```env
VITE_SUPABASE_URL=https://kedtpoczmattmsagnpkp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_actual_publishable_key_here
```

Get your anon key from:
https://supabase.com/dashboard/project/kedtpoczmattmsagnpkp/settings/api

### 2. **Make Yourself Admin**

Run the SQL above in your Supabase SQL Editor.

### 3. **Start Your App**

```bash
npm run dev
```

### 4. **Visit Admin Page**

Go to: http://localhost:5173/admin

- Click "Sign in with GitHub" or "Sign in with Google"
- Once authenticated, admin features will be available

---

## 📝 Code Examples

### Complete Admin Panel Example

```typescript
import { useDexSettings, useFeaturedTokens, useAdminStatus } from '@/hooks/useAdminData';

function AdminPanel() {
  const { data: adminStatus } = useAdminStatus();
  const { settings, save } = useDexSettings();
  const { tokens, add } = useFeaturedTokens();

  if (!adminStatus?.isAdmin) {
    return <div>Access Denied</div>;
  }

  return (
    <div>
      <h1>Admin Panel</h1>

      {/* DEX Settings */}
      <div>
        <h2>Settings</h2>
        <p>Slippage: {settings.data?.default_slippage_bps} BPS</p>
        <button onClick={() => save.mutate({
          default_slippage_bps: 100,
          max_gas_price_gwei: 30,
          auto_refresh: true
        })}>
          Update Settings
        </button>
      </div>

      {/* Featured Tokens */}
      <div>
        <h2>Featured Tokens</h2>
        {tokens.data?.map(token => (
          <div key={token.id}>
            {token.symbol} on {token.chain}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Profile Management

```typescript
import { useProfile, useUpdateProfile } from '@/hooks/useAdminData';

function ProfilePage({ userId }: { userId: string }) {
  const { data: profile } = useProfile(userId);
  const updateProfile = useUpdateProfile();

  const handleUpdate = () => {
    updateProfile.mutate({
      userId,
      input: {
        username: 'newusername',
        full_name: 'John Doe',
        bio: 'DeFi enthusiast',
      },
    });
  };

  return (
    <div>
      <h1>Profile: {profile?.username}</h1>
      <p>{profile?.bio}</p>
      <button onClick={handleUpdate}>Update Profile</button>
    </div>
  );
}
```

---

## 🔧 API Reference

### Schemas
- `src/lib/adminSchemas.ts` - Zod schemas for all tables
- All schemas match your database exactly

### API Functions
- `src/lib/adminApi.ts` - CRUD operations for all tables
- `checkAdminStatus()` - Check if user is admin
- `fetchDexSettings()` - Get DEX settings
- `listFeaturedTokens()` - Get all featured tokens
- `addFeaturedToken()` - Add new featured token
- etc.

### React Hooks
- `src/hooks/useAdminData.ts` - React Query hooks
- `useAdminStatus()` - Get admin status
- `useDexSettings()` - Get/update DEX settings
- `useFeaturedTokens()` - Manage featured tokens
- `useTokenLists()` - Manage token lists
- `useAdminChains()` - Manage supported chains
- `useProfile()` - Get user profile
- `useUpdateProfile()` - Update user profile

---

## 🛡️ Security

### RLS Policies Applied

All tables have Row Level Security enabled:

- ✅ **Admin-only access** via `is_admin()` function
- ✅ **Profile policies** - Users can read all, modify own
- ✅ **JWT-based auth** via `app_metadata.roles`

### Best Practices

1. ✅ Never expose service role key to frontend
2. ✅ Use anon key for client-side code
3. ✅ Validate all inputs with Zod schemas
4. ✅ RLS policies enforce access control
5. ✅ Auto-generated UUIDs for primary keys

---

## 🐛 Troubleshooting

### "Not authorized" errors

- Make sure your user has `role = 'admin'` in profiles table
- Check JWT contains correct `app_metadata.roles`
- Verify RLS policies are created

### "No rows returned"

- Check if `dex_settings` has a row with `id = 'default'`
- Verify tables have data
- Check RLS policies allow SELECT

### Admin panel shows "Access Denied"

Run this SQL to make yourself admin:
```sql
insert into public.profiles (id, role)
values (auth.uid(), 'admin')
on conflict (id) do update set role = 'admin';
```

---

## 📚 Database Schema Reference

See `/src/lib/supabase/README.md` for:
- Complete SQL schema
- RLS policy examples
- Authentication setup
- Real-time subscriptions

---

## ✨ What's Different from Before

### Field Name Changes

| Old Name | New Name |
|----------|----------|
| `admin_settings` | `dex_settings` |
| `slippage_bps` | `default_slippage_bps` |
| `max_gas_gwei` | `max_gas_price_gwei` |
| `featured_tokens.decimals` | Removed (not in your schema) |
| `featured_tokens.logo_uri` | Removed (not in your schema) |
| `token_lists` | `admin_token_lists` |

### New Features

- ✅ Admin chains management (`admin_chains` table)
- ✅ Profile management with roles
- ✅ UUID primary keys for tokens/lists
- ✅ Enabled/disabled toggle for lists
- ✅ Admin status checking

---

**All code is type-safe, modern, and matches your database schema exactly!** 🎉
