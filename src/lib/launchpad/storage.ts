// src/lib/launchpad/storage.ts
import type { LaunchedTokenRecord } from "./types";

const STORAGE_KEY = "shaggy_dex_launched_tokens";

export const CANONICAL_LAUNCHED_TOKENS: LaunchedTokenRecord[] = [
  {
    tokenAddress: "0x051c758521971f5c5a84edaf18eea12854375469",
    tokenName: "Shaggy Dogg",
    tokenSymbol: "SD",
    decimals: 18,
    initialSupply: "1,000,000,000",
    description: "Foundational governance token and primary DEX liquidity routing asset.",
    archetype: "standard_governance",
    creatorAddress: "0x0000000000000000000000000000000000000000",
    chainId: 8453,
    deployedAt: 1726712000000,
    txHash: "",
  },
];

export function getStoredLaunchedTokens(): LaunchedTokenRecord[] {
  if (typeof window === "undefined") return CANONICAL_LAUNCHED_TOKENS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return CANONICAL_LAUNCHED_TOKENS;

    const userTokens = JSON.parse(raw) as LaunchedTokenRecord[];
    // Deduplicate against canonical tokens by address
    const canonicalAddresses = new Set(
      CANONICAL_LAUNCHED_TOKENS.map((t) => t.tokenAddress.toLowerCase())
    );
    const customTokens = userTokens.filter(
      (t) => !canonicalAddresses.has(t.tokenAddress.toLowerCase())
    );

    return [...CANONICAL_LAUNCHED_TOKENS, ...customTokens];
  } catch (err) {
    console.error("Failed to read launched tokens from localStorage:", err);
    return CANONICAL_LAUNCHED_TOKENS;
  }
}

export function saveLaunchedToken(token: LaunchedTokenRecord): void {
  if (typeof window === "undefined") return;

  try {
    const existing = getStoredLaunchedTokens();
    const isAlreadyPresent = existing.some(
      (t) => t.tokenAddress.toLowerCase() === token.tokenAddress.toLowerCase()
    );

    if (isAlreadyPresent) return;

    const raw = localStorage.getItem(STORAGE_KEY);
    const userTokens: LaunchedTokenRecord[] = raw ? (JSON.parse(raw) as LaunchedTokenRecord[]) : [];
    userTokens.unshift(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userTokens));
  } catch (err) {
    console.error("Failed to save launched token:", err);
  }
}
