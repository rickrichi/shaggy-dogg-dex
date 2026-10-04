// src/lib/adminApi.ts
// Admin data lives on the Hono API server (server/src/routes/admin.ts), proxied by Vite at /api.
// Access is a wallet-signed (SIWE) session held in an HttpOnly cookie; no Supabase involvement.
import {
  type AdminChain,
  type AdminChainInput,
  AdminChainSchema,
  type AdminSession,
  AdminSessionSchema,
  type DexSettings,
  type DexSettingsInput,
  DexSettingsSchema,
  type FeaturedToken,
  type FeaturedTokenInput,
  FeaturedTokenInputSchema,
  FeaturedTokenSchema,
  type TokenList,
  type TokenListInput,
  TokenListInputSchema,
  TokenListSchema,
} from "./adminSchemas";

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const response = await fetch(`/api/admin${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(method === "GET"
      ? {}
      : { headers: { "Content-Type": "application/json", "X-Admin-Request": "1" } }),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof (data as { error?: unknown } | null)?.error === "string"
        ? (data as { error: string }).error
        : `Admin request failed (HTTP ${response.status})`;
    throw new AdminApiError(message, response.status);
  }
  return data as T;
}

// ============================================================================
// Wallet sign-in (Sign-In with Ethereum)
// ============================================================================

/** Current admin session, or null when signed out. */
export async function fetchAdminSession(): Promise<AdminSession | null> {
  try {
    return AdminSessionSchema.parse(await adminFetch("/session"));
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return null;
    throw error;
  }
}

export async function fetchAdminNonce(): Promise<{ nonce: string; enabled: boolean }> {
  return adminFetch("/nonce");
}

export async function signInAdmin(message: string, signature: string): Promise<AdminSession> {
  return AdminSessionSchema.parse(
    await adminFetch("/login", { method: "POST", body: { message, signature } })
  );
}

export async function signOutAdmin(): Promise<void> {
  await adminFetch("/logout", { method: "POST", body: {} });
}

// ============================================================================
// DEX Settings
// ============================================================================

export async function fetchDexSettings(): Promise<DexSettings> {
  return DexSettingsSchema.parse(await adminFetch("/settings"));
}

export async function updateDexSettings(input: DexSettingsInput): Promise<DexSettings> {
  return DexSettingsSchema.parse(await adminFetch("/settings", { method: "PUT", body: input }));
}

// ============================================================================
// Admin Chains
// ============================================================================

export async function listAdminChains(): Promise<AdminChain[]> {
  const rows = await adminFetch<unknown[]>("/chains");
  return rows.map((row) => AdminChainSchema.parse(row));
}

export async function upsertAdminChain(input: AdminChainInput): Promise<void> {
  await adminFetch("/chains", { method: "PUT", body: input });
}

export async function deleteAdminChain(chain: string): Promise<void> {
  await adminFetch(`/chains/${encodeURIComponent(chain)}`, { method: "DELETE" });
}

// ============================================================================
// Featured Tokens
// ============================================================================

export async function listFeaturedTokens(): Promise<FeaturedToken[]> {
  const rows = await adminFetch<unknown[]>("/featured-tokens");
  return rows.map((row) => FeaturedTokenSchema.parse(row));
}

export async function addFeaturedToken(input: FeaturedTokenInput): Promise<void> {
  const body = FeaturedTokenInputSchema.parse(input);
  await adminFetch("/featured-tokens", {
    method: "POST",
    body: { ...body, symbol: body.symbol || null, name: body.name || null },
  });
}

export async function removeFeaturedToken(id: string): Promise<void> {
  await adminFetch(`/featured-tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ============================================================================
// Token Lists
// ============================================================================

export async function listTokenLists(): Promise<TokenList[]> {
  const rows = await adminFetch<unknown[]>("/token-lists");
  return rows.map((row) => TokenListSchema.parse(row));
}

export async function addTokenList(input: TokenListInput): Promise<void> {
  await adminFetch("/token-lists", { method: "POST", body: TokenListInputSchema.parse(input) });
}

export async function updateTokenList(id: string, enabled: boolean): Promise<void> {
  await adminFetch(`/token-lists/${encodeURIComponent(id)}`, { method: "PATCH", body: { enabled } });
}

export async function removeTokenList(id: string): Promise<void> {
  await adminFetch(`/token-lists/${encodeURIComponent(id)}`, { method: "DELETE" });
}
