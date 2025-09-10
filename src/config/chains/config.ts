import { type ChainConfig, type SupportedChainId } from './types';

export const CHAIN_CONFIG: Readonly<Record<SupportedChainId, ChainConfig>> = {
  1: {
    id: 1,
    key: 'ethereum',
    name: 'Ethereum',
    explorerUrl: 'https://etherscan.io',
    envKey: 'VITE_ALCHEMY_MAINNET_URL',
  },
  137: {
    id: 137,
    key: 'polygon',
    name: 'Polygon',
    explorerUrl: 'https://polygonscan.com',
    envKey: 'VITE_ALCHEMY_POLYGON_URL',
  },
  10: {
    id: 10,
    key: 'optimism',
    name: 'Optimism',
    explorerUrl: 'https://optimistic.etherscan.io',
    envKey: 'VITE_ALCHEMY_OPTIMISM_URL',
  },
  42161: {
    id: 42161,
    key: 'arbitrum',
    name: 'Arbitrum',
    explorerUrl: 'https://arbiscan.io',
    envKey: 'VITE_ALCHEMY_ARBITRUM_URL',
  },
  8453: {
    id: 8453,
    key: 'base',
    name: 'Base',
    explorerUrl: 'https://basescan.org',
    envKey: 'VITE_ALCHEMY_BASE_URL',
  },
  11155111: {
    id: 11155111,
    key: 'sepolia',
    name: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    envKey: 'VITE_ALCHEMY_SEPOLIA_URL',
  },
} as const;

/** Convenience ordered list of configs */
export const ALL_CHAINS = (Object.keys(CHAIN_CONFIG) as unknown as SupportedChainId[])
  .sort((a, b) => Number(a) - Number(b))
  .map((id) => CHAIN_CONFIG[id]);
