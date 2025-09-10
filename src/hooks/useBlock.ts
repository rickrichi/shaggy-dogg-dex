// src/hooks/useBlock.ts
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';

/**
 * Fetch a specific block by number using the configured wagmi Public Client.
 *
 * - No `any` usage; the data type is inferred from viem at call time.
 * - Query is disabled until a client exists (prevents Fast Refresh/hydration issues).
 * - Runtime guard inside `queryFn` removes "possibly undefined" TypeScript error.
 */
export function useBlock(blockNumber: bigint) {
  const publicClient = usePublicClient(); // may be undefined before WagmiConfig is ready

  return useQuery({
    queryKey: ['block', blockNumber],
    enabled: Boolean(publicClient),
    staleTime: 15_000,
    gcTime: 60_000,
    queryFn: async () => {
      if (!publicClient) {
        // Enabled=false should already prevent execution, but this keeps types & runtime safe.
        throw new Error('Public client is not ready.');
      }
      return publicClient.getBlock({ blockNumber });
    },
  });
}
