# Protocol Economics and Profit-Sharing Policy

**Status:** Terms approved, **not live** (no payouts: no distributor contract exists; `enabled: false`)  
**Canonical Chain:** Base Mainnet (`8453`)  
**Specification:** `config/protocol-economics.json`  
**TypeScript Reference:** `src/config/protocol-economics.ts`  
**Accounting Ledger Utility:** `scripts/calculate-epoch-rewards.ts`  

---

## 1. Executive Summary

As part of Phase 5 of the Shaggy Dogg DEX Authority Roadmap, the protocol economics framework formalizes value distribution from automated execution desks (Atomic Flash Loan Arbitrage, CeDeFi L2 Hedging, and Cross-DEX Triangular Arbitrage) directly to protocol participants.

The policy implements a **10% / 90% Net Realized Profit Split**:
- **10% (1,000 bps) to AMUTT Stakers** (proposed; nothing is allocated or paid until a distributor exists): to be allocated weekly in native Base USDC to accounts with active stakes in `FeeDiscountStaking`.
- **90% (9,000 bps) to Protocol Treasury**: Retained by the protocol treasury on Base to maintain execution inventory, collateral margins, gas buffers, and continuous liquidity depth.

---

## 2. Zero-Hallucinated-Yield Accounting Principles

1. **Strictly Realized Net Profit**:
   - Rewards are funded exclusively from finalized net arbitrage profits, defined as:
     $$\text{Eligible Profit} = \text{Gross Realized Proceeds} - \text{Principal Capital} - \text{Trading/Pool Fees} - \text{Flash Loan Fees} - \text{Gas Costs (USDC)} - \text{Carried Losses}$$
   - **No Return on Deposit Principal**: Staking AMUTT or depositing into vaults does not guarantee a fixed annual percentage yield (APY).
   - **No Unrealized Quotation Allocations**: Projected or simulated route spreads never trigger distributions. Only finalized transaction receipts and reconciled exchange fills qualify.

2. **Settlement Asset**:
   - Canonical Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals).
   - All non-USDC expenses (such as ETH gas fees) must have a timestamped, verifiable valuation at execution time.

3. **Loss Carryforward**:
   - In any epoch where trading expenses or gas exceed gross proceeds, the net deficit is recorded as a carried loss.
   - Carried losses must be fully recovered in subsequent epochs before any positive profit allocation to stakers resumes.
   - When eligible net profit is zero or negative, zero rewards are distributed for that epoch.

4. **Execution Integrity Gate**:
   - Any unresolved trade leg (e.g. an unfilled CEX hedge or pending on-chain transaction) or missing fee receipt blocks epoch finalization until resolved.

---

## 3. Weekly Epochs & Staker Eligibility

1. **7-Day Epoch Cadence**:
   - Epochs run in rolling 7-day intervals (604,800 seconds).

2. **Time-Weighted Staking Metric**:
   - Staker weight is calculated proportionally by integrating active staked balance over time throughout the epoch:
     $$W_u = \int_{T_{\text{start}}}^{T_{\text{end}}} \text{StakedBalance}_u(t) \, dt$$
   - Reconstructed deterministically from on-chain `Staked(address,uint256)` and `Unstaked(address,uint256,uint256)` event logs emitted by `FeeDiscountStaking.sol` (`0x055BB4eD8d5464C25D71391E940ce53CA30845fC`) on Base Mainnet.
   - **Wallet Balances Disqualified**: AMUTT tokens held in an un-staked wallet do not accrue time-weighted reward shares.

3. **Rounding and Dust Carryforward**:
   - Individual staker allocations are rounded down to the nearest integer USDC base unit (1 micro-USDC, $10^{-6}$).
   - Any residual fractional dust remains in the staker reward pool and carries forward to the following epoch.

---

## 4. Smart Contract Architecture & Off-Chain Ledger Reconciliation

- **Contract Separation**:
  - The deployed `FeeDiscountStaking` contract handles on-chain staking positions, lock durations, and VIP fee discount tiers (Bronze, Silver, Gold, Diamond).
  - The staking contract is immutable and contains no built-in ERC20 reward claim or pull-distribution logic.
- **Auditable Epoch Ledgers**:
  - Weekly allocations are calculated by `scripts/calculate-epoch-rewards.ts`, producing a cryptographic report detailing staker weights, transaction receipts, verified expenses, and exact USDC distributions.
  - Reports are published publicly prior to funding or distribution.

---

## 5. Advisory Governance

1. **Advisory Token Power**:
   - One staked AMUTT token at the snapshot block equals one advisory voting unit.
   - 7-day voting period, 500 bps (5%) quorum of total staked supply, and >50% approval requirement.
2. **Safety Boundaries**:
   - Advisory votes do not possess automatic contract execution authority or direct treasury drainage capabilities.
   - Any parameter adjustment or contract migration must be reviewed, signed, and broadcast by the designated protocol administrator.
