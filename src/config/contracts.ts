// src/config/contracts.ts
import type { Address } from "viem";

export interface V2Deployment {
  readonly name: string;
  readonly router: Address;
  readonly factory: Address;
  /** What the router's WETH() returns: the chain's wrapped native token. */
  readonly wrappedNative: Address;
}

/**
 * Uniswap V2 per chain, from Uniswap's deployment table and checked on-chain
 * (router.factory() and router.WETH() match, factory has pairs) on 2026-10-20.
 */
export const UNISWAP_V2: Readonly<Record<number, V2Deployment>> = {
  1: {
    name: "Ethereum",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  8453: {
    name: "Base",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    wrappedNative: "0x4200000000000000000000000000000000000006",
  },
  42161: {
    name: "Arbitrum",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    factory: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  10: {
    name: "Optimism",
    router: "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2",
    factory: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
    wrappedNative: "0x4200000000000000000000000000000000000006",
  },
  137: {
    name: "Polygon",
    router: "0xedf6066a2b290C185783862C7F4776A2C8077AD1",
    factory: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  11155111: {
    name: "Sepolia",
    router: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
    factory: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6",
    wrappedNative: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },
};

/** Chains this DEX can swap on. */
export function isSwapChain(chainId?: number): boolean {
  return chainId !== undefined && chainId in UNISWAP_V2;
}

function v2(chainId?: number): V2Deployment {
  return (chainId !== undefined && UNISWAP_V2[chainId]) || UNISWAP_V2[1]!;
}

export const CONTRACTS = {
  UNISWAP_V2_ROUTER: UNISWAP_V2[1]!.router,
} as const;

export function getUniswapV2Router(chainId?: number): Address {
  return v2(chainId).router;
}

export function getUniswapV2Factory(chainId?: number): Address {
  return v2(chainId).factory;
}

export function getV2WrappedNative(chainId?: number): Address {
  return v2(chainId).wrappedNative;
}

export const UNISWAP_V3_QUOTER_V2_BASE: Address =
  "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

export const UNISWAP_V3_ROUTER_BASE: Address =
  "0x2626664c2603336E57B271c5C0b26F421741e481";

export const DEFAULT_SLIPPAGE = 0.5; // percent
export const SWAP_DEADLINE_BUFFER = 60 * 15; // 15 minutes in seconds
