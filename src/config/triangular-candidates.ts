// src/config/triangular-candidates.ts
// Candidate middle assets for the triangular arbitrage cycle (WETH -> USDC -> candidate -> WETH).
// Each entry was verified on-chain (symbol(), decimals(), and a live Quoter round-trip of USDC ->
// candidate -> WETH and WETH -> candidate -> USDC) to have real depth on both legs -- the dual
// requirement this route shape needs, and the exact asymmetry that made DAI unusable here: most
// tokens pair deeply with WETH (Uniswap's default base pair) but few also pair deeply with USDC.
import type { Address } from "viem";

import type { TriangularCandidate } from "@/lib/amm/bot-market-snapshot";

export const TRIANGULAR_CANDIDATES: readonly TriangularCandidate[] = [
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, decimals: 8 },
  { symbol: "VIRTUAL", address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b" as Address, decimals: 18 },
  { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as Address, decimals: 6 },
  { symbol: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as Address, decimals: 18 },
  { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196" as Address, decimals: 18 },
  { symbol: "AAVE", address: "0x63706e401c06ac8513145b7687A14804d17f814b" as Address, decimals: 18 },
  { symbol: "UNI", address: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83" as Address, decimals: 18 },
  { symbol: "TOSHI", address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4" as Address, decimals: 18 },
];
