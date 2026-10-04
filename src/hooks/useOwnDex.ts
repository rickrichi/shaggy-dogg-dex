import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { DEX_CHAIN_ID, loadDexDeployment } from "@/config/dex/deployment";
import { verifyDexDeployment } from "@/lib/amm/own-dex";

export function useOwnDex() {
  const [deployment] = useState(loadDexDeployment);
  const client = usePublicClient({ chainId: DEX_CHAIN_ID });
  const verification = useQuery({
    queryKey: ["own-dex-verification", deployment?.factory, deployment?.router],
    enabled: Boolean(client && deployment),
    queryFn: async () => {
      if (!client || !deployment) throw new Error("DEX deployment is not configured.");
      return verifyDexDeployment(client, deployment);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  return {
    deployment,
    client,
    verification,
    ready: Boolean(verification.data && !verification.isError),
  };
}
