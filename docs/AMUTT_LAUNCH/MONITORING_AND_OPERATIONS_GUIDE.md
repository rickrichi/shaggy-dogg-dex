# ASTRO MUTT (AMUTT) PROTOCOL SUITE
## Comprehensive Live Monitoring, DEX Tracking & Operations Guide
**Network:** Base Mainnet (Chain ID: `8453`)  
**Deployer / Admin Wallet:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`  
**Generated Date:** September 30, 2026  

---

## 1. Official Deployed Contract Registry

| Contract Name | Address | BaseScan Link | Purpose |
| :--- | :--- | :--- | :--- |
| **Astro Mutt (AMUTT)** | `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7` | [View Token](https://basescan.org/token/0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7) | 100M Supply Governance Token (18 Decimals) |
| **Uniswap V2 Pair (AMUTT/WETH)** | `0x581B294FeC1A4332f17cf18B49D68087c09b6784` | [View Pair](https://basescan.org/address/0x581B294FeC1A4332f17cf18B49D68087c09b6784) | Decentralized Liquidity Pool (50M AMUTT + 0.0005 WETH) |
| **FeeDiscountStaking Vault** | `0x055BB4eD8d5464C25D71391E940ce53CA30845fC` | [View Staking](https://basescan.org/address/0x055BB4eD8d5464C25D71391E940ce53CA30845fC) | 4-Tier VIP Staking (Bronze, Silver, Gold, Diamond) |
| **YieldStakingVault (Aave v3)** | `0x16a1E9c10B913912b7B7df4649D9596D95ce33E6` | [View Yield Vault](https://basescan.org/address/0x16a1E9c10B913912b7B7df4649D9596D95ce33E6) | Supplies USDC into Aave v3, earns aBasUSDC yield |
| **AaveFlashBorrower** | `0x936a3D52c3037848879F3641dfBc9132aAe51bDF` | [View Flash Borrower](https://basescan.org/address/0x936a3D52c3037848879F3641dfBc9132aAe51bDF) | Uncollateralized flash loan executor on Aave v3 Base |
| **Uniswap V2 Router (Base)** | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` | [View Router](https://basescan.org/address/0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24) | Canonical Uniswap V2 Router on Base |

---

## 2. DEX Trading, Price Charts & Liquidity Depth

Your liquidity pool is live on Base. Decentralized exchanges and aggregators index this pool in real time:

### A. DexScreener (Real-Time Trading Terminal)
- **Direct Link:** [https://dexscreener.com/base/0x581B294FeC1A4332f17cf18B49D68087c09b6784](https://dexscreener.com/base/0x581B294FeC1A4332f17cf18B49D68087c09b6784)
- **Features:**
  - Live 1-minute, 5-minute, and 1-hour candlestick charts
  - Every real-time buy and sell trade feed
  - Real-time USD price, market cap, and liquidity depth (Pooled WETH + Pooled AMUTT)
  - 24-hour volume and maker counts

### B. GeckoTerminal (CoinGecko DEX Aggregator)
- **Direct Link:** [https://www.geckoterminal.com/base/pools/0x581B294FeC1A4332f17cf18B49D68087c09b6784](https://www.geckoterminal.com/base/pools/0x581B294FeC1A4332f17cf18B49D68087c09b6784)
- **Features:**
  - Automated liquidity reserve tracking
  - CoinGecko index qualification metrics
  - Direct swap simulator

### C. Uniswap Official V2 Interface
- **Direct Link:** [https://app.uniswap.org/positions/v2/base](https://app.uniswap.org/positions/v2/base)
- **Features:**
  - View your LP token balance (`158.11 LP tokens`)
  - Add additional liquidity or withdraw pool fees

---

## 3. Aave v3 & Yield Staking Vault Monitoring

Your `YieldStakingVault` interacts with Aave v3 on Base Mainnet to earn passive yields:

1. **Aave Protocol Dashboard (Base Market):**
   - **URL:** [https://app.aave.com/?marketName=proto_base_v3](https://app.aave.com/?marketName=proto_base_v3)
   - Monitor the current USDC Deposit APY (interest rate), Base pool liquidity, and utilization.
2. **On-Chain Vault Holdings:**
   - Contract Address: `0x16a1E9c10B913912b7B7df4649D9596D95ce33E6`
   - Go to BaseScan -> **Token Holdings** tab.
   - You can inspect the vault's balance of **aBasUSDC** (`0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB`), which appreciates continuously with interest.
3. **Flash Loan Monitor:**
   - Contract Address: `0x936a3D52c3037848879F3641dfBc9132aAe51bDF`
   - Monitor the **Transactions** and **Internal Txns** tabs on BaseScan to see whenever a flash loan is initiated and repaid within the same block.

---

## 4. BaseScan Watchlist & Real-Time Alerts (Email / Telegram)

You can receive an instant push notification or email whenever someone trades AMUTT or stakes in your vault:

1. Visit [https://basescan.org/register](https://basescan.org/register) to create a free BaseScan account.
2. Log in and navigate to **Account Overview** -> **Watch List**.
3. Click **Add New Address** and add the following:
   - `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7` (AMUTT Token)
   - `0x581B294FeC1A4332f17cf18B49D68087c09b6784` (Uniswap Pair)
   - `0x055BB4eD8d5464C25D71391E940ce53CA30845fC` (Fee Staking)
   - `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (Your Deployer Wallet)
4. Check **"Notify on Incoming & Outgoing Txns"**.
5. Save your preferences. BaseScan will automatically email or ping your Telegram bot whenever on-chain activity occurs.

---

## 5. Local DEX Dashboard & Terminal Diagnostics

You have built-in operational monitoring right inside your Shaggy Dogg DEX repository:

### A. Terminal Diagnostic Command
Run this command from `C:\Users\fbada\source\repos\shaggy-dogg-dex`:
```powershell
npx tsx scripts/manage-amutt-ecosystem.ts
```
**Output provides:**
- Deployer ETH and AMUTT balances in real time
- Uniswap V2 Router allowance status
- Uniswap V2 Pair address and liquidity confirmation
- Configured VIP Staking tiers status

### B. Shaggy Dogg DEX Launchpad UI
- **URL:** [http://localhost:5173/launchpad](http://localhost:5173/launchpad)
- **Features:**
  - Real-time protocol status badges
  - 1-Click MetaMask Token Importer
  - Staking tier management controls
  - Direct explorer links

---

## 6. How to Add AMUTT to MetaMask

### Method 1: 1-Click Auto-Import (Fastest)
1. Open [http://localhost:5173/launchpad](http://localhost:5173/launchpad) in your browser.
2. In the purple box, click **"Add AMUTT to MetaMask"**.
3. Confirm in MetaMask by clicking **"Add Token"**.

### Method 2: Manual Entry inside MetaMask
1. Open MetaMask on the **Base** network.
2. In the **Tokens** tab, click the **three vertical dots (`⋮`)** on the right side (next to the sort icon).
3. Click **"Import tokens"** -> **"Custom token"**.
4. Paste the contract address:
   ```text
   0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7
   ```
5. Click **Next** -> **Import**.

---

## 7. Protocol Architectural Note
Smart contracts on Base Mainnet are immutable, self-sustaining programs executed by decentralized nodes across the globe. Unlike traditional web servers:
- They require no hosting servers, VPS, or maintenance.
- They will never go offline or crash.
- They are accessible to anyone globally 24 hours a day, 7 days a week, 365 days a year.
