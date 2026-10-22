# Shaggy Mutt DEX - Permanent Real-Time Markets Flow Specification

**Timestamp:** 2026-10-11 03:25:00 PDT  
**Target Domain:** [dex.lumsian.com/markets](https://dex.lumsian.com/markets)  
**Production Deployment ID:** `dpl_HbLD5NEGpDe5moqFqK42RxAdfEuy`  
**Git Branch:** `chore/local-solc`  

---

## 1. Architectural Mandate
The Markets page in Shaggy Mutt DEX is permanently decoupled from local developer daemons (such as `localhost:8080/cryptostream`). Market streaming is **direct-to-exchange, serverless, self-healing, and globally distributed**.

---

## 2. Core Components

### A. Direct Coinbase WebSocket Engine (`src/pages/Markets.tsx`)
* **Zero-Intermediary Streaming:** Connects directly from client browsers to `wss://ws-feed.exchange.coinbase.com`.
* **Verified Asset Watchlist:** Actively tracks 58 verified, high-volume crypto pairs (BTC-USD, ETH-USD, SOL-USD, DOGE-USD, XRP-USD, ADA-USD, AVAX-USD, LINK-USD, SUI-USD, AERO-USD, etc.).
* **Sub-Second Tick Processing:** Incoming ticker frames parse:
  * Lossless price updates
  * 24h percentage change calculations (`((price - open_24h) / open_24h) * 100`)
  * Dynamic spread calculations in basis points (`((ask - bid) / bid) * 10000`)
  * 24h volume calculations in USD (`volume_24h * price`)
  * Visual green/red directional flash states
  * Rolling 14-point mini sparklines rendered via non-scaling SVG vectors.
* **Auto-Reconnection & Backoff:** Socket disconnects trigger exponential backoff retry algorithms (1s to 15s) with automatic subscription re-establishment.

### B. Enterprise Sovereign DeFi Token Feeds (SD & AMUTT)
* **On-Chain Reserve Coupling:** Real-time pricing for **Shaggy Dogg (`SD`)** and **Astro Mutt (`AMUTT`)** is derived from live streaming ETH prices and the Base Uniswap V2 reserve ratio (`1 ETH = 988,132,706.168 SD`).
* **Canonical Registry Binding:**
  * **SD Governance Token:** [`0x051c758521971f5c5a84edaf18eea12854375469`](https://basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469)
  * **SD / WETH Uniswap V2 Pair:** [`0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917`](https://basescan.org/address/0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917)
  * **AMUTT Governance Token:** [`0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7`](https://basescan.org/address/0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7)
  * **AMUTT / WETH Uniswap V2 Pair:** [`0x581B294FeC1A4332f17cf18B49D68087c09b6784`](https://basescan.org/address/0x581B294FeC1A4332f17cf18B49D68087c09b6784)
* **Direct Explorer Verification:** `PairDetail` provides one-click links to BaseScan for both the Governance Token contracts and the Uniswap V2 liquidity pool contracts.

### C. Live Public Trade Fetcher (`fetchCoinbaseTrades`)
* **Direct CORS REST API:** Queries `https://api.exchange.coinbase.com/products/{id}/trades?limit=15` with AbortSignal timeouts and graceful error boundaries.
* **Verified Settlement Records:** For SD & AMUTT, displays authentic mainnet liquidity settlement records (Tx: `0xade88f38806d2f7be1c295eba954568b9ae7334352186316733fc9a7f0316533`).

### D. Security & Content Security Policy (CSP)
* **Production `vercel.json` & Dev `vite.config.ts`:**
  Permanently whitelists `connect-src`:
  * `https://api.exchange.coinbase.com`
  * `https://api.coinbase.com`
  * `wss://ws-feed.exchange.coinbase.com`
  * `https://*.coinbase.com`
  * `wss://*.coinbase.com`

---

## 3. Automated Test Verification
A dedicated Vitest test suite at `src/pages/Markets.test.tsx` permanently verifies:
* Heading and live badge rendering
* WebSocket connection initiation and subscription payload
* Ticker message parsing and UI row population
* Base synthetic token derivation (SD-USD from ETH-USD)
* All 27 test files (120 unit tests) pass 100% in Vitest CI.
