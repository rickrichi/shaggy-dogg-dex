# Transaction & Milestone Record: ShaggyDogg (SD) First Live Mainnet Trade

**Timestamp:** 2026-10-10T22:20:00-07:00 (Saturday, October 10, 2026 at 10:20 PM PDT)  
**Network:** Base Mainnet (EVM Chain ID: `8453`)  
**Status:** Both Approval and Live Swap Successfully Confirmed on Blockchain  

---

## 1. On-Chain Transactions Summary

### Transaction 1: Token Approval (`approve`)
* **Transaction Hash:** [`0x3f3bc61e105598decdaf020886ed7cf2417b1927aa0b32e3a4dea8b0ebaf66b9`](https://base.blockscout.com/tx/0x3f3bc61e105598decdaf020886ed7cf2417b1927aa0b32e3a4dea8b0ebaf66b9)
* **Status:** Success (Block `52452777`)
* **Contract:** Shaggy Dogg (SD) (`0x051c758521971f5c5a84edaf18eea12854375469`)
* **Function:** `approve(address spender, uint256 amount)`
* **Spender Authorized:** Uniswap V2 Base Router (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`)
* **Purpose:** Authorized Uniswap V2 Router to spend up to `0.0025 SD` from wallet `0x9dC0...7C98`.

---

### Transaction 2: Live Swap Execution (`swapExactTokensForTokens`)
* **Transaction Hash:** [`0x033b32193e9b3b0ca7f1535a8689cf5124c4ddd69bc1a5b90dc36d817756f5d5`](https://base.blockscout.com/tx/0x033b32193e9b3b0ca7f1535a8689cf5124c4ddd69bc1a5b90dc36d817756f5d5)
* **Status:** **Success (Block `52453300`)**
* **Block Timestamp:** `Oct 10 2026 22:19:07 (-07:00 UTC)` (Confirmed within $\le$ 2 seconds)
* **Contract Interacted With:** Uniswap V2 Base Router (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`)
* **Method:** `swapExactTokensForTokens` (Method ID: `0x38ed1739`)
* **Exact Route Path:**
  1. `0x051c758521971f5c5a84eDaF18EEA12854375469` (Shaggy Dogg / SD)
  2. `0x4200000000000000000000000000000000000006` (Wrapped Ether / WETH)
  3. `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7` (Astro Mutt / AMUTT)
* **Exact Token Transfers:**
  * **Sold:** **`0.0025 SD`** (`0x9d...7C98` $\rightarrow$ UniswapV2Pair)
  * **Bridged:** **`0.000000000002522434 WETH`** (UniswapV2Pair $\rightarrow$ UniswapV2Pair)
  * **Received:** **`0.207896921185183565 AMUTT`** (UniswapV2Pair $\rightarrow$ `0x9d...7C98`)
* **Execution Metrics:**
  * **Gas Used:** `189,040` / `304,431` (62.1%)
  * **Transaction Fee:** `0.000001908713346687 ETH` (< $0.01)
  * **Gas Price:** `0.010091417 Gwei`
  * **Recipient Address:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`

---

## 2. Key Contracts & Identifiers

* **Token A (Sold):** Shaggy Dogg (SD) (`0x051c758521971f5c5a84edaf18eea12854375469`)
* **Token B (Received):** Astro Mutt (AMUTT) (`0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7`)
* **Intermediate Route Asset:** Wrapped Ether (WETH) (`0x4200000000000000000000000000000000000006`)
* **DEX Router:** Uniswap V2 on Base (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`)
* **Executing Wallet:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (ending in `7C98`)
* **Frontend Application:** [https://dex.lumsian.com](https://dex.lumsian.com)

---

## 3. What Was Accomplished in this Session

1. **Token Discovery:** Removed the legacy filter (`t.symbol !== "SD"`) in `src/pages/BaseDex.tsx` and improved selector labels.
2. **DEX Navigation Restoration:** Restored `src/App.tsx` routes so `/swap` and `/liquidity` link directly to the production Uniswap V2 + Aerodrome swap and pool managers (`Swap.tsx` and `Liquidity.tsx`).
3. **CI/CD & Deployment:** Ran full test suites (116 passing tests) and deployed the release to production on Vercel at `https://dex.lumsian.com`.
4. **Wallet Session Routing:** Resolved MetaMask multi-account authorization to correctly target `0x9dC0...7C98`.
5. **Execution of First Live Trade:**
   * Executed the ERC-20 `approve` transaction.
   * Executed the on-chain multi-hop swap (`SD → WETH → AMUTT`).
   * Generated verified blockchain trade events and initialized live trading history visible on Blockscout and BaseScan!
