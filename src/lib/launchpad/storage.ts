// src/lib/launchpad/storage.ts
import type { LaunchedTokenRecord } from "./types";

const STORAGE_KEY = "shaggy_dex_launched_tokens";

export const CANONICAL_LAUNCHED_TOKENS: LaunchedTokenRecord[] = [
  {
    tokenAddress: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7",
    tokenName: "Astro Mutt",
    tokenSymbol: "AMUTT",
    decimals: 18,
    initialSupply: "100,000,000",
    description:
      "Community utility and isolated lending asset for the Shaggy Mutt DeFi ecosystem on Base.",
    archetype: "morpho_blue_isolated",
    stakingAddress: "0x055BB4eD8d5464C25D71391E940ce53CA30845fC",
    vaultAddress: "0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5",
    pairAddress: "0x581B294FeC1A4332f17cf18B49D68087c09b6784",
    creatorAddress: "0x0000000000000000000000000000000000000000",
    chainId: 8453,
    deployedAt: 1727712000000,
    txHash: "0x40a7cf26227fe41369796ff6d934bb6a3014a66d03d3fec5cb3a9d0eeef70014",
  },
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
