// src/hooks/useAdminData.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addFeaturedToken,
  addTokenList,
  deleteAdminChain,
  fetchAdminSession,
  fetchDexSettings,
  listAdminChains,
  listFeaturedTokens,
  listTokenLists,
  removeFeaturedToken,
  removeTokenList,
  updateDexSettings,
  updateTokenList,
  upsertAdminChain,
} from "@/lib/adminApi";

import type { AdminChainInput, FeaturedTokenInput, TokenListInput } from "@/lib/adminSchemas";

// ============================================================================
// Admin Session (wallet sign-in)
// ============================================================================

export const ADMIN_SESSION_KEY = ["adminSession"] as const;

export function useAdminSession() {
  return useQuery({
    queryKey: ADMIN_SESSION_KEY,
    queryFn: fetchAdminSession,
    staleTime: 60_000,
    retry: false,
  });
}

// ============================================================================
// DEX Settings
// ============================================================================

export function useDexSettings(enabled = true) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["dexSettings"],
    queryFn: fetchDexSettings,
    staleTime: 30_000,
    enabled,
  });

  const save = useMutation({
    mutationFn: updateDexSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dexSettings"] }),
  });

  return { settings, save };
}

// ============================================================================
// Admin Chains
// ============================================================================

export function useAdminChains(enabled = true) {
  const qc = useQueryClient();
  const chains = useQuery({
    queryKey: ["adminChains"],
    queryFn: listAdminChains,
    staleTime: 30_000,
    enabled,
  });

  const upsert = useMutation({
    mutationFn: (input: AdminChainInput) => upsertAdminChain(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminChains"] }),
  });

  const remove = useMutation({
    mutationFn: (chain: string) => deleteAdminChain(chain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminChains"] }),
  });

  return { chains, upsert, remove };
}

// ============================================================================
// Featured Tokens
// ============================================================================

export function useFeaturedTokens(enabled = true) {
  const qc = useQueryClient();
  const tokens = useQuery({
    queryKey: ["featuredTokens"],
    queryFn: listFeaturedTokens,
    staleTime: 15_000,
    enabled,
  });

  const add = useMutation({
    mutationFn: (input: FeaturedTokenInput) => addFeaturedToken(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["featuredTokens"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFeaturedToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["featuredTokens"] }),
  });

  return { tokens, add, remove };
}

// ============================================================================
// Token Lists
// ============================================================================

export function useTokenLists(enabled = true) {
  const qc = useQueryClient();
  const lists = useQuery({
    queryKey: ["tokenLists"],
    queryFn: listTokenLists,
    staleTime: 30_000,
    enabled,
  });

  const add = useMutation({
    mutationFn: (input: TokenListInput) => addTokenList(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokenLists"] }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled: on }: { id: string; enabled: boolean }) => updateTokenList(id, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokenLists"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeTokenList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokenLists"] }),
  });

  return { lists, add, toggle, remove };
}

// ============================================================================
// Backward compatibility aliases (deprecated - use new names)
// ============================================================================

/**
 * @deprecated Use useDexSettings instead
 */
export const useAdminSettings = useDexSettings;
