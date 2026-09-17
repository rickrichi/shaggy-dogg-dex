// src/hooks/useAdminData.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addFeaturedToken,
  addTokenList,
  checkAdminStatus,
  deleteAdminChain,
  fetchDexSettings,
  fetchProfile,
  listAdminChains,
  listFeaturedTokens,
  listTokenLists,
  removeFeaturedToken,
  removeTokenList,
  updateDexSettings,
  updateProfile,
  updateTokenList,
  upsertAdminChain,
} from "@/lib/adminApi";

import type {
  AdminChainInput,
  FeaturedTokenInput,
  ProfileInput,
  TokenListInput,
} from "@/lib/adminSchemas";

// ============================================================================
// Admin Status
// ============================================================================

export function useAdminStatus() {
  return useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    staleTime: 60_000, // 1 minute
  });
}

// ============================================================================
// Profile
// ============================================================================

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: ProfileInput }) =>
      updateProfile(userId, input),
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });
}

// ============================================================================
// DEX Settings
// ============================================================================

export function useDexSettings() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["dexSettings"],
    queryFn: fetchDexSettings,
    staleTime: 30_000,
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

export function useAdminChains() {
  const qc = useQueryClient();
  const chains = useQuery({
    queryKey: ["adminChains"],
    queryFn: listAdminChains,
    staleTime: 30_000,
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

export function useFeaturedTokens() {
  const qc = useQueryClient();
  const tokens = useQuery({
    queryKey: ["featuredTokens"],
    queryFn: listFeaturedTokens,
    staleTime: 15_000,
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

export function useTokenLists() {
  const qc = useQueryClient();
  const lists = useQuery({
    queryKey: ["tokenLists"],
    queryFn: listTokenLists,
    staleTime: 30_000,
  });

  const add = useMutation({
    mutationFn: (input: TokenListInput) => addTokenList(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokenLists"] }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateTokenList(id, enabled),
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
