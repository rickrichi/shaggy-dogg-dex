# Base Mainnet Token Mappings & Matrix DEX Router Expansion

**Timestamp:** 2026-10-11T04:30:00-07:00  
**Status:** Permanent Production Flow  
**Target Environment:** `https://dex.lumsian.com/arbitrage/matrix`  
**Network:** Base Mainnet (Chain ID: 8453)  

---

## 1. Executive Summary

Previously, the **Shaggy-Dogg-Dex (Base)** column on the 376-Pair Spot Arbitrage Matrix rendered *"No Base token mapping"* for 99.7% of listed pairs (only row 51 `ETH/USDC` was quoting). 

This update permanently resolves and activates Base token mappings by:
1. **Expanding `BASE_MAINNET_TOKENS` (`src/config/tokens.ts`):** Adding all verified Base mainnet tokens (`USDT`, `cbBTC`, `WBTC`, `DAI`, `AERO`, `BRETT`, `DEGEN`, `TOSHI`, `VIRTUAL`, `LINK`, `SNX`).
2. **Implementing Canonical Symbol Resolution (`src/lib/amm/matrix-quotes.ts`):** Mapping top-of-book CEX symbols (`BTC`, `ETH`, `USD`) to their canonical on-chain Base equivalents (`cbBTC`, `WETH`, `USDC`).
3. **Clarifying Non-Base L1 Assets (`src/components/arbitrage/PairMatrix100.tsx`):** Clearly distinguishing external Layer 1 blockchains (such as Solana, Cardano, Ripple, Dogecoin, Sei, Tron) as `Non-Base L1 (ASSET)` rather than ambiguous missing mappings.
4. **Interactive Quick Filter Badge:** Updating the `Shaggy-Dogg-Dex · Base mappings (25)` quick filter to isolate all active Base-quoted pairs with live on-chain Uniswap V2 / Shaggy-Dogg-Dex multicall quotes.

---

## 2. Token Registry Additions (`src/config/tokens.ts`)

| Symbol | Token Name | Contract Address (Base Chain 8453) | Decimals | Role / Type |
|---|---|---|---|---|
| **WETH** | Wrapped Ether | `0x4200000000000000000000000000000000000006` | 18 | Canonical Base WETH |
| **USDC** | USD Coin | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | Circle Native Base USDC |
| **USDT** | Tether USD | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` | 6 | Tether Official Base USD₮ |
| **cbBTC** | Coinbase Wrapped BTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | 8 | Coinbase Canonical BTC on Base |
| **WBTC** | Wrapped BTC | `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` | 8 | Bridged Wrapped Bitcoin |
| **DAI** | Dai Stablecoin | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 | Maker Canonical DAI |
| **AERO** | Aerodrome | `0x940181a94A35A4569E4529A3CDfB74e38FD98631` | 18 | Base Native DEX Governance |
| **BRETT** | Brett | `0x532f27101965dd16442E59d40670FaF5eBB142E4` | 18 | Base Native Top Memecoin |
| **DEGEN** | Degen | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` | 18 | Farcaster / Base Community Asset |
| **TOSHI** | Toshi | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` | 18 | Base Native Ecosystem Asset |
| **VIRTUAL** | Virtual Protocol | `0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b` | 18 | Base AI Agent Ecosystem |
| **LINK** | Chainlink Token | `0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196` | 18 | Chainlink Base Deployment |
| **SNX** | Synthetix Network Token | `0x22e6966B799c4D5B13BE962E1D117b56327FDa66` | 18 | Synthetix Base Deployment |
| **SD** | Shaggy Dogg | `0x051c758521971f5c5a84edaf18eea12854375469` | 18 | Sovereign DEX Protocol Token |
| **AMUTT** | Astro Mutt | `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7` | 18 | Sovereign DEX Utility Token |

---

## 3. Base On-Chain Quoting Matrix (`src/lib/amm/matrix-quotes.ts`)

Standard CEX pairs in `market-pairs.json` map smoothly to Base routes:

- **`BTC/USDT`**: Routes `cbBTC → WETH → USDT` (8 decimals to 6 decimals).
- **`BTC/USDC`**: Routes `cbBTC → WETH → USDC` (8 decimals to 6 decimals).
- **`BTC/USD`**: Routes `cbBTC → WETH → USDC` (Base USD pegged standard).
- **`ETH/USDT`**: Routes `WETH → USDT` (Direct or Uniswap V2 router pool).
- **`ETH/USD`**: Routes `WETH → USDC` (Direct Uniswap V2 pair).
- **`ETH/USDC`**: Routes `WETH → USDC` (Direct Uniswap V2 pair).
- **`USDC/USDT`**: Routes `USDC → USDT` (Direct stablecoin pair).
- **`AERO/USDC`**: Routes `AERO → WETH → USDC`.
- **`DEGEN/USDC`**: Routes `DEGEN → WETH → USDC`.
- **`BRETT/USDT`**: Routes `BRETT → WETH → USDT`.
- **`TOSHI/ETH`**: Routes `TOSHI → WETH`.
- **`WBTC/USDC`**: Routes `WBTC → WETH → USDC`.
- **`WBTC/USDT`**: Routes `WBTC → WETH → USDT`.
- **`WBTC/ETH`**: Routes `WBTC → WETH`.

---

## 4. Verification & Testing

- **Unit Tests:** `npm test -- --run` passes 27 of 27 test files, 120 of 120 tests.
- **Multicall3 RPC Verification:** Verified live quotes against Base Uniswap V2 router (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`).
- **Production Build:** `npm run build` compiled 100% cleanly in 17.5s.
