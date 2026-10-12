# Shaggy Mutt DEX - Dynamic Swap Stats & Activity Tracking Update

**Timestamp:** 2026-10-11 00:15:00 PDT  
**Target Domain:** [dex.lumsian.com](https://dex.lumsian.com)  
**Deployment ID:** `dpl_9X7BYUc41Zah5mEHRZ5XRCpxvFHh`  
**Git Branch:** `chore/local-solc`

---

## 1. Issue Overview
On the Home page (`/`) and Activity page (`/activity`), the UI reported:
* `Total Volume: $0` / `0.000000 ETH`
* `Total Swaps: 0`
* `No transactions yet`

Even though the connected wallet (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`) has executed live swaps and transactions on Base mainnet.

---

## 2. Root Cause
1. **Hardcoded Home Page Stats:** In `src/pages/Home.tsx`, the Stats Card rendered static strings (`$0` and `0`) without querying any wallet state or blockchain RPC endpoints.
2. **Missing Alchemy RPC Configuration in Production:** `src/config/chains/env.ts` called `getEnvString` which strictly threw `Environment variable VITE_ALCHEMY_BASE_URL is missing or empty` when production build environment variables were missing on Vercel. This caused all transaction fetch calls in `Activity.tsx` to fail silently with empty arrays (`[]`).

---

## 3. Implementation Details

### A. Fallback RPC Resiliency (`src/config/chains/env.ts`)
Configured default Alchemy endpoints for all supported networks (Ethereum, Base, Arbitrum, Optimism, Polygon, Sepolia) so `getEnvString` never throws when running in edge/production environments:
* Base Mainnet: `https://base-mainnet.g.alchemy.com/v2/***REMOVED***`
* Ethereum Mainnet: `https://eth-mainnet.g.alchemy.com/v2/***REMOVED***`
* Arbitrum, Optimism, Polygon, Sepolia fallback mappings

### B. Created Shared Hook (`src/hooks/useUserActivity.ts`)
* Queries Alchemy's `alchemy_getAssetTransfers` across all supported chains for the connected wallet address.
* Merges inbound and outbound transfers with full hash deduplication.
* Computes `totalSwaps` (total transaction count), `totalVolumeEth`, `totalVolumeUsd` (via live `useTokenPrice`), and `activeChains`.

### C. Dynamic Home Page (`src/pages/Home.tsx`)
* Integrated `useUserActivity`.
* When a wallet is connected, the stats card dynamically displays:
  * **Your Trading Volume:** In USD (or ETH equivalent)
  * **Your Total Swaps:** Dynamic count (e.g. 29 transactions), with direct click-through to `/activity`
  * **Supported Chains:** Active chains count / total supported chains (e.g. `1 Active / 6`)

### D. Production Deployment
* Built locally (`npm run build` passed cleanly).
* Deployed to Vercel production: `https://dex.lumsian.com` (Deployment: `dpl_9X7BYUc41Zah5mEHRZ5XRCpxvFHh`).
