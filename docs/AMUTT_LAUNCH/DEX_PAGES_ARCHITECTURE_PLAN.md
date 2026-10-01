# SHAGGY DOGG DEX - PROTOCOL ARCHITECTURE & PAGE SEPARATION PLAN
**Target Directory:** `D:\AMUTT`  
**Generated Date:** September 30, 2026  
**Ecosystem:** Astro Mutt (`AMUTT`) on Base Mainnet (Chain ID: `8453`)  

---

## 1. Executive Summary & Rationale

Currently, all deployment, liquidity seeding, staking configuration, and swap testing functions were consolidated into a single card on `http://localhost:5173/launchpad`. 

While this allowed for rapid bootstrapping of the initial contracts (Steps #1, #2, #3, and #4), it creates UI clutter and mixes **creator deployment tools** with **day-to-day trader and administrator interfaces**.

Separating these functions into dedicated, specialized pages follows Web3 production standards (like Uniswap, Aerodrome, and PancakeSwap), delivering an intuitive, scalable user experience.

---

## 2. Dedicated Pages Architecture

| Page Name | Route / URL | Target Audience | Primary Function & Responsibilities |
| :--- | :--- | :--- | :--- |
| 🚀 **Launchpad Studio** | `/launchpad` | Token Creators | **Pure Creator Studio**: Clean 4-step wizard (Identity, Architecture, Liquidity, Review) to deploy brand-new tokens, vaults, and governance protocols. |
| ⚡ **Protocol Ops Hub** | `/protocol` | Protocol Admin / Owner | **Ecosystem Management Console**: Real-time contract registry for deployed suites (AMUTT, Aave Vault, Staking, Borrower), 1-click MetaMask token importer, and VIP staking tier controls. |
| 🔄 **DEX Trading Swap** | `/swap` | Public Traders & Users | **Decentralized Exchange**: Clean candlestick charts, order routing via Base Uniswap V2 Router, slippage protection, and instant token swaps (ETH ↔ AMUTT ↔ SD). |
| 💧 **Liquidity Manager** | `/liquidity` | Liquidity Providers | **Pool Management**: Initialize new pairs, add/remove pool liquidity, view LP tokens (158.11 LP tokens), and monitor pool fees. |
| 🛡️ **Staking & Loyalty** | `/stake` | Token Holders & VIPs | **Single-Sided Staking**: Stake AMUTT to unlock 5%–30% fee discount tiers and view real-time reward accumulations. |

---

## 3. Detailed Component Breakdown Per Page

### A. Launchpad Studio (`/launchpad`)
- **Focus:** New deployments only.
- **Components:**
  - Token Identity Form (Name, Symbol, Decimals, Supply, Description).
  - Architecture Selector (Standard ERC-20, Staking Loyalty, Morpho Blue, Moonwell, Sovereign Suite).
  - Pre-deployment configuration & simulation.
  - Quick Banner: *"Managing a live deployed ecosystem? Go to Protocol Ops Hub →"*.

### B. Protocol Ops Hub (`/protocol`)
- **Focus:** Administrative control and registry for deployed contracts.
- **Components:**
  - **Deployed Contracts Registry:** Live BaseScan links and checksum verification for:
    - AMUTT Token (`0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7`)
    - Uniswap V2 Pair (`0x581B294FeC1A4332f17cf18B49D68087c09b6784`)
    - FeeDiscountStaking (`0x055BB4eD8d5464C25D71391E940ce53CA30845fC`)
    - YieldStakingVault (`0x16a1E9c10B913912b7B7df4649D9596D95ce33E6`)
    - AaveFlashBorrower (`0x936a3D52c3037848879F3641dfBc9132aAe51bDF`)
  - **1-Click MetaMask Importer:** Automatically invokes `wallet_watchAsset` with zero manual copying.
  - **VIP Tier Activation Card:** Interactive tier configuration (Bronze 10k, Silver 50k, Gold 200k, Diamond 1M).
  - **Aave Yield & Flash Loan Status:** Displays current aBasUSDC yield accrual and lending metrics.

### C. DEX Trading Swap (`/swap`)
- **Focus:** End-user trading.
- **Components:**
  - Multi-chain router support (Ethereum Mainnet & Base Mainnet auto-switch).
  - Default AMUTT/ETH and SD/ETH trading pairs.
  - Slippage tolerances (0.1%, 0.5%, 1.0%, custom).
  - Live charts powered by DexScreener / GeckoTerminal feeds.

### D. Liquidity Manager (`/liquidity`)
- **Focus:** AMM Pool custody.
- **Components:**
  - Pool pair creator (Tokens A & B).
  - LP Token balance display (`158.11 AMUTT/WETH LP`).
  - Pool share % calculation.
  - Pool fee accumulation.

---

## 4. Header Navigation Bar Integration

In `src/components/Layout.tsx`, the top navigation bar will be updated to:

```text
[🐕 Shaggy Mutt]   Swap | Liquidity | Stake | Launchpad | Protocol Ops | Portfolio | Activity | Admin   [Connect Wallet]
```

- Each page has its own dedicated URL that can be bookmarked, refreshed, and shared.
- Moving between pages preserves wallet state and avoids re-rendering massive components.

---

## 5. Next Steps for Implementation

1. Create `src/pages/ProtocolOps.tsx` housing the `ActiveProtocolManager` component.
2. Add route `/protocol` to `src/App.tsx`.
3. Add `Protocol Ops` button with icon to `src/components/Layout.tsx`.
4. Clean up `src/pages/Launchpad.tsx` by removing the embedded operational cards and linking cleanly to `/protocol`.
5. Run TypeScript type checks and Vite test suites.
