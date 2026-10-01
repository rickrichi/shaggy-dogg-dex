import type { Address } from "viem";

export interface DexVenue {
  readonly id: "uniswap-v2" | "sushiswap-v2" | "pancakeswap-v2";
  readonly name: string;
  readonly router: Address;
}

/** Ethereum-mainnet V2-compatible router deployments. */
export const DEX_VENUES: readonly DexVenue[] = [
  {
    id: "uniswap-v2",
    name: "Uniswap V2",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  },
  {
    id: "sushiswap-v2",
    name: "SushiSwap V2",
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  },
  {
    id: "pancakeswap-v2",
    name: "PancakeSwap V2",
    router: "0xEfF92A263d31888d860bD50809A8D171709b7b1c",
  },
] as const;

export const BASE_DEX_VENUES: readonly DexVenue[] = [
  {
    id: "uniswap-v2",
    name: "Uniswap V2 (Base)",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  },
  {
    id: "pancakeswap-v2",
    name: "PancakeSwap V2 (Base)",
    router: "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb",
  },
] as const;

export function getDexVenuesForChain(chainId?: number): readonly DexVenue[] {
  if (chainId === 8453) {
    return BASE_DEX_VENUES;
  }
  return DEX_VENUES;
}
