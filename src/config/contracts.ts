// src/config/contracts.ts
import type { Address } from "viem";

export const CONTRACTS = {
  // Uniswap V2 Router on mainnet; replace per-chain if you’re multi-chain
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address,
} as const;

export function getUniswapV2Router(chainId?: number): Address {
  if (chainId === 8453) {
    return "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as Address; // Base Mainnet
  }
  return "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address; // Ethereum Mainnet
}

export function getUniswapV2Factory(chainId?: number): Address {
  if (chainId === 8453) {
    return "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" as Address; // Base Mainnet
  }
  return "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address; // Ethereum Mainnet
}

export const UNISWAP_V3_QUOTER_V2_BASE: Address =
  "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

export const DEFAULT_SLIPPAGE = 0.5; // percent
export const SWAP_DEADLINE_BUFFER = 60 * 15; // 15 minutes in seconds
