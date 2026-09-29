# Shaggy Dogg (SD) Token: Initial Liquidity Approval & Execution Record

**Date:** 2026-09-29T02:57:00Z  
**Network:** Base Sepolia (Chain ID: `84532`)  
**Token Symbol:** `SD`  
**Token Address:** `0x051c758521971f5c5a84edaf18eea12854375469`  
**Pair Contract:** `0x63D504336d01BcCa615B23AD393E5812Dc646BF8`  
**Factory:** `0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e` (Uniswap V2)  
**Root Admin / Liquidity Provider:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (`ShaggyDogg`)  

---

## 1. Liquidity Pool Allocation Specification

| Parameter | Value | Details |
| :--- | :--- | :--- |
| **Total Fixed Supply** | `1,000,000 SD` | 100% minted to Root Admin at deployment |
| **Seeded Token Reserve (SD)** | `800,000 SD` (80.0%) | Transferred to Pair via Tx `0x17540b05...` |
| **Retained Token Reserve (SD)** | `200,000 SD` (20.0%) | Retained in Root Admin wallet for staking & test swaps |
| **Seeded Paired Asset (WETH)** | `0.001 WETH` | Transferred to Pair via Tx `0xb9d13ccc...` |
| **LP Tokens Issued** | `28.284271247461899976 LP` | Delivered to Root Admin via Tx `0x734d8bf6...` |
| **Burned Minimum Liquidity** | `0.000000000000001000 LP` (1,000 wei) | Permanently locked in `0x0000000000000000000000000000000000000000` |
| **Pool Constant Product (k)** | `800,000 * 0.001 = 800` | $(8 \times 10^{23}) \times (1 \times 10^{15}) = 8 \times 10^{38}$ wei |

---

## 2. On-Chain Transaction Audit Trail

1. **Pair Creation:**
   - **Transaction:** [`0x2e41545dc517a5a5ea9777d9e56194616d1e8ba1beb675f769e3a782e7a69ec5`](https://sepolia.basescan.org/tx/0x2e41545dc517a5a5ea9777d9e56194616d1e8ba1beb675f769e3a782e7a69ec5)
   - **Block:** `47452824`
   - **Action:** UniswapV2Factory `createPair(SD, WETH9)` deployed `0x63D504336d01BcCa615B23AD393E5812Dc646BF8`.

2. **WETH Capital Deposit:**
   - **Transaction:** [`0xb9d13ccc823b9b51037101fbd6240cd4141203163a93ac857ca5f4b02480d94f`](https://sepolia.basescan.org/tx/0xb9d13ccc823b9b51037101fbd6240cd4141203163a93ac857ca5f4b02480d94f)
   - **Block:** `47452844`
   - **Action:** Transferred `0.001 WETH` from deployer to Pair.

3. **SD Founder Seeding Transfer:**
   - **Transaction:** [`0x17540b0595c1df38535e03cfc602903977de16b6eee7ea0d652882ee67276ffa`](https://sepolia.basescan.org/tx/0x17540b0595c1df38535e03cfc602903977de16b6eee7ea0d652882ee67276ffa)
   - **Block:** `47453744`
   - **Action:** User transferred `800,000 SD` from `0x9dC0a2...47C98` to Pair.

4. **Pair Liquidity Minting:**
   - **Transaction:** [`0x734d8bf6855f38c39e9258c4097cb3d4629dbbf10634f083254824e7f3818f80`](https://sepolia.basescan.org/tx/0x734d8bf6855f38c39e9258c4097cb3d4629dbbf10634f083254824e7f3818f80)
   - **Block:** `47453766`
   - **Action:** Executed `pair.mint(0x9dC0a2...47C98)`.
   - **Result:** Reserves locked at `800,000 SD / 0.001 WETH`; 100% circulating LP tokens credited to user.
