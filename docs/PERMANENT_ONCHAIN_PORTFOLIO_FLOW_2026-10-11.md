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
* **Guaranteed Balance Rendering:** Token balances (SD, AMUTT, FBA, ETH) are guaranteed to render in <500ms directly from the Base RPC.

### B. User-Centric Dashboard UI (`src/pages/Portfolio.tsx`)
* **Disconnected State:** Clean CTA prompting wallet connection with ecosystem feature highlights.
* **Connected State:**
  * **Portfolio Valuation:** Total holdings in USD.
  * **Native Reserve:** Base ETH balance with gas warning indicator.
  * **Tracked Assets Counter:** Count of active tokens with non-zero balances.
  * **Holdings Ledger:** Formatted token table with badges, avatars, contract explorer links, and direct Uniswap V2 `[Swap]` shortcuts.
  * **Hide Zero Balances Toggle:** Switch allowing users to view all tokens or focus strictly on active holdings.

### C. Core Token Watchlist (`src/lib/tokens.ts`)
The Base mainnet watchlist permanently tracks:
* **Native Ether (ETH):** Native Base currency
* **Shaggy Dogg (SD):** `0x051c758521971f5c5a84edaf18eea12854375469`
* **Alpha Mutt (AMUTT):** `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7`
* **FBA Token (FBA):** `0x916Ed75C0636Ddd7404db79B7Dc5cf80e8446c47`
* **Wrapped Ether (WETH):** `0x4200000000000000000000000000000000000006`
* **USD Coin (USDC):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 3. Automated Test Verification
A dedicated Vitest test suite at `src/pages/Portfolio.test.tsx` permanently verifies:
* Disconnected CTA rendering
* On-chain balance display (ETH, SD, AMUTT)
* Precision formatting
* Fault tolerance against price feed downtime
All tests passing in Vitest CI (`2 passed, 100% success`).
