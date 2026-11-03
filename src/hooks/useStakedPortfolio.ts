import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { getStoredLaunchedTokens } from "@/lib/launchpad/storage";
import {
  discoverStakedPortfolio,
  knownStakingSources,
  type PositionReader,
} from "@/lib/staked-positions";

import type { Address } from "viem";

/** A connected wallet's staked tokens and V3 positions, shared by every page that shows them. */
export function useStakedPortfolio(owner: Address | undefined) {
  const client = usePublicClient({ chainId: 8453 });
  return useQuery({
    queryKey: ["staked-portfolio", owner],
    enabled: Boolean(owner && client),
    staleTime: 30_000,
    queryFn: () =>
      discoverStakedPortfolio(
        client as unknown as PositionReader,
        owner!,
        knownStakingSources(getStoredLaunchedTokens())
      ),
  });
}
