// src/lib/launchpad/storage.ts
import type { Address } from "viem";
import type { LaunchedTokenRecord } from "./types";

const STORAGE_KEY = "shaggy_dex_launched_tokens";

/** Run by this project's wallet. Facts checked on Base; cards read supply live. */
const PROJECT_WALLET = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

const projectToken = (
  tokenAddress: Address,
  tokenName: string,
  tokenSymbol: string,
  initialSupply: string,
  typeLabel: string,
  description: string
): LaunchedTokenRecord => ({
  tokenAddress,
  tokenName,
  tokenSymbol,
  decimals: 18,
  initialSupply,
  description,
  archetype: "project_token",
  typeLabel,
  creatorAddress: PROJECT_WALLET,
  chainId: 8453,
  deployedAt: 0,
  txHash: "",
});

export const CANONICAL_LAUNCHED_TOKENS: LaunchedTokenRecord[] = [
  projectToken(
    "0x051c758521971f5c5a84edaf18eea12854375469",
    "Shaggy Dogg",
    "SD",
    "1,000,000",
    "Mintable, admin-controlled",
    "Governance token for the Shaggy Dogg ecosystem."
  ),
  projectToken(
    "0xC17227AAa33C54634B6cE7AD0bf33A156563c179",
    "Mutt Rewards",
    "MRWD",
    "1,000,000,000,000",
    "Fixed supply, no admin",
    "Liquidity rewards and staking token."
  ),
  projectToken(
    "0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263",
    "Foundational Black American",
    "FBA",
    "1,000,000",
    "Mintable, admin-controlled",
    "Community token on Base."
  ),
  {
    ...projectToken(
      "0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C",
      "Equilnyxs",
      "EQX",
      "150,000,000",
      "Restricted share token",
      "Equilnyxs share token. Only verified wallets can hold or receive it."
    ),
    tradeNote: "Not trading yet",
  },
];

/** Project tokens a wallet runs, which belong in its portfolio even at a zero balance. */
export function projectTokensFor(wallet: Address | undefined): LaunchedTokenRecord[] {
  if (!wallet) return [];
  return CANONICAL_LAUNCHED_TOKENS.filter(
    (token) => token.creatorAddress.toLowerCase() === wallet.toLowerCase()
  );
}

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
