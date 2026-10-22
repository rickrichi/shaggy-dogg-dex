# Uniswap V3 Concentrated Liquidity Quote Engine & Illiquidity Guard Upgrade

**Date:** October 11, 2026  
**Scope:** Spot Arbitrage Matrix ([`dex.lumsian.com/arbitrage/matrix`](https://dex.lumsian.com/arbitrage/matrix))  
**Components:**
- `src/lib/amm/matrix-quotes.ts`
- `src/lib/amm/matrix-quotes.test.ts`
- `src/components/arbitrage/PairMatrix100.tsx`
- `src/config/contracts.ts`
- `src/config/abis.ts`
**Deployment Status:** Live on Production

---

## 1. Background & Root Cause Analysis

On `/arbitrage/matrix`, users observed severe price anomalies on certain Base DEX quotes:
- **`BTC/USDC`:** Displaying `1 cbBTC → 1,263.40 USDC` (versus fair market value ~$83,400).
- **`BTC/USDT`:** Displaying `1 cbBTC → 17.29 USDT`.
- **`ETH/USDT`:** Displaying `1 WETH → 17.40 USDT` (versus fair market value ~$2,525).
- **`ETH/DAI`:** Displaying `1 WETH → 9.25 DAI`.
- **`WBTC/USDC`:** Displaying `1 WBTC → 2.63 USDC`.

### The Ghost Pool / Liquidity Trap Phenomenon
The DEX quote engine was querying the legacy **Uniswap V2 Router** (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`). On Base Layer 2 (launched in mid-2023), virtually all liquidity providers migrated to **Uniswap V3 concentrated liquidity** and **Aerodrome**. 

Uniswap V2 pools for these pairs on Base were abandoned test pools holding negligible "dust" ($2 to $17 in reserves). Because the router naively evaluated constant-product AMM math ($x \cdot y = k$) for 1 whole token against empty reserves, swapping 1 BTC or 1 ETH suffered **98.5% to 99.997% slippage**, returning only the dust remaining in the contract.

---

## 2. Technical Implementation

### 2.1 Uniswap V3 QuoterV2 Integration
The on-chain quote engine in `src/lib/amm/matrix-quotes.ts` was upgraded to query the official **Uniswap V3 QuoterV2** on Base:
* **Contract Address:** `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`
* **ABI:** `UNISWAP_V3_QUOTER_V2_ABI` supporting `quoteExactInputSingle` and `quoteExactInput` (multi-hop).
* **Multi-Fee Tier Optimization:** For each mapped pair, the router queries all 4 standard concentrated fee tiers in a single batch multicall:
  * `100` (0.01%): Stablecoin pairs (`USDC/USDT`)
  * `500` (0.05%): Mega-caps (`cbBTC/USDC`, `ETH/USDC`, `AERO/USDC`)
  * `3000` (0.30%): Liquid alts (`LINK/USDC`, `DEGEN/USDC`)
  * `10000` (1.00%): Volatile & community meme tokens (`TOSHI/ETH`)
* **Multi-Hop Fallbacks:** Multi-hop paths through `WETH` and `USDC` (e.g. `cbBTC → USDC → USDT`) are automatically evaluated when a direct pool is unavailable. The candidate with the highest net output amount is selected.

### 2.2 Illiquidity & Deviation Guard
To ensure users are never misled by low-depth or out-of-range pools, an automated **Deviation Guard** was integrated into `src/components/arbitrage/PairMatrix100.tsx`:
1. The DEX quote is cross-referenced in real-time against streaming top-of-book prices from Coinbase and Kraken public WebSocket feeds.
2. If the on-chain DEX quote deviates by **more than 15%** from the centralized exchange reference price, the cell displays:
   * **`⚠️ Low Depth / Out of Range`**
   * The exact output and calculated slippage percentage (e.g. `(>15% slippage)`).
3. Healthy pairs within normal trading spreads display full green quotes with fee tier badges (e.g. `(0.05%)`).

---

## 3. Real-World Quote Comparison (Base Mainnet)

| Pair | Legacy Uniswap V2 (Before) | Uniswap V3 Concentrated (After) | Live CEX Feed (Coinbase / Kraken) |
| :--- | :--- | :--- | :--- |
| **`BTC/USDC`** | ❌ $1,263.40 (98.5% loss) | 🟢 **$83,407.41 USDC** (0.05% pool) | $83,438.83 / $83,440.80 |
| **`BTC/USDT`** | ❌ $17.29 (Dead pool) | 🟢 **$83,458.19 USDT** (V3 multi-hop) | $83,438.83 / $83,440.80 |
| **`ETH/USDC`** | ⚠️ $2,498.85 (Thin pool) | 🟢 **$2,530.07 USDC** (0.01% pool) | $2,525.11 / $2,524.90 |
| **`ETH/USDT`** | ❌ $17.40 (Dead pool) | 🟢 **$2,533.48 USDT** (V3 multi-hop) | $2,525.11 / $2,524.90 |
| **`USDC/USDT`** | ⚠️ 0.943 USDT (Off peg) | 🟢 **1.0013 USDT** (0.01% stable pool) | 0.9998 / 0.9999 |
| **`LINK/USDC`** | ⚪ *Pool unquoted* | 🟢 **$13.24 USDC** (0.30% pool) | $13.26 / $13.27 |
| **`AERO/USDC`** | $0.927 | 🟢 **$0.9395 USDC** (0.05% pool) | $0.9377 |

---

## 4. Verification & Deployment Record

- **Test Suite:** `npm test` — 27 test files passed (`121/121` unit tests green).
- **Vite Production Build:** Verified clean bundle in 30.4s.
- **Git Commit:** `d3fea63` (`feat(matrix): upgrade DEX quote engine to Uniswap V3 concentrated liquidity on Base with illiquidity guard`).
- **Vercel Production Deployment:** Live on `https://dex.lumsian.com/arbitrage/matrix` (Deployment ID: `dpl_EK9QyMCntbx88TmP8ZMAiYwVSNLy`).
