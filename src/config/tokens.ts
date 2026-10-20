// src/config/tokens.ts
import { getV2WrappedNative } from "./contracts";

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
  {
    kind: "erc20",
    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as Address,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" as Address,
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as Address,
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as Address,
    symbol: "AERO",
    name: "Aerodrome",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x532f27101965dd16442E59d40670FaF5eBB142E4" as Address,
    symbol: "BRETT",
    name: "Brett",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" as Address,
    symbol: "DEGEN",
    name: "Degen",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4" as Address,
    symbol: "TOSHI",
    name: "Toshi",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b" as Address,
    symbol: "VIRTUAL",
    name: "Virtual Protocol",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196" as Address,
    symbol: "LINK",
    name: "ChainLink Token",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x22e6966B799c4D5B13BE962E1D117b56327FDa66" as Address,
    symbol: "SNX",
    name: "Synthetix Network Token",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263" as Address,
    symbol: "FBA",
    name: "FBA Token",
    decimals: 18,
    chainId: 8453,
  },
] as const satisfies readonly [Token, Token, ...Token[]];

/* ————— Arbitrum, Optimism, Polygon and Sepolia —————
 * Addresses from Circle's USDC list, Uniswap's default token list and the
 * chains' Uniswap V2 routers (WETH()), checked 2026-10-20.
 */
const ETH_LOGO = "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png";
const WETH_LOGO = "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png";
const USDC_LOGO = "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png";
const USDT_LOGO = "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png";

export const ARBITRUM_TOKENS = [
  { kind: "native", address: "native", symbol: "ETH", name: "Ether", decimals: 18, logoURI: ETH_LOGO, chainId: 42161 },
  { kind: "erc20", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address, symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO, chainId: 42161 },
  { kind: "erc20", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as Address, symbol: "USDT", name: "Tether USD", decimals: 6, logoURI: USDT_LOGO, chainId: 42161 },
  { kind: "erc20", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: WETH_LOGO, chainId: 42161 },
] as const satisfies readonly [Token, Token, ...Token[]];

export const OPTIMISM_TOKENS = [
  { kind: "native", address: "native", symbol: "ETH", name: "Ether", decimals: 18, logoURI: ETH_LOGO, chainId: 10 },
  { kind: "erc20", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Address, symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO, chainId: 10 },
  { kind: "erc20", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" as Address, symbol: "USDT", name: "Tether USD", decimals: 6, logoURI: USDT_LOGO, chainId: 10 },
  { kind: "erc20", address: "0x4200000000000000000000000000000000000006" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: WETH_LOGO, chainId: 10 },
] as const satisfies readonly [Token, Token, ...Token[]];

export const POLYGON_TOKENS = [
  { kind: "native", address: "native", symbol: "POL", name: "POL", decimals: 18, chainId: 137 },
  { kind: "erc20", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address, symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO, chainId: 137 },
  { kind: "erc20", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as Address, symbol: "USDT", name: "Tether USD", decimals: 6, logoURI: USDT_LOGO, chainId: 137 },
  { kind: "erc20", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as Address, symbol: "WPOL", name: "Wrapped POL", decimals: 18, chainId: 137 },
] as const satisfies readonly [Token, Token, ...Token[]];

export const SEPOLIA_TOKENS = [
  { kind: "native", address: "native", symbol: "ETH", name: "Sepolia Ether", decimals: 18, logoURI: ETH_LOGO, chainId: 11155111 },
  { kind: "erc20", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address, symbol: "USDC", name: "USD Coin (test)", decimals: 6, logoURI: USDC_LOGO, chainId: 11155111 },
  { kind: "erc20", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: WETH_LOGO, chainId: 11155111 },
] as const satisfies readonly [Token, Token, ...Token[]];

export function getTokensForChain(chainId?: number): readonly [Token, Token, ...Token[]] {
  switch (chainId) {
    case 8453:
      return BASE_MAINNET_TOKENS;
    case 42161:
      return ARBITRUM_TOKENS;
    case 10:
      return OPTIMISM_TOKENS;
    case 137:
      return POLYGON_TOKENS;
    case 11155111:
      return SEPOLIA_TOKENS;
    default:
      return MAINNET_TOKENS;
  }
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

/** The chain's wrapped native token, as its Uniswap V2 router uses it. */
export function getWrappedNativeAddress(chainId?: number): Address {
  return getV2WrappedNative(chainId);
}
