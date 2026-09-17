-- Public admin schema restored from the retired shaggy-dogg-dex Supabase backup.
-- This intentionally excludes Supabase-managed auth/storage/realtime internals.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'user_role') then
    create type public.user_role as enum ('admin', 'user');
  end if;
end
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  roles jsonb;
  typ text;
begin
  if exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.user_role
  ) then
    return true;
  end if;

  roles := (auth.jwt() -> 'app_metadata' -> 'roles')::jsonb;
  if roles is null then
    return false;
  end if;

  typ := jsonb_typeof(roles);

  if typ = 'array' then
    return roles ? 'admin';
  elsif typ = 'object' then
    return roles ? 'admin';
  elsif typ = 'string' then
    return roles::text = '"admin"';
  end if;

  return false;
end
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  website text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  role public.user_role not null default 'user'::public.user_role,
  constraint username_len check (
    username is null or (length(username) >= 3 and length(username) <= 30)
  ),
  constraint website_url check (
    website is null or website ~* '^(https?)://'
  )
);

create unique index if not exists profiles_username_ci_idx
  on public.profiles (lower(username));

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end
$$;

create or replace function public.prevent_profile_role_self_promotion()
returns trigger
language plpgsql
as $$
begin
  if old.role is distinct from new.role
    and auth.uid() is not null
    and not public.is_admin()
  then
    raise exception 'Only admins can change profile roles';
  end if;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists trg_profiles_role_guard on public.profiles;
create trigger trg_profiles_role_guard
before update of role on public.profiles
for each row execute function public.prevent_profile_role_self_promotion();

create table if not exists public.dex_settings (
  id text primary key,
  default_slippage_bps integer not null,
  max_gas_price_gwei integer not null,
  auto_refresh boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint dex_settings_default_slippage_bps_check check (
    default_slippage_bps >= 0 and default_slippage_bps <= 10000
  ),
  constraint dex_settings_max_gas_price_gwei_check check (
    max_gas_price_gwei > 0 and max_gas_price_gwei <= 10000
  )
);

create table if not exists public.admin_chains (
  chain text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_featured_tokens (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  address text not null,
  symbol text,
  name text,
  created_at timestamptz not null default now(),
  constraint chk_address_format check (address ~* '^0x[0-9a-f]{40}$')
);

create unique index if not exists idx_admin_featured_tokens_unique
  on public.admin_featured_tokens (chain, lower(address));

create table if not exists public.admin_token_lists (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint chk_url_format check (url ~* '^(https?|ipfs)://')
);

insert into public.dex_settings (
  id,
  default_slippage_bps,
  max_gas_price_gwei,
  auto_refresh,
  updated_at
)
values ('default', 50, 20, true, now())
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.dex_settings enable row level security;
alter table public.admin_chains enable row level security;
alter table public.admin_featured_tokens enable row level security;
alter table public.admin_token_lists enable row level security;

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
on public.profiles
for select
to anon, authenticated
using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all
on public.profiles
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists dex_settings_admin_all on public.dex_settings;
create policy dex_settings_admin_all
on public.dex_settings
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_chains_admin_all on public.admin_chains;
create policy admin_chains_admin_all
on public.admin_chains
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_featured_tokens_admin_all on public.admin_featured_tokens;
create policy admin_featured_tokens_admin_all
on public.admin_featured_tokens
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_token_lists_admin_all on public.admin_token_lists;
create policy admin_token_lists_admin_all
on public.admin_token_lists
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.dex_settings to authenticated;
grant select, insert, update, delete on public.admin_chains to authenticated;
grant select, insert, update, delete on public.admin_featured_tokens to authenticated;
grant select, insert, update, delete on public.admin_token_lists to authenticated;
