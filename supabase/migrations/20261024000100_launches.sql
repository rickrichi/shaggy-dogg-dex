-- Launchpad launch records for the demand test (whitepaper v2.0 §17.1).
-- Written only by the Hono API with the service key, after verifying each launch on Base.
-- Mirrors the SQLite schema in server/src/launches/store.ts.

create table if not exists public.launches (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  token_address text not null unique check (token_address ~ '^0x[0-9a-f]{40}$'),
  creator text not null check (creator ~ '^0x[0-9a-f]{40}$'),
  recipient text not null check (recipient ~ '^0x[0-9a-f]{40}$'),
  name text not null check (char_length(name) <= 128),
  symbol text not null check (char_length(symbol) <= 32),
  -- Token supply in base units; text so 10^30-scale values keep full precision through JSON.
  supply text not null check (supply ~ '^[0-9]+$'),
  block_number bigint not null,
  -- Unix seconds of the deployment block.
  launched_at bigint not null,
  pool_address text check (pool_address ~ '^0x[0-9a-f]{40}$'),
  recorded_at timestamptz not null default now()
);

create index if not exists launches_launched_at on public.launches (launched_at);

-- Only the server (service_role, which bypasses RLS) may touch this table. RLS is on with no
-- policies, and the public API roles get no privileges, so anon and authenticated keys can
-- neither read nor insert launches.
alter table public.launches enable row level security;
revoke all on table public.launches from anon, authenticated;
grant select, insert on table public.launches to service_role;

-- Launches per UTC calendar month, with distinct creator wallets and seeded launches.
create or replace function public.launch_monthly_stats()
returns table (month text, launches bigint, creators bigint, seeded bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select to_char(to_timestamp(l.launched_at) at time zone 'UTC', 'YYYY-MM') as month,
         count(*) as launches,
         count(distinct l.creator) as creators,
         count(l.pool_address) as seeded
  from public.launches l
  group by 1
  order by 1;
$$;

revoke execute on function public.launch_monthly_stats() from public, anon, authenticated;
grant execute on function public.launch_monthly_stats() to service_role;
