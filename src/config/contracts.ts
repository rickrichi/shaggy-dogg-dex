// src/config/contracts.ts
import type { Address } from 'viem';

export const CONTRACTS = {
  // Uniswap V2 Router on mainnet; replace per-chain if you’re multi-chain
  UNISWAP_V2_ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as Address,
  // Add factory or other infra addresses as needed
} as const;

export const DEFAULT_SLIPPAGE = 0.5;            // percent
export const SWAP_DEADLINE_BUFFER = 60 * 15;     // 15 minutes in seconds
