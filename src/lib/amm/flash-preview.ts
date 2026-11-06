// src/lib/amm/flash-preview.ts
// The live economics for the Flash Loans page: exactly the route "Dispatch Live Aave Flash Loan"
// would take (top-ranked middle asset, best Uniswap V3 fee-tier cycle through it) and what it
// returns against principal + Aave's live premium. Gas and the min-profit target are checked by
// Dispatch at send time and are not part of this preview.
import {
  type BotQuoteVenues,
  rankMidAssetCandidates,
  type TriangularCandidate,
} from "./bot-market-snapshot";
import {
  bestV3Cycle,
  flashPremium,
  flashTriangleTokens,
  readAavePremiumBps,
  type V3Cycle,
} from "./flash-routes";

import type { Address, PublicClient } from "viem";

export type FlashPreview =
  | {
      kind: "route";
      mid: TriangularCandidate;
      cycle: V3Cycle;
      premiumBps: number;
      principal: bigint;
      premium: bigint;
      owed: bigint;
      /** amountOut - owed; negative when the cycle loses money before gas. */
      edge: bigint;
    }
  | { kind: "held"; reason: string };

export async function liveFlashPreview(
  client: Pick<PublicClient, "multicall" | "readContract">,
  venues: BotQuoteVenues,
  aavePool: Address,
  asset: string,
  principal: bigint
): Promise<FlashPreview> {
  if (asset !== "USDC" && asset !== "WETH") {
    return { kind: "held", reason: "Flash routes borrow USDC or WETH only." };
  }
  if (principal <= 0n) return { kind: "held", reason: "Enter a borrow amount." };
  const ranked = await rankMidAssetCandidates(client, venues);
  const mid = ranked[0];
  if (!mid) return { kind: "held", reason: "No middle asset currently quotes on both legs." };
  const { tokens } = flashTriangleTokens(asset, venues, mid.address);
  const [cycle, premiumBps] = await Promise.all([
    bestV3Cycle(client, venues.uniswapV3Quoter, tokens, principal),
    readAavePremiumBps(client, aavePool),
  ]);
  if (!cycle)
    return { kind: "held", reason: `No Uniswap V3 liquidity for the ${mid.symbol} cycle.` };
  const premium = flashPremium(principal, premiumBps);
  const owed = principal + premium;
  return {
    kind: "route",
    mid,
    cycle,
    premiumBps,
    principal,
    premium,
    owed,
    edge: cycle.amountOut - owed,
  };
}

/** "USDC → cbBTC → WETH → USDC" from a cycle's token addresses. */
export function routeLabel(
  tokens: readonly Address[],
  venues: Pick<BotQuoteVenues, "usdc" | "weth" | "candidates">
): string {
  const name = (a: Address) => {
    const lower = a.toLowerCase();
    if (lower === venues.usdc.toLowerCase()) return "USDC";
    if (lower === venues.weth.toLowerCase()) return "WETH";
    return (
      venues.candidates.find((c) => c.address.toLowerCase() === lower)?.symbol ?? a.slice(0, 8)
    );
  };
  return tokens.map(name).join(" → ");
}
