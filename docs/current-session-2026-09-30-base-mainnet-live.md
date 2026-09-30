# Shaggy Dogg DEX - Base Mainnet Production Deployment Milestone
**Date:** 2026-09-30  
**Network:** Base Mainnet (Chain ID: `8453`)  
**Ecosystem Version:** 2.0.0 (Production Live Release)  

---

## 1. Executive Summary

In this landmark milestone session, the complete **Shaggy-Dogg-DEX** smart contract ecosystem was successfully deployed live on-chain to **Base Mainnet (Chain ID 8453)**:

1. **5 Core Smart Contracts Deployed to Production**:
   - `GovernanceToken (SD)`: Capped ERC-20 token (1,000,000 SD total supply, 18 decimals).
   - `FeeDiscountStaking`: Single-sided staking vault with 4 VIP fee discount tiers (10% to 100% fee discount, 7-day lock, 1% unstake fee).
   - `AaveFlashBorrower`: Uncollateralized flash loan receiver wired to Base Mainnet Aave v3 Pool (`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`).
   - `YieldStakingVault`: Aave v3 supply/withdraw yield vault with native Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
   - `CompoundYieldVault`: Compound v3 Comet (`0xb125E6687d4313864e53df431d5425969c15Eb2F`) USDC yield vault with staker fee discounts.
2. **Master Token Distribution & Root Ownership**:
   - 100% of the entire 1,000,000 SD token supply was minted exclusively to the user's dedicated root admin wallet `ShaggyDogg` (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`).
   - All Admin and Minter roles across all 5 contracts were assigned directly and exclusively to the user's wallet.
   - User private keys remained 100% self-custodial and unexposed throughout the entire process.
3. **Multichain Deterministic Vanity Addresses**:
   - Every single contract address on **Base Mainnet** mathematically mirrors the contract address from **Base Sepolia**:
     - Token: `0x051c758521971f5c5a84edaf18eea12854375469`
     - Staking: `0x42134ccc6c41149cf71c7b4994e33ee66758af20`
     - FlashBorrower: `0xa5b50037a8d2fda22805f750252268adaeb36480`
     - YieldVault: `0x8531807ef36560cd7db230c95db85791aa586dda`
     - CompoundVault: `0x38cccafb4ae96a8ef187f07fb17d18eb63e43782`
4. **Sub-Cent Deployment Gas Cost**:
   - Total deployment gas used for all 5 contracts on Base Mainnet was `0.00002928 ETH` (**less than $0.08 USD**).
5. **Full Test Suite & Codebase Integrity**:
   - 76 / 76 unit & integration tests passing across 12 test suites (`vitest`).
   - Frontend contract mappings updated in `src/lib/contracts.ts`.
   - Deployment records permanently archived in `deployments/base-mainnet.json`.
   - All changes committed and pushed to private GitHub repository branch `fix/strict-ts`.

---

## 2. Verified Base Mainnet Contract Registry (Chain ID: 8453)

| Contract | Base Mainnet Address | Blockscout Link | BaseScan Link |
| :--- | :--- | :--- | :--- |
| **GovernanceToken (`SD`)** | `0x051c758521971f5c5a84edaf18eea12854375469` | [View on Blockscout](https://base.blockscout.com/address/0x051c758521971f5c5a84edaf18eea12854375469) | [View on BaseScan](https://basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469) |
| **FeeDiscountStaking** | `0x42134ccc6c41149cf71c7b4994e33ee66758af20` | [View on Blockscout](https://base.blockscout.com/address/0x42134ccc6c41149cf71c7b4994e33ee66758af20) | [View on BaseScan](https://basescan.org/address/0x42134ccc6c41149cf71c7b4994e33ee66758af20) |
| **AaveFlashBorrower** | `0xa5b50037a8d2fda22805f750252268adaeb36480` | [View on Blockscout](https://base.blockscout.com/address/0xa5b50037a8d2fda22805f750252268adaeb36480) | [View on BaseScan](https://basescan.org/address/0xa5b50037a8d2fda22805f750252268adaeb36480) |
| **YieldStakingVault** | `0x8531807ef36560cd7db230c95db85791aa586dda` | [View on Blockscout](https://base.blockscout.com/address/0x8531807ef36560cd7db230c95db85791aa586dda) | [View on BaseScan](https://basescan.org/address/0x8531807ef36560cd7db230c95db85791aa586dda) |
| **CompoundYieldVault** | `0x38cccafb4ae96a8ef187f07fb17d18eb63e43782` | [View on Blockscout](https://base.blockscout.com/address/0x38cccafb4ae96a8ef187f07fb17d18eb63e43782) | [View on BaseScan](https://basescan.org/address/0x38cccafb4ae96a8ef187f07fb17d18eb63e43782) |
| **UniswapV2Pair (`SD/WETH`)** | `0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917` | [View on Blockscout](https://base.blockscout.com/address/0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917) | [View on BaseScan](https://basescan.org/address/0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917) |

### Key Wallets & Infrastructure

- **Root Admin & Token Holder:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (MetaMask account `ShaggyDogg`)
- **Deployer Worker Account:** `0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B`
- **Base Mainnet Aave v3 Pool:** `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`
- **Base Mainnet Compound v3 Comet:** `0xb125E6687d4313864e53df431d5425969c15Eb2F`
- **Base Mainnet Native USDC:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Base Canonical WETH9:** `0x4200000000000000000000000000000000000006`
- **Uniswap V2 Router02 (Base):** `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`
- **Uniswap V2 Factory (Base):** `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6`

---

## 3. On-Chain Transaction Audit Trail

### L1 -> L2 Native Bridge & Gas Funding
1. **L1 Bridge Deposit to Base Portal Contract (`0x49048...4E97e`):**
   - **Tx Hash:** `0x5fb455250400377bb621489ddb33965c32d94a4d766e1f0f30127255a1d888f3`
   - **Ethereum Block:** `26088496`
   - **Amount:** `0.003 ETH` ($7.99)
   - **Gas Fee on L1:** `0.00026 ETH` ($0.69)
   - **Destination:** Relayed directly to `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` on Base Mainnet.
2. **Deployer Worker Funding on Base Mainnet:**
   - **Tx Hash:** `0xf48b2702556be125e86c441c7f7af68ee84125f45aafc0d718a2f25dc772e32e`
   - **Base Block:** `51980324`
   - **Amount:** `0.001 ETH` ($2.67)
   - **Gas Fee on Base:** `< 0.000001 ETH` (< $0.01)

### Production Deployment Broadcasts
1. **`GovernanceToken` Deployment**:
   - **Tx Hash:** `0x62e802324d1c2602c386282c03339bdaaaa098de8b129554a0d066425d0ee4a5`
   - **Block:** `51980362`
   - **Deployed Address:** `0x051c758521971f5c5a84edaf18eea12854375469`
   - **Mint:** 1,000,000 SD to `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`
2. **`FeeDiscountStaking` Deployment**:
   - **Tx Hash:** `0xc496656373e2babba14330755f0e6f70b088986f8fbcbcb0cbe330e3da034cee`
   - **Block:** `51980362`
   - **Deployed Address:** `0x42134ccc6c41149cf71c7b4994e33ee66758af20`
3. **`AaveFlashBorrower` Deployment**:
   - **Tx Hash:** `0x478d05e6a72e005526e102141316fd2380827190115496ffc773f231a5d7de72`
   - **Block:** `51980363`
   - **Deployed Address:** `0xa5b50037a8d2fda22805f750252268adaeb36480`
4. **`YieldStakingVault` Deployment**:
   - **Tx Hash:** `0xe406cac54b84f7e52cdb0b023e3b92b17c05b6306e1f26ba31d61ba358608d5f`
   - **Block:** `51980363`
   - **Deployed Address:** `0x8531807ef36560cd7db230c95db85791aa586dda`
5. **`CompoundYieldVault` Deployment**:
   - **Tx Hash:** `0xebc12e9904d41e8fa554467d189a6d2d1bc89a012979913ad2e164bb94f77d6e`
   - **Block:** `51980364`
   - **Deployed Address:** `0x38cccafb4ae96a8ef187f07fb17d18eb63e43782`

---

## 4. Uniswap V2 Pair Deployment (Base Mainnet)

The canonical **SD / WETH** Uniswap V2 Pair was successfully initialized on Base Mainnet:
- **Factory Address:** `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6`
- **Router Address:** `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`
- **Canonical WETH9:** `0x4200000000000000000000000000000000000006`
- **GovernanceToken (SD):** `0x051c758521971f5c5a84edaf18eea12854375469`
- **Deployed UniswapV2Pair:** `0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917`
- **Transaction Hash:** `0xf1f00774a3341ce10fb3fef4ad6dcdd523f391780eddb5e3b1a9cd0fcfaab185`
- **Block:** `51981653`
- **BaseScan Link:** [View Pair Contract](https://basescan.org/address/0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917)

---

## 5. Wallet Verification on Base Mainnet

As documented in `docs/onbase.jpg`, the user's primary MetaMask wallet `ShaggyDogg` (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`) is **100% active on Base Mainnet**:
- **Network Indicator:** Base (Chain ID `8453`)
- **Native ETH Balance:** `0.00199 ETH` (~$5.38 USD)
- **Token Balance:** `1.00M SD` (`1,000,000 SD` - 100% of initial genesis supply)
- **Security Label ("Risky"):**
  - Triggered automatically by MetaMask's security partner (Blockaid) for any brand-new contract (< 24 hours old) with no historical DEX trading volume and unverified source code on BaseScan.
  - Will be normalized upon (1) verifying contract source code on BaseScan and (2) seeding the initial liquidity pool so trading activity commences.

---

## 6. Frontend & Amm Architecture Upgrades

- **Chain-Aware Token Registry (`src/config/tokens.ts`):** Added `BASE_MAINNET_TOKENS` and dynamic `getTokensForChain(chainId)` to cleanly separate L1 Mainnet, Base Sepolia, and Base Mainnet.
- **Dynamic Routing & Factory Resolution (`src/config/contracts.ts`):** Configured canonical Base Uniswap V2 Router (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`) and Factory (`0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6`).
- **Liquidity UI (`src/pages/Liquidity.tsx`):** Upgraded to use chain-aware token selections, dynamic router/factory addresses, and direct support for Base Mainnet.
- **Strict TypeScript Compliance:** Resolved unused imports and optional property types; `tsc -b tsconfig.app.json` compiles with zero errors, and all 76 unit/integration tests pass.

---

## 7. Initial Liquidity Seeding Milestone (100% COMPLETE & LIVE)

The initial SD/WETH liquidity pool was successfully created and seeded on Base Mainnet:

1. **Step 1: Router Approval**:
   - **Transaction Hash:** [`0x27385d2974a391755d3f4934b164a59ed03ac5e91294c8173f54dd43d0516598`](https://basescan.org/tx/0x27385d2974a391755d3f4934b164a59ed03ac5e91294c8173f54dd43d0516598)
   - **Block:** `51987493`
   - **Gas Fee:** `0.00000048 ETH` (< $0.001 USD)
   - **Action:** Approved Uniswap V2 Router (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`) for `500,000 SD`.

2. **Step 2: Atomic Liquidity Seeding (`addLiquidityETH`)**:
   - **Transaction Hash:** [`0x5c725fdedce0229b594f223b949a1579517bb9157ffe040a9943a163ca0df1fe`](https://base.blockscout.com/tx/0x5c725fdedce0229b594f223b949a1579517bb9157ffe040a9943a163ca0df1fe)
   - **Block:** `51987730`
   - **Value Deposited:** `0.0005 ETH` + `500,000 SD`
   - **Pair Contract:** [`0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917`](https://basescan.org/address/0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917)

3. **On-Chain Pool State Verification**:
   - **Reserve0 (SD):** `497,028.76 SD`
   - **Reserve1 (WETH):** `0.000503 WETH`
   - **Total LP Tokens:** `15.811388 LP`
   - **User LP Balance:** `15.811388 LP` (**100.000000% Ownership**)
   - **Initial Spot Price:** `~0.000000001035 ETH / SD` (~`$0.0000028 USD` per SD token)
   - **Verified Live Quote:** `0.00001 ETH` swaps for `9,660.20 SD`

---

## 8. Summary of Completed Deliverables

- [x] 5 smart contracts deployed to Base Mainnet.
- [x] 1,000,000 SD minted 100% into user self-custodial wallet (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`).
- [x] Uniswap V2 Pair (`SD/WETH`) created on Base Mainnet (`0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917`).
- [x] Initial liquidity seeded with `0.0005 ETH` + `500,000 SD`.
- [x] 100% of circulating LP tokens deposited in user wallet.
- [x] Frontend upgraded with Base Mainnet support, chain switcher, and nav links.
- [x] All 76 unit/integration tests passing.


