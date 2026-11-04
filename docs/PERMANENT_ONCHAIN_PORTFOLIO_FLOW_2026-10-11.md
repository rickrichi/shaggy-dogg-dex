# Shaggy Mutt DEX - Permanent On-Chain Portfolio Flow Specification

**Timestamp:** 2026-10-11 00:37:30 PDT  
**Target Domain:** [dex.lumsian.com/portfolio](https://dex.lumsian.com/portfolio)  
**Deployment ID:** `dpl_mzDVBdAq4Y9xs6ftBDUw8BZWtK73`  
**Git Branch:** `chore/local-solc`

---

## 1. Architectural Mandate
The Portfolio system in Shaggy Mutt DEX is permanently decoupled from third-party server warm-ups or backend cold-starts. Balance querying is purely **on-chain, trustless, and resilient**.

---

## 2. Core Components

### A. Non-Blocking Multicall Hook (`src/hooks/usePortfolio.ts`)
* **Direct Chain Access:** Queries `publicClient.getBalance({ address })` for native ETH and `publicClient.multicall` with `allowFailure: true` for all watchlist ERC-20s.
* **Cold-Start Shield:** The external `/api/prices` call has a strict 3.5s timeout. If the price server is asleep, warming up, or unreachable, the hook immediately falls back to local price defaults without throwing errors.
* **Guaranteed Balance Rendering:** Token balances (MRWD, SD, FBA, EQX, ETH) are guaranteed to render in <500ms directly from the Base RPC.

### B. User-Centric Dashboard UI (`src/pages/Portfolio.tsx`)
* **Disconnected State:** Clean CTA prompting wallet connection with ecosystem feature highlights.
* **Connected State:**
  * **Portfolio Valuation:** Total holdings in USD.
  * **Native Reserve:** Base ETH balance with gas warning indicator.
  * **Tracked Assets Counter:** Count of active tokens with non-zero balances.
  * **Holdings Ledger:** Formatted token table with badges, avatars, contract explorer links, and direct `[Swap]` shortcuts.
  * **Hide Zero Balances Toggle:** Switch allowing users to view all tokens or focus strictly on active holdings.

### C. Core Token Watchlist (`src/config/tokens.ts`)
The Base mainnet watchlist permanently tracks:
* **Native Ether (ETH):** Native Base currency
* **Mutt Rewards (MRWD):** `0xC17227AAa33C54634B6cE7AD0bf33A156563c179`
* **Shaggy Dogg (SD):** `0x051c758521971f5c5a84edaf18eea12854375469`
* **FBA Token (FBA):** `0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263`
* **Equilnyxs Shares (EQX):** `0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C`
* **Wrapped Ether (WETH):** `0x4200000000000000000000000000000000000006`
* **USD Coin (USDC):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 3. Automated Test Verification
A dedicated Vitest test suite at `src/pages/Portfolio.test.tsx` permanently verifies:
* Disconnected CTA rendering
* On-chain balance display (ETH, MRWD, SD)
* Precision formatting
* Fault tolerance against price feed downtime
All tests passing in Vitest CI (`2 passed, 100% success`).
