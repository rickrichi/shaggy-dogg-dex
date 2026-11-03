// src/lib/launchpad/tradeLink.ts
import { getSwapDropdownTokens } from "@/config/tokens";

import type { Address } from "viem";

export interface TradeLink {
  href: string;
  external: boolean;
  label: string;
}

/**
 * Swap only knows the tokens on its list and silently falls back to another token for the rest,
 * so anything else opens on Uniswap, where the exact address works.
 */
export function tradeLinkFor(tokenAddress: Address): TradeLink {
  const listed = getSwapDropdownTokens(8453).some(
    (token) => token.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  return listed
    ? { href: `/swap?output=${tokenAddress}`, external: false, label: "Trade Swap" }
    : {
        href: `https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenAddress}`,
        external: true,
        label: "Trade on Uniswap",
      };
}
