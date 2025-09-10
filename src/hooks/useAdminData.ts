// src/hooks/useAdminData.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSettings, updateSettings,
  listFeaturedTokens, addFeaturedToken, removeFeaturedToken,
  listTokenLists, addTokenList, removeTokenList,
} from '@/lib/adminApi';
import type { FeaturedToken } from '@/lib/adminSchemas';

export function useAdminSettings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['adminSettings'], queryFn: fetchSettings, staleTime: 30_000 });

  const save = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminSettings'] }),
  });

  return { settings, save };
}

export function useFeaturedTokens() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['featuredTokens'], queryFn: listFeaturedTokens, staleTime: 15_000 });

  const add = useMutation({
    mutationFn: (ft: Omit<FeaturedToken, 'created_at' | 'created_by'>) => addFeaturedToken(ft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['featuredTokens'] }),
  });

  const remove = useMutation({
    mutationFn: ({ chain_id, address }: { chain_id: number; address: string }) => removeFeaturedToken(chain_id, address),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['featuredTokens'] }),
  });

  return { tokens, add, remove };
}

export function useTokenLists() {
  const qc = useQueryClient();
  const lists = useQuery({ queryKey: ['tokenLists'], queryFn: listTokenLists, staleTime: 30_000 });

  const add = useMutation({
    mutationFn: ({ url, name }: { url: string; name?: string }) => addTokenList(url, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tokenLists'] }),
  });

  const remove = useMutation({
    mutationFn: (url: string) => removeTokenList(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tokenLists'] }),
  });

  return { lists, add, remove };
}
