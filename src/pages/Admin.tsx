// src/pages/Admin.tsx
import { useEffect, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Loader2, Settings, Shield, Wallet } from "lucide-react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ADMIN_SESSION_KEY, useAdminSession, useDexSettings, useFeaturedTokens, useTokenLists } from "@/hooks/useAdminData";
import { AdminApiError, fetchAdminNonce, signInAdmin, signOutAdmin } from "@/lib/adminApi";
import { SUPPORTED_CHAINS } from "@/lib/config";
import { DEPLOYMENTS, deploymentsLastUpdated } from "@/lib/deployments";

import type { FeaturedTokenInput, TokenListInput } from "@/lib/adminSchemas";

/** Auth status discriminated union */
type AuthStatus = "loading" | "unauthenticated" | "authenticated";

/** Type guard: EVM address */
const isHexAddress = (s: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(s);

/** Parse helper for number inputs */
const parseNumberOr = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Validate FeaturedTokenInput or return error string */
function validateFeaturedToken(input: FeaturedTokenInput): string | null {
  const errors: string[] = [];

  if (!input.chain || input.chain.trim().length === 0) {
    errors.push("Chain is required.");
  }
  if (!isHexAddress(input.address)) {
    errors.push("Token address must be a valid EVM address (0x + 40 hex characters).");
  }
  if (!input.symbol || input.symbol.trim().length === 0) {
    errors.push("Symbol is required.");
  }
  if (!input.name || input.name.trim().length === 0) {
    errors.push("Name is required.");
  }

  return errors.length > 0 ? errors.join("\n") : null;
}

export default function Admin() {
  // ─────────────────────── Auth gate (wallet sign-in, SIWE) ───────────────────
  // The API server verifies the signature against ADMIN_WALLETS and sets an HttpOnly session cookie.
  const queryClient = useQueryClient();
  const sessionQuery = useAdminSession();
  const session = sessionQuery.data ?? null;
  const authStatus: AuthStatus = sessionQuery.isLoading
    ? "loading"
    : session
      ? "authenticated"
      : "unauthenticated";
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [signingIn, setSigningIn] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  const refreshAuth = (): void => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_SESSION_KEY });
    for (const key of ["dexSettings", "featuredTokens", "tokenLists"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const signInWithWallet = async (): Promise<void> => {
    if (!address) {
      setLoginMessage("Connect your admin wallet first (top right).");
      return;
    }
    setSigningIn(true);
    setLoginMessage(null);
    try {
      const { nonce, enabled } = await fetchAdminNonce();
      if (!enabled) {
        throw new Error("Admin sign-in is disabled: set ADMIN_WALLETS in server/.env and restart the API server.");
      }
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to the Shaggy Dogg DEX admin panel. This is a signature only: no transaction, no gas.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? 1,
        nonce,
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 5 * 60_000),
      });
      const signature = await signMessageAsync({ message });
      await signInAdmin(message, signature);
      refreshAuth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setLoginMessage(/rejected|denied/i.test(msg) ? "The signature request was rejected in your wallet." : msg);
    } finally {
      setSigningIn(false);
    }
  };

  // ───────────────────────────── Data hooks wiring ───────────────────────────
  const signedIn = authStatus === "authenticated";
  const { settings, save } = useDexSettings(signedIn);
  const { tokens, add, remove } = useFeaturedTokens(signedIn);
  const { lists, add: addList, remove: removeList } = useTokenLists(signedIn);

  // A 401 from any admin call means the session expired or the wallet was removed from ADMIN_WALLETS.
  const sessionLost = [settings.error, tokens.error, lists.error].some(
    (e) => e instanceof AdminApiError && e.status === 401
  );
  useEffect(() => {
    if (sessionLost) void queryClient.invalidateQueries({ queryKey: ADMIN_SESSION_KEY });
  }, [sessionLost, queryClient]);

  // ───────────────────────────── Local controlled state ──────────────────────
  // Defaults from server (memoized to avoid controlled/uncontrolled flips)
  const defaults = useMemo(() => {
    return (
      settings.data ?? {
        id: "default",
        default_slippage_bps: 50,
        max_gas_price_gwei: 20,
        auto_refresh: true,
        updated_at: new Date(),
      }
    );
  }, [settings.data]);

  const [slippageBps, setSlippageBps] = useState<number>(defaults.default_slippage_bps);
  const [maxGasGwei, setMaxGasGwei] = useState<number>(defaults.max_gas_price_gwei);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(defaults.auto_refresh);

  useEffect(() => {
    setSlippageBps(defaults.default_slippage_bps);
    setMaxGasGwei(defaults.max_gas_price_gwei);
    setAutoRefresh(defaults.auto_refresh);
  }, [defaults.default_slippage_bps, defaults.max_gas_price_gwei, defaults.auto_refresh]);

  const [ft, setFt] = useState<FeaturedTokenInput>({
    chain: SUPPORTED_CHAINS[0] ?? "ethereum",
    address: "",
    symbol: "",
    name: "",
  });

  const [list, setList] = useState<TokenListInput>({
    url: "",
    name: "Custom List",
    enabled: true,
  });

  /** Local error banners */
  const [ftError, setFtError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopyMessage("Copied");
      setTimeout(() => setCopyMessage(null), 1200);
    } catch (err) {
      console.error("Copy failed", err);
      setCopyMessage("Copy failed");
    }
  };

  // ───────────────────────────── Render branches ─────────────────────────────
  if (authStatus === "loading") {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-6 text-center">Checking session…</CardContent>
        </Card>
      </div>
    );
  }

  if (authStatus === "unauthenticated" || !session) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <h1 className="mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-bold text-transparent">
            Admin Panel
          </h1>
          <p className="text-gray-600">Manage DEX settings and configuration</p>
        </div>

        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Wallet className="mt-0.5 size-5 text-amber-600" />
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-amber-800">Admin Access Required</p>
                  <p className="text-amber-700">
                    Sign a one-time message with an admin wallet. It is not a transaction and costs no gas.
                  </p>
                </div>
                <p className="font-mono text-xs text-amber-800">
                  {address ? `Connected: ${address}` : "No wallet connected — use Connect Wallet in the header."}
                </p>
                <Button onClick={() => void signInWithWallet()} disabled={signingIn || !address}>
                  {signingIn ? (
                    <span className="inline-flex items-center">
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Waiting for signature…
                    </span>
                  ) : (
                    "Sign in with wallet"
                  )}
                </Button>
                {loginMessage && (
                  <p className="flex items-start gap-1 text-xs text-red-700">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {loginMessage}
                  </p>
                )}
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-center">
        <h1 className="mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-bold text-transparent">
          Admin Panel
        </h1>
        <p className="text-gray-600">Manage DEX settings and configuration</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await signOutAdmin().catch(() => undefined);
              refreshAuth();
            }}
          >
            Sign out
          </Button>
          {isLoadingData && (
            <span className="inline-flex items-center text-xs text-gray-500">
              <Loader2 className="mr-1 size-3 animate-spin" />
              syncing…
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Supported Chains (UI only; persist later if desired) */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="size-5" />
              <span>Supported Chains</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {SUPPORTED_CHAINS.map((chain) => (
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
              <Shield className="size-5" />
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
                    default_slippage_bps: slippageBps,
                    max_gas_price_gwei: maxGasGwei,
                    auto_refresh: autoRefresh,
                  })
                }
                disabled={isSaving}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
              >
                {isSaving ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Save Settings"
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
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {ftError.split("\n").map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ft-chain">Chain</Label>
                <select
                  id="ft-chain"
                  value={ft.chain}
                  onChange={(e) => setFt((prev) => ({ ...prev, chain: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {SUPPORTED_CHAINS.map((chain) => (
                    <option key={chain} value={chain}>
                      {chain.charAt(0).toUpperCase() + chain.slice(1)}
                    </option>
                  ))}
                </select>
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
                  value={ft.symbol ?? ""}
                  onChange={(e) => setFt((prev) => ({ ...prev, symbol: e.currentTarget.value }))}
                  placeholder="USDC"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ft-name">Name</Label>
                <Input
                  id="ft-name"
                  value={ft.name ?? ""}
                  onChange={(e) => setFt((prev) => ({ ...prev, name: e.currentTarget.value }))}
                  placeholder="USD Coin"
                />
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
              onClick={async () => {
                setFtError(null);

                // Validate input
                const validationError = validateFeaturedToken(ft);
                if (validationError) {
                  setFtError(validationError);
                  return;
                }

                try {
                  await add.mutateAsync(ft);
                  // Reset form on success
                  setFt((prev) => ({ ...prev, address: "", symbol: "", name: "" }));
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Failed to add featured token.";
                  setFtError(msg);
                }
              }}
              disabled={add.isPending}
            >
              {add.isPending ? (
                <span className="inline-flex items-center">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Adding…
                </span>
              ) : (
                "Add Featured Token"
              )}
            </Button>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Current Featured Tokens</h4>
              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {tokens.data?.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded bg-gray-50 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {t.chain}
                      </Badge>
                      <Badge variant="outline">{t.symbol}</Badge>
                      <span className="text-xs text-gray-600">{t.name}</span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {t.address.slice(0, 6)}...{t.address.slice(-4)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => t.id && remove.mutate(t.id)}
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
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
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
                value={list.name ?? ""}
                onChange={(e) => setList((prev) => ({ ...prev, name: e.currentTarget.value }))}
              />
            </div>
            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
              onClick={async () => {
                setListError(null);
                try {
                  // validate URL

                  new URL(list.url);
                } catch {
                  setListError("Please enter a valid URL.");
                  return;
                }
                // Prepare payload with cleaned values
                const trimmed = (list.name ?? "").trim();
                const payload: TokenListInput = {
                  url: list.url,
                  name: trimmed.length > 0 ? trimmed : "Custom List",
                  enabled: list.enabled ?? true,
                };

                try {
                  await addList.mutateAsync(payload);
                  setList({ url: "", name: "Custom List", enabled: true });
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Failed to add token list.";
                  setListError(msg);
                }
              }}
              disabled={addList.isPending}
            >
              {addList.isPending ? (
                <span className="inline-flex items-center">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Adding…
                </span>
              ) : (
                "Add Token List"
              )}
            </Button>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Active Token Lists</h4>
              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {lists.data?.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded bg-gray-50 p-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-sm font-medium">{l.name}</span>
                      {l.enabled !== undefined && (
                        <Badge variant={l.enabled ? "default" : "secondary"} className="text-xs">
                          {l.enabled ? "Active" : "Disabled"}
                        </Badge>
                      )}
                      <span className="truncate text-[10px] text-gray-400">{l.url}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => l.id && removeList.mutate(l.id)}
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

        {/* Deployed contracts (read-only) */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader className="flex flex-col gap-1">
            <CardTitle>Deployed Contracts</CardTitle>
            <p className="text-xs text-gray-500">
              Generated from deployment artifacts (deployments/*.json). Run{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">
                npm run contracts:update
              </code>{" "}
              after new deploys.
            </p>
            {deploymentsLastUpdated && (
              <p className="text-xs text-gray-400">
                Last updated: {new Date(deploymentsLastUpdated * 1000).toLocaleString()}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {DEPLOYMENTS.length === 0 && (
              <div className="text-sm text-gray-500">
                No deployment artifacts found. Add json files under deployments/ or run the update
                script.
              </div>
            )}
            {DEPLOYMENTS.map((d) => (
              <div key={d.chainId} className="space-y-2 rounded border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {d.chainName} (Chain {d.chainId})
                  </div>
                  {d.deployer && (
                    <span className="text-xs text-gray-500">Deployer: {d.deployer}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {Object.entries(d.contracts).map(([name, address]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between gap-3 rounded bg-gray-50 px-2 py-1 font-mono text-sm"
                    >
                      <span className="text-gray-600">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className="break-all text-gray-800">{address}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(address)}
                          title="Copy address"
                        >
                          <Copy className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {copyMessage && <div className="text-xs text-green-600">{copyMessage}</div>}
          </CardContent>
        </Card>
      </div>

      {/* Save-All (settings have a dedicated save; this mirrors that CTA) */}
      <div className="flex justify-center">
        <Button
          size="lg"
          className="bg-gradient-to-r from-purple-600 to-pink-600 px-8 font-medium text-white hover:from-purple-700 hover:to-pink-700"
          onClick={() =>
            save.mutate({
              default_slippage_bps: slippageBps,
              max_gas_price_gwei: maxGasGwei,
              auto_refresh: autoRefresh,
            })
          }
          disabled={isSaving}
        >
          {isSaving ? (
            <span className="inline-flex items-center">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save All Changes"
          )}
        </Button>
      </div>
    </div>
  );
}
