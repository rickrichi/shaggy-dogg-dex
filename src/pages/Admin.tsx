// src/pages/Admin.tsx
import { useEffect, useMemo, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings, Shield, AlertTriangle, Loader2 } from 'lucide-react';

import { SUPPORTED_CHAINS } from '@/lib/config';
import {
  useAdminSettings,
  useFeaturedTokens,
  useTokenLists,
} from '@/hooks/useAdminData';

/** Auth status discriminated union */
type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

/** Strict env accessors (fail-fast, no placeholders) */
const getEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const raw = import.meta.env[key] as unknown;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(`Missing env ${key} (check your .env)`);
  }
  return raw;
};

/** Page-local Supabase client for auth */
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'));

/** Derived narrow type from your chain config */
type ChainOption = (typeof SUPPORTED_CHAINS)[number];

/** Input shape for featured token creation */
interface FeaturedTokenInput {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

/** Payload shape expected by API */
interface FeaturedTokenPayload {
  chain_id: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_uri?: string;
}

/** Input shape for token list creation */
interface TokenListInput {
  url: string;
  name?: string;
}

/** Type guard: EVM address */
const isHexAddress = (s: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(s);

/** Parse helper for number inputs */
const parseNumberOr = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Validate FeaturedTokenInput -> FeaturedTokenPayload or error string */
function buildFeaturedTokenPayload(input: FeaturedTokenInput): FeaturedTokenPayload | { error: string } {
  const errors: string[] = [];

  if (!Number.isInteger(input.chainId) || input.chainId < 1) {
    errors.push('Chain ID must be a positive integer (e.g. 1 for Ethereum).');
  }
  if (!isHexAddress(input.address)) {
    errors.push('Token address must be a 0x-prefixed 40-hex string.');
  }
  if (input.symbol.trim().length === 0) {
    errors.push('Symbol is required.');
  }
  if (input.name.trim().length === 0) {
    errors.push('Name is required.');
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 255) {
    errors.push('Decimals must be an integer between 0 and 255.');
  }

  let logo_uri: string | undefined;
  const rawLogo = input.logoURI?.trim() ?? '';
  if (rawLogo.length > 0) {
    try {
      const u = new URL(rawLogo);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        errors.push('Logo URL must start with http:// or https://');
      } else {
        logo_uri = u.toString();
      }
    } catch {
      errors.push('Logo URL must be a valid URL or left blank.');
    }
  }

  if (errors.length > 0) {
    return { error: errors.join('\n') };
  }

  return {
    chain_id: input.chainId,
    address: input.address,
    symbol: input.symbol.trim(),
    name: input.name.trim(),
    decimals: input.decimals,
    ...(logo_uri ? { logo_uri } : {}),
  };
}

export default function Admin() {
  // ────────────────────────────── Auth gate ────────────────────────────────
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    const init = async (): Promise<void> => {
      // Exchange OAuth code if present (reliable social login landing)
      if (window.location.href.includes('code=')) {
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          window.history.replaceState({}, '', url.toString());
        } catch (err) {
           
          console.error('[exchangeCodeForSession]', err);
        }
      }

      try {
        await supabase.auth.refreshSession().catch(() => {});
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          setSession(null);
          setAuthStatus('unauthenticated');
          return;
        }
        setSession(data.session ?? null);
        setAuthStatus(data.session ? 'authenticated' : 'unauthenticated');
      } catch (err) {
        if (!mounted) return;
         
        console.error('[getSession]', err);
        setSession(null);
        setAuthStatus('unauthenticated');
      }
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return;
      setSession(s);
      setAuthStatus(s ? 'authenticated' : 'unauthenticated');
      // Invalidate admin data on auth boundary changes
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['featuredTokens'] }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['tokenLists'] }).catch(() => {});
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOAuth = async (provider: 'github' | 'google'): Promise<void> => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/admin`,
        queryParams: { prompt: 'select_account' },
        scopes: provider === 'google' ? 'openid email profile' : 'read:user user:email',
      },
    });
    if (error) {
       
      console.error('[signInWithOAuth]', error.message);
      return;
    }
    if (data?.url) window.location.assign(data.url);
  };

  // ───────────────────────────── Data hooks wiring ───────────────────────────
  const { settings, save } = useAdminSettings();
  const { tokens, add, remove } = useFeaturedTokens();
  const { lists, add: addList, remove: removeList } = useTokenLists();

  // ───────────────────────────── Local controlled state ──────────────────────
  // Defaults from server (memoized to avoid controlled/uncontrolled flips)
  const defaults = useMemo(() => {
    return settings.data ?? {
      id: 1,
      slippage_bps: 50,
      max_gas_gwei: 20,
      auto_refresh: true,
      updated_at: new Date().toISOString(),
      updated_by: null as string | null,
    };
  }, [settings.data]);

  const [slippageBps, setSlippageBps] = useState<number>(defaults.slippage_bps);
  const [maxGasGwei, setMaxGasGwei] = useState<number>(defaults.max_gas_gwei);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(defaults.auto_refresh);

  useEffect(() => {
    setSlippageBps(defaults.slippage_bps);
    setMaxGasGwei(defaults.max_gas_gwei);
    setAutoRefresh(defaults.auto_refresh);
  }, [defaults.slippage_bps, defaults.max_gas_gwei, defaults.auto_refresh]);

  const [ft, setFt] = useState<FeaturedTokenInput>({
    chainId: 1,
    address: '',
    symbol: '',
    name: '',
    decimals: 18,
    logoURI: '',
  });

  const [list, setList] = useState<TokenListInput>({ url: '', name: 'Custom List' });

  /** Local error banners */
  const [ftError, setFtError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // ───────────────────────────── Render branches ─────────────────────────────
  if (authStatus === 'loading') {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-6 text-center">Checking session…</CardContent>
        </Card>
      </div>
    );
  }

  if (authStatus === 'unauthenticated' || !session) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Admin Panel
          </h1>
          <p className="text-gray-600">Manage DEX settings and configuration</p>
        </div>

        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">Admin Access Required</p>
                <p className="text-amber-700">
                  This section requires admin authentication via Supabase Auth + RLS policies.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void onOAuth('github')}>Sign in with GitHub</Button>
                  <Button variant="outline" onClick={() => void onOAuth('google')}>
                    Sign in with Google
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ───────────────────────────── Authenticated UI ────────────────────────────
  const isSaving = save.isPending;
  const isLoadingData = settings.isLoading || tokens.isLoading || lists.isLoading;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          Admin Panel
        </h1>
        <p className="text-gray-600">Manage DEX settings and configuration</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Sign out
          </Button>
          {isLoadingData && (
            <span className="inline-flex items-center text-xs text-gray-500">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              syncing…
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supported Chains (UI only; persist later if desired) */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Supported Chains</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {SUPPORTED_CHAINS.map((chain: ChainOption) => (
              <div key={chain} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="capitalize">
                    {chain}
                  </Badge>
                </div>
                <Switch defaultChecked aria-label={`Enable ${chain}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* DEX Settings (persisted) */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>DEX Settings</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slippage">Default Slippage (BPS)</Label>
              <Input
                id="slippage"
                type="number"
                inputMode="numeric"
                value={slippageBps}
                onChange={(e) => setSlippageBps(parseNumberOr(e.currentTarget.value, slippageBps))}
                placeholder="50"
                min={0}
                max={10_000}
              />
              <p className="text-xs text-gray-500">50 BPS = 0.5%</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gas-price">Max Gas Price (Gwei)</Label>
              <Input
                id="gas-price"
                type="number"
                inputMode="numeric"
                value={maxGasGwei}
                onChange={(e) => setMaxGasGwei(parseNumberOr(e.currentTarget.value, maxGasGwei))}
                placeholder="20"
                min={1}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-refresh">Auto-refresh quotes</Label>
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={(checked) => setAutoRefresh(checked)}
              />
            </div>

            <div className="pt-2">
              <Button
                onClick={() =>
                  save.mutate({
                    slippage_bps: slippageBps,
                    max_gas_gwei: maxGasGwei,
                    auto_refresh: autoRefresh,
                  })
                }
                disabled={isSaving}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                {isSaving ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Featured Tokens (persisted) */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Featured Tokens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ftError && (
              <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm p-2">
                {ftError.split('\n').map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ft-chain">Chain ID</Label>
                <Input
                  id="ft-chain"
                  type="number"
                  inputMode="numeric"
                  value={ft.chainId}
                  onChange={(e) =>
                    setFt((prev) => ({ ...prev, chainId: parseNumberOr(e.currentTarget.value, prev.chainId) }))
                  }
                  placeholder="1"
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ft-address">Token Address</Label>
                <Input
                  id="ft-address"
                  value={ft.address}
                  onChange={(e) => setFt((prev) => ({ ...prev, address: e.currentTarget.value }))}
                  placeholder="0x..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ft-symbol">Symbol</Label>
                <Input
                  id="ft-symbol"
                  value={ft.symbol}
                  onChange={(e) => setFt((prev) => ({ ...prev, symbol: e.currentTarget.value }))}
                  placeholder="USDC"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ft-name">Name</Label>
                <Input
                  id="ft-name"
                  value={ft.name}
                  onChange={(e) => setFt((prev) => ({ ...prev, name: e.currentTarget.value }))}
                  placeholder="USD Coin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ft-decimals">Decimals</Label>
                <Input
                  id="ft-decimals"
                  type="number"
                  inputMode="numeric"
                  value={ft.decimals}
                  onChange={(e) =>
                    setFt((prev) => ({ ...prev, decimals: parseNumberOr(e.currentTarget.value, prev.decimals) }))
                  }
                  placeholder="6"
                  min={0}
                  max={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ft-logo">Logo URL</Label>
                <Input
                  id="ft-logo"
                  value={ft.logoURI ?? ''}
                  onChange={(e) => setFt((prev) => ({ ...prev, logoURI: e.currentTarget.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              onClick={async () => {
                setFtError(null);
                const payloadOrError = buildFeaturedTokenPayload(ft);
                if ('error' in payloadOrError) {
                  setFtError(payloadOrError.error);
                  return;
                }
                try {
                  await add.mutateAsync(payloadOrError);
                  // reset form on success
                  setFt((prev) => ({ ...prev, address: '', symbol: '', name: '', logoURI: '' }));
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : 'Failed to add featured token.';
                  setFtError(msg);
                }
              }}
              disabled={add.isPending}
            >
              {add.isPending ? (
                <span className="inline-flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding…
                </span>
              ) : (
                'Add Featured Token'
              )}
            </Button>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Current Featured Tokens</h4>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {tokens.data?.map((t) => (
                  <div
                    key={`${t.chain_id}:${t.address}`}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{t.symbol}</Badge>
                      <span className="text-xs text-gray-600">{t.name}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{t.address}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => remove.mutate({ chain_id: t.chain_id, address: t.address })}
                      disabled={remove.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {tokens.data && tokens.data.length === 0 && (
                  <div className="text-xs text-gray-500">No featured tokens yet.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Lists (persisted) */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Token Lists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {listError && (
              <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm p-2">
                {listError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="tokenlist-url">Token List URL</Label>
              <Input
                id="tokenlist-url"
                placeholder="https://..."
                value={list.url}
                onChange={(e) => setList((prev) => ({ ...prev, url: e.currentTarget.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tokenlist-name">Name (optional)</Label>
              <Input
                id="tokenlist-name"
                placeholder="Custom List"
                value={list.name ?? ''}
                onChange={(e) => setList((prev) => ({ ...prev, name: e.currentTarget.value }))}
              />
            </div>
            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              onClick={async () => {
                setListError(null);
                try {
                  // validate URL
 
                  new URL(list.url);
                } catch {
                  setListError('Please enter a valid URL.');
                  return;
                }
                // With exactOptionalPropertyTypes, omit `name` when empty
                type TokenListPayload = { url: string; name?: string };
                const trimmed = (list.name ?? '').trim();
                const payload: TokenListPayload =
                  trimmed.length > 0 ? { url: list.url, name: trimmed } : { url: list.url };

                try {
                  await addList.mutateAsync(payload);
                  setList({ url: '', name: 'Custom List' });
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : 'Failed to add token list.';
                  setListError(msg);
                }
              }}
              disabled={addList.isPending}
            >
              {addList.isPending ? (
                <span className="inline-flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding…
                </span>
              ) : (
                'Add Token List'
              )}
            </Button>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Active Token Lists</h4>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {lists.data?.map((l) => (
                  <div key={l.url} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{l.name}</span>
                      <span className="text-[10px] text-gray-400 break-all">{l.url}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => removeList.mutate(l.url)}
                      disabled={removeList.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {lists.data && lists.data.length === 0 && (
                  <div className="text-xs text-gray-500">No token lists yet.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save-All (settings have a dedicated save; this mirrors that CTA) */}
      <div className="flex justify-center">
        <Button
          size="lg"
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium px-8"
          onClick={() =>
            save.mutate({ slippage_bps: slippageBps, max_gas_gwei: maxGasGwei, auto_refresh: autoRefresh })
          }
          disabled={isSaving}
        >
          {isSaving ? (
            <span className="inline-flex items-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Saving…
            </span>
          ) : (
            'Save All Changes'
          )}
        </Button>
      </div>
    </div>
  );
}
