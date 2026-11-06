// src/config/v4-tokens.ts — tokens offered on the Uniswap v4 page. Any other ERC-20 can be added by
// address on the page (symbol and decimals are read from chain).
import type { Address } from "viem";
import type { V4ChainId } from "@/lib/amm/uniswap-v4";

export interface V4Token {
  address: Address;
  symbol: string;
  decimals: number;
}

export const NATIVE_ETH: V4Token = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
  decimals: 18,
};

export const V4_TOKENS: Record<V4ChainId, V4Token[]> = {
  8453: [
    NATIVE_ETH,
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 },
    { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", decimals: 8 },
    { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", decimals: 18 },
    { address: "0xC17227AAa33C54634B6cE7AD0bf33A156563c179", symbol: "MRWD", decimals: 18 },
  ],
  1: [
    NATIVE_ETH,
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
  ],
};

/** Two-hop routing goes through these. */
export const V4_HUBS: Record<V4ChainId, Address[]> = {
  8453: [NATIVE_ETH.address, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
  1: [NATIVE_ETH.address, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
};
