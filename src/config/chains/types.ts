// Strict types for chain configuration

export const SUPPORTED_CHAIN_IDS = [1, 137, 10, 42161, 8453, 11155111] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export type ChainKey =
  | 'ethereum'
  | 'polygon'
  | 'optimism'
  | 'arbitrum'
  | 'base'
  | 'sepolia';

export type EnvKey =
  | 'VITE_ALCHEMY_MAINNET_URL'
  | 'VITE_ALCHEMY_POLYGON_URL'
  | 'VITE_ALCHEMY_OPTIMISM_URL'
  | 'VITE_ALCHEMY_ARBITRUM_URL'
  | 'VITE_ALCHEMY_BASE_URL'
  | 'VITE_ALCHEMY_SEPOLIA_URL';

export interface ChainConfig {
  /** EIP-155 chain id */
  id: SupportedChainId;
  /** Stable machine key */
  key: ChainKey;
  /** Human name */
  name: string;
  /** Block explorer base url */
  explorerUrl: string;
  /** Vite env var key for RPC/Alchemy endpoint */
  envKey: EnvKey;
}
