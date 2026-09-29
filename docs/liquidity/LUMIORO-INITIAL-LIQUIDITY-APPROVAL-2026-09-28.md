# LUMIORO Token: Initial Liquidity Approval Memorandum

**Date:** 2026-09-28T23:20:00Z  
**Network:** Ethereum Mainnet (Chain ID 1) / Base Mainnet (Chain ID 8453)  
**Token Symbol:** `LUMIORO`  
**Token Address:** `0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E`  
**Reviewer:** Treasury Reserves Officer  
**Role:** Treasury  

---

## 1. Approved Liquidity Envelope Specification

In accordance with the Lumioro Release Policy and AMM Liquidity Envelope specifications:

| Parameter | Approved Value | Description |
| :--- | :--- | :--- |
| **Token Base Units** | `250,000,000,000,000,000,000,000,000` | 250,000,000 LUMIORO (25% of fixed 1B supply) |
| **Minimum WETH Required** | `20,000,000,000,000,000` (0.02 ETH) | Absolute floor for initial pair creation |
| **Maximum WETH Permitted** | `22,500,000,000,000,000,000` (22.5 ETH) | Absolute ceiling for seed liquidity capital |
| **Approved Seed WETH** | `20,500,000,000,000,000,000` (20.5 ETH) | Exact reviewed allocation for AMM pool creation |
| **Exact Plan Key** | `0x7a31b6e49dc21b369f91a037b51e60249219b168707ef3a31c5483259e871da4` | SHA-256 fingerprint of the reviewed liquidity payload |

---

## 2. Risk & Operational Controls

1. **Slippage Bounds:** Pair creation transaction must enforce exact zero slippage bounds (`amount0Minimum == amount0Desired` and `amount1Minimum == amount1Desired`).
2. **Atomic Provisioning:** Liquidity must be deposited through reviewed factory/router contracts only.
3. **Fail-Closed Execution:** Any allocation outside the `[0.02 ETH, 22.5 ETH]` band is rejected by `buildLumioroLiquidityReview`.
