# Sovereign V3 Liquidity Timelock & DEX Dashboard Integration

**Date:** October 12, 2026  
**Protocol:** Shaggy Dogg DEX (`dex.lumsian.com`)  
**Network:** Base Mainnet (Chain ID: `8453`)  
**Asset Locked:** Uniswap V3 Position NFT `#6245990` (SD / WETH 1.0% Pool)  
**Lock Contract Address:** [`0xb5c9bedb57f4e348e40a5e6326c90de474072e25`](https://basescan.org/address/0xb5c9bedb57f4e348e40a5e6326c90de474072e25)  
**Status:** **100% Locked, Active, Cryptographically Verified on Base Mainnet**

---

## 1. Executive Summary

To eliminate reliance on commercial third-party liquidity lockers (e.g., PinkLock, UNCX, FlokiFi) which charge exorbitant flat fees ($100–$255 / 0.1 ETH) or skim pool percentages, the Shaggy Dogg DEX team engineered, tested, deployed, and embedded a custom, non-custodial **Sovereign V3 Liquidity Timelock** directly into the DEX's native liquidity dashboard at `https://dex.lumsian.com/liquidity`.

The timelock contract custody mechanism was successfully executed on Base Mainnet, securing the primary **SD / WETH 1.0%** Uniswap V3 liquidity position for **12 months** (until **October 12, 2027**), while allowing the liquidity provider to harvest 100% of accumulated trading fees on demand without unlocking principal.

---

## 2. On-Chain Mainnet Transaction Records

### A. Contract Deployment
- **Contract:** `V3PositionTimelock.sol`
- **Address:** `0xb5c9bedb57f4e348e40a5e6326c90de474072e25`
- **Transaction Hash:** [`0xf9fd35c9c716e32ae22e5ed3844cd173e97faecd4e003d7a547edafd3dd7ec09`](https://base.blockscout.com/tx/0xf9fd35c9c716e32ae22e5ed3844cd173e97faecd4e003d7a547edafd3dd7ec09)
- **Block:** `52,527,662`
- **Gas Used:** `684,858` (~0.0000041 ETH / < $0.02)
- **Position Manager Bound:** Canonical Uniswap V3 Position Manager (`0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`)

### B. NFT Custody Approval
- **Transaction Hash:** [`0xe2d4f34e29b0a7be8801125452a2f5e8568daba59b8fe43481f071231f47aab9`](https://base.blockscout.com/tx/0xe2d4f34e29b0a7be8801125452a2f5e8568daba59b8fe43481f071231f47aab9)
- **Block:** `52,531,145`
- **Status:** Success (`0x1`)
- **Sender:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (Deployer / Liquidity Provider)
- **Call:** `approve(address to, uint256 tokenId)`
  - Spender: `0xb5c9bedb57f4e348e40a5e6326c90de474072e25`
  - Token ID: `#6245990`

### C. Timelock Deposit & Activation
- **Transaction Hash:** [`0xc0a4ff8b8eef5dddc0165692111be80adafff36492867ba0f014d5d047ae3d72`](https://base.blockscout.com/tx/0xc0a4ff8b8eef5dddc0165692111be80adafff36492867ba0f014d5d047ae3d72)
- **Block:** `52,531,190`
- **Block Timestamp:** `2026-10-13 00:35:27 UTC`
- **Status:** Success (`0x1`)
- **Call:** `lockPosition(uint256 tokenId, uint256 unlockTimestamp)`
  - Token ID: `#6245990`
  - Unlock Timestamp: `1823387531` (**October 12, 2027 17:32:11 UTC**)
- **State Changes Confirmed:**
  - `ownerOf(#6245990)` = `0xb5c9bedb57f4e348e40a5e6326c90de474072e25`
  - `getLock(#6245990)`:
    - `owner`: `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`
    - `unlockTimestamp`: `1823387531`
    - `lockedAt`: `1791851727`
    - `isLockedActive`: `true`

---

## 3. Smart Contract Architecture

The contract `contracts/src/V3PositionTimelock.sol` was designed following strict non-custodial principles:

```
                            ┌────────────────────────────────────────┐
                            │      Sovereign V3 Timelock             │
                            │   0xb5c9bedb...2e25 (Base Mainnet)     │
                            └──────────────────┬─────────────────────┘
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               ▼                               ▼                               ▼
    ┌─────────────────────┐        ┌──────────────────────┐        ┌─────────────────────┐
    │ lockPosition()      │        │ harvestTradingFees() │        │ withdraw()          │
    │ Deposits V3 NFT,    │        │ Claims 100% of       │        │ Only callable after │
    │ records lock owner  │        │ SD & WETH fees to    │        │ unlockTimestamp     │
    │ and unlock date     │        │ owner anytime        │        │ has elapsed         │
    └─────────────────────┘        └──────────────────────┘        └─────────────────────┘
```

### Architectural Guarantees
1. **Mathematical Timelock:** The `withdraw()` function enforces `require(block.timestamp >= lock.unlockTimestamp, "Position is locked")`. It cannot be overridden by anyone, including the deployer.
2. **Zero Admin Backdoors:** There is no global owner, admin, pause mechanism, or upgrade proxy. Ownership of a position is stored strictly on a per-lock basis (`locks[tokenId].owner`).
3. **100% Fee Retainment:** `harvestTradingFees(tokenId)` routes all accumulated trading fees (`amount0Max`, `amount1Max`) directly to `msg.sender` (which must be `lock.owner`).
4. **Lock Extension Only:** `extendLock(tokenId, newUnlockTimestamp)` permits increasing the duration, but strictly prevents shortening or cancelling it (`require(newUnlockTimestamp > lock.unlockTimestamp)`).

---

## 4. Full Verification & Test Coverage

### A. Foundry Smart Contract Unit Tests
Located in `contracts/test/V3PositionTimelock.t.sol`:
- `test_LockPosition`: Verifies NFT transfer and lock mapping storage.
- `test_RevertEarlyWithdraw`: Verifies mathematical revert before `block.timestamp >= unlockTimestamp`.
- `test_WithdrawAfterUnlock`: Verifies successful withdrawal and state cleanup after timestamp warp.
- `test_HarvestTradingFees`: Verifies collection of fees without touching locked liquidity.
- `test_ExtendLock`: Verifies duration extension and prevents duration reductions.
- `test_RevertUnauthorizedHarvest`: Verifies non-owners cannot harvest fees.
- **Result:** **6 / 6 Passed**

### B. Isolated Mainnet Fork Simulation
Documented in `scripts/test-v3-timelock-fork.mjs` / `docs/liquidity/v3-timelock-test-2026-10-12.md`:
- Executed 12 checks across 20 signed transactions on a live Base fork with authentic Uniswap V3 contracts.
- Verified fee distributions in SD and WETH without altering position liquidity.
- Tested both 90-day (3-month) and 365-day (12-month) lifecycle paths.

### C. Vitest Frontend Unit & Integration Tests
Located in `src/components/liquidity/LpLockCard.test.tsx`:
- Validated transaction confirmation receipt verification (reverts trigger errors, successes trigger toasts).
- Validated wallet signature rejections.
- Validated strict `chainId: 8453` targeting even if wallet is connected to Ethereum mainnet.
- Validated dynamic unlock date button rendering.
- **Result:** **15 / 15 Passed**

### D. Full Repository Vitest Suite
- **Result:** **30 / 30 Test Files Passed (150 Passed, 1 Todo)**

---

## 5. UI/UX Dashboard Integration

The Sovereign Locker management dashboard was embedded in `src/components/liquidity/LpLockCard.tsx` on the `/liquidity` page:

### Key Capabilities
- **State Synchronizer:** Automated 5-second polling (`refetchInterval: 5_000`) across all wagmi contract reads (`ownerOf`, `getLock`, `positions`).
- **Dual Lock Detector:** Simultaneously verifies both Uniswap V3 NFT ownership and the Timelock registry to guarantee immediate UI transitions without needing page reloads.
- **Dynamic Lock Duration:** Supports 3-Month and 12-Month duration previews and countdowns.
- **Fee Growth Notice:** Transparently notes that uncollected fee growth settles on-chain upon harvest.
- **Audit Verification Links:** Direct block explorer links to verified smart contract bytecode and receipt proofs on BaseScan and Blockscout.

---

## 6. Git & Deployment Log

| Target | Identifier | Details |
| :--- | :--- | :--- |
| **Commit 1** | `aa322cf` | `fix(liquidity): verify receipts for reverts, enforce chainId 8453, and make unlock date dynamic` |
| **Commit 2** | `b65141f` | `fix(liquidity): add refetchInterval polling and dual lock detection for immediate UI transition` |
| **Branch** | `main` | Synchronized with `origin/main` |
| **Vercel Build** | `dpl_2vL3Ve9ZBF6Y1Dm8Du1EvMoyPJ1v` | Production deployment ready |
| **Live Production URL** | [`https://dex.lumsian.com/liquidity`](https://dex.lumsian.com/liquidity) | Aliased and serving HTTP 200 OK |

---

## 7. Operational Runbook

### How to Harvest Accumulated DEX Trading Fees
1. Visit `https://dex.lumsian.com/liquidity`.
2. Connect wallet `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`.
3. In the **Sovereign V3 Liquidity Locker** card, view the live **Unclaimed SD** and **Unclaimed WETH** counters.
4. Click **Harvest 100% Fees to Wallet**.
5. Approve the transaction in MetaMask (~$0.01 gas).
6. 100% of accumulated trading fees are transferred directly to your wallet while your liquidity remains 100% locked.

### How to Withdraw When Timelock Completes
1. On **October 12, 2027**, the countdown timer will reach zero.
2. The button will automatically illuminate green: **Withdraw Position NFT**.
3. Click the button and confirm the transaction in MetaMask.
4. Uniswap V3 NFT `#6245990` is transferred back to your personal wallet.
