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

export const UNISWAP_V3_QUOTER_V2_BASE: Address = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

export const UNISWAP_V3_ROUTER_BASE: Address = "0x2626664c2603336E57B271c5C0b26F421741e481";

export interface V3Deployment {
  readonly factory: Address;
  readonly quoter: Address;
  readonly router: Address;
}

export const UNISWAP_V3: Readonly<Record<number, V3Deployment>> = {
  1: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  8453: {
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoter: UNISWAP_V3_QUOTER_V2_BASE,
    router: UNISWAP_V3_ROUTER_BASE,
  },
};

export function getUniswapV3Deployment(chainId?: number): V3Deployment | undefined {
  return chainId !== undefined ? UNISWAP_V3[chainId] : undefined;
}

/** Base-only V2 forks, checked on-chain 2026-10-30: router.factory(), router.WETH(), live quote. */
export const BASE_V2_VENUES = {
  "PancakeSwap V2": {
    router: "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb",
    factory: "0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E",
  },
  "SushiSwap V2": {
    router: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",
    factory: "0x71524B4f93c58fcbF659783284E38825f0622859",
  },
  BaseSwap: {
    router: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
    factory: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
  },
} as const;

/**
 * Base-only V3 forks, checked on-chain 2026-10-30: router and quoter factory(), live quotes.
 * `hopFees` limits two-hop candidates so each swap does not add dozens of RPC reads.
 */
export const BASE_V3_VENUES = {
  "PancakeSwap V3": {
    router: "0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86",
    quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
    factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    fees: [100, 500, 2500, 10000],
    hopFees: [500, 2500],
  },
  "SushiSwap V3": {
    router: "0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f",
    quoter: "0xb1E835Dc2785b52265711e17fCCb0fd018226a6e",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    fees: [100, 500, 3000, 10000],
    hopFees: [500, 3000],
  },
} as const;

export const CHAIN_USDC: Readonly<Record<number, Address>> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

export function getChainUsdcAddress(chainId?: number): Address | undefined {
  return chainId !== undefined ? CHAIN_USDC[chainId] : undefined;
}

export const DEFAULT_SLIPPAGE = 0.5; // percent
export const SWAP_DEADLINE_BUFFER = 60 * 15; // 15 minutes in seconds
