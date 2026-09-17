insert into public.dex_settings (
  id,
  default_slippage_bps,
  max_gas_price_gwei,
  auto_refresh,
  updated_at
)
values ('default', 50, 20, true, now())
on conflict (id) do update
set
  default_slippage_bps = excluded.default_slippage_bps,
  max_gas_price_gwei = excluded.max_gas_price_gwei,
  auto_refresh = excluded.auto_refresh,
  updated_at = excluded.updated_at;
