// File: src/lib/tokens.ts
// Description: Defines token watchlists for different chains
// ==================================================================================
import { arbitrum, mainnet, optimism, polygon, sepolia } from "wagmi/chains";

// Add new types for the required properties
export interface NativeCurrencyConfig {
  name: string;
  symbol: string;
  decimals: number;
  coinGeckoId: string;
}

export interface TokenConfig {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  coinGeckoId: string; // <-- Add this property
}

export interface ChainConfig {
  chainName: string;
  nativeCurrency: NativeCurrencyConfig; // <-- Add this property
  tokens: TokenConfig[];
}

// Update the watchlist data with the new properties
const tokenWatchlist: Record<number, ChainConfig> = {
  [mainnet.id]: {
    chainName: mainnet.name,
    nativeCurrency: {
      name: mainnet.nativeCurrency.name,
      symbol: mainnet.nativeCurrency.symbol,
      decimals: mainnet.nativeCurrency.decimals,
      coinGeckoId: "ethereum",
    },
    tokens: [
      {
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        coinGeckoId: "tether",
      },
      {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        coinGeckoId: "usd-coin",
      },
      {
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        name: "Dai Stablecoin",
        symbol: "DAI",
        decimals: 18,
        coinGeckoId: "dai",
      },
    ],
  },
  [arbitrum.id]: {
    chainName: arbitrum.name,
    nativeCurrency: {
      name: arbitrum.nativeCurrency.name,
      symbol: arbitrum.nativeCurrency.symbol,
      decimals: arbitrum.nativeCurrency.decimals,
      coinGeckoId: "ethereum",
    },
    tokens: [
      {
        address: "0xFd086bC7CD5C481dC3f7dC261a847Ee60d65aF0b",
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        coinGeckoId: "tether",
      },
    ],
  },
  [polygon.id]: {
    chainName: polygon.name,
    nativeCurrency: {
      name: polygon.nativeCurrency.name,
      symbol: polygon.nativeCurrency.symbol,
      decimals: polygon.nativeCurrency.decimals,
      coinGeckoId: "matic-network",
    },
    tokens: [
      {
        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        coinGeckoId: "tether",
      },
    ],
  },
  [optimism.id]: {
    chainName: optimism.name,
    nativeCurrency: {
      name: optimism.nativeCurrency.name,
      symbol: optimism.nativeCurrency.symbol,
      decimals: optimism.nativeCurrency.decimals,
      coinGeckoId: "ethereum",
    },
    tokens: [],
  },
  [sepolia.id]: {
    chainName: sepolia.name,
    nativeCurrency: {
      name: sepolia.nativeCurrency.name,
      symbol: sepolia.nativeCurrency.symbol,
      decimals: sepolia.nativeCurrency.decimals,
      coinGeckoId: "ethereum",
    },
    tokens: [],
  },
};

export function tokenWatchlistForChain(chainId: number): ChainConfig {
  return (
    tokenWatchlist[chainId] || {
      chainName: "Unknown Chain",
      nativeCurrency: {
        name: "Unknown",
        symbol: "UNK",
        decimals: 18,
        coinGeckoId: "unknown",
      },
      tokens: [],
    }
  );
}
