// src/config/tokens.ts
import type { Address } from "viem";

/** ————— Core token model (discriminated union) ————— */
export type NativeSentinel = "native";

export interface BaseToken {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoURI?: string;
  readonly chainId: number;
}

export interface NativeToken extends BaseToken {
  readonly kind: "native";
  readonly address: NativeSentinel; // 'native'
}

export interface Erc20Token extends BaseToken {
  readonly kind: "erc20";
  readonly address: Address; // 0x-prefixed checksummed address
}

export type Token = NativeToken | Erc20Token;

/** ————— Type guards ————— */
export function isNativeToken(token: Token): token is NativeToken {
  return token.kind === "native";
}

export function isErc20Token(token: Token): token is Erc20Token {
  return token.kind === "erc20";
}

/** ————— Ethereum mainnet tokens —————
 * Tuple guarantees: at least two tokens so MAINNET_TOKENS[0..1] are Token (not Token | undefined)
 */
export const MAINNET_TOKENS = [
  {
    kind: "native",
    address: "native",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, // USDT
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address, // DAI
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, // WBTC
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, // WETH
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    // Canonical Ethereum-mainnet deployment recorded by LUMIORO_MAINNET_RELEASE.
    address: "0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E" as Address,
    symbol: "LUMIORO",
    name: "LUMIORO Token",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x051c758521971f5c5a84edaf18eea12854375469" as Address,
    symbol: "SD",
    name: "Shaggy Dogg",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0x051c758521971f5c5a84edaf18eea12854375469.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7" as Address,
    symbol: "AMUTT",
    name: "Astro Mutt",
    decimals: 18,
    chainId: 8453,
  },
] as const satisfies readonly [Token, Token, ...Token[]];

export const BASE_MAINNET_TOKENS = [
  {
    kind: "native",
    address: "native",
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7" as Address,
    symbol: "AMUTT",
    name: "Astro Mutt",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x051c758521971f5c5a84edaf18eea12854375469" as Address,
    symbol: "SD",
    name: "Shaggy Dogg",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x4200000000000000000000000000000000000006" as Address,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
    chainId: 8453,
  },
] as const satisfies readonly [Token, Token, ...Token[]];

export function getTokensForChain(chainId?: number): readonly [Token, Token, ...Token[]] {
  if (chainId === 8453) {
    return BASE_MAINNET_TOKENS;
  }
  return MAINNET_TOKENS;
}

/** Literal union of known symbols inferred from MAINNET_TOKENS */
export type TokenSymbol = (typeof MAINNET_TOKENS)[number]["symbol"];

/** ————— Helpers (type-safe, no `any`) ————— */
export function getTokenByAddress(address: Address | NativeSentinel): Token | undefined {
  if (address === "native") {
    // Single equality branch avoids unsafe toString() on discriminated data
    return MAINNET_TOKENS.find((t) => t.kind === "native" && t.address === "native");
  }
  const needle = address.toLowerCase();
  return MAINNET_TOKENS.find((t) => t.kind === "erc20" && t.address.toLowerCase() === needle);
}

export function getTokenBySymbol(symbol: string): Token | undefined {
  const needle = symbol.toUpperCase();
  return MAINNET_TOKENS.find((t) => t.symbol.toUpperCase() === needle);
}

/** Overload for stricter callers who know the symbol is from our list */
export function getTokenByKnownSymbol<S extends TokenSymbol>(
  symbol: S
): Extract<Token, { symbol: S }> {
  const token = MAINNET_TOKENS.find((t) => t.symbol === symbol);
  if (!token) {
    // This should be unreachable if S is constrained to TokenSymbol
    throw new Error(`Unknown token symbol: ${symbol as string}`);
  }
  return token as Extract<Token, { symbol: S }>;
}

/** ————— Default token pairs (fully typed from known symbols) ————— */
export const DEFAULT_TOKEN_PAIRS: ReadonlyArray<{
  readonly from: TokenSymbol;
  readonly to: TokenSymbol;
}> = [
  { from: "ETH", to: "USDC" },
  { from: "ETH", to: "USDT" },
  { from: "USDC", to: "DAI" },
  { from: "WBTC", to: "ETH" },
  { from: "ETH", to: "LUMIORO" },
  { from: "ETH", to: "SD" },
  { from: "ETH", to: "AMUTT" },
] as const;

/** ————— Canonical wrapped native (WETH) ————— */
const wrappedNative = MAINNET_TOKENS.find(
  (token) => token.symbol === "WETH" && token.kind === "erc20"
);

if (!wrappedNative || wrappedNative.kind !== "erc20") {
  throw new Error("WETH token configuration is required for swap routing.");
}

export const WRAPPED_NATIVE_ADDRESS: Address = wrappedNative.address;

export function getWrappedNativeAddress(chainId?: number): Address {
  if (chainId === 8453) {
    return "0x4200000000000000000000000000000000000006" as Address;
  }
  return WRAPPED_NATIVE_ADDRESS;
}
