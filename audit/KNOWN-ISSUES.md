# Known issues (self-assessment, pre-audit)

Written by the maintainers' tooling before an independent review. It is not an audit report.
Severity is a preliminary judgement. Each issue marked "test" is reproduced by a passing Foundry test
that documents the current behaviour. The tests assert the problem exists; they do not fix it.

Run: `cd contracts && forge test --match-contract "FeeDiscountStakingTest|YieldStakingVaultUnitTest"`.

## FeeDiscountStaking (`0x055B…`, SD copy `0x4213…`)

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-S1 | High (trust) | `setMinimumStakePeriod` has no upper bound. A value near `uint256.max` makes the lock check overflow, so every `unstake` reverts permanently. The admin can lock all stakers. | `testKnownIssueAdminCanLockAllStakersForever` |
| KI-S2 | High (trust) | `setWithdrawalFee` (cap 50%) applies to existing stakes. The fee remains in the contract and there is no function to collect it, so it is unaccounted and stuck. | `testKnownIssueRetroactiveFeeAndStuckFees` |
| KI-S3 | Low | `getTier` assumes ascending tiers; an unsorted array silently lowers discounts. `setTiers` is unbounded (gas of `getTier` grows with tier count). | `testKnownIssueUnsortedTiersLowerDiscount` |
| KI-S4 | Info | Staking again resets the lock for the whole position (documented in the UI). Fee-on-transfer tokens would be over-credited (AMUTT is not one). | `testRestakeResetsLockForWholePosition` |

Fixes require a new deployment (the contract is not upgradeable).

## YieldStakingVault v2 (`0xC29c…`), same pattern in CompoundYieldVault

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-V1 | Medium | First-depositor share-price donation. A 1-unit first deposit plus a direct token donation makes a later depositor round down to few shares, so the attacker captures part of the victim's deposit. Only a zero-share result reverts. No virtual or dead shares. | `testKnownIssueFirstDepositorDonationCapturesVictimFunds` |
| KI-V2 | High (trust) | `setAavePoolAndAToken` accepts any address. After the change, deposits are approved to and supplied to the admin-chosen contract. | `testKnownIssueAdminCanRedirectDepositsToArbitraryPool` |
| KI-V3 | High (trust) | Repointing the pool or aToken away from one that still holds funds hides them from `totalAssets()`; no migration path exists. | `testKnownIssueRepointingHidesExistingFunds` |
| KI-V4 | Medium | If the treasury cannot receive the asset (for example a USDC blocklist), `withdraw` reverts for any position with profit, because the fee transfer is `require`d. Not covered by a test. | none |
| KI-V5 | Low | The performance fee (cap 30%) and discount apply at withdrawal and can change for existing depositors. A zero `assetsBefore` with non-zero shares re-prices new deposits 1:1 (edge case, no test). | none |
| KI-V6 | Info | The v1 vaults (`0x16a1…`, `0x8531…`) and the Compound vault use the old discount scale (1,000 base). They hold zero assets. v2 uses 10,000 and exposes `discountDenominator()`. | `FeeDiscountMathTest`, fork test |

## AtomicFlashArbitrageRouter (`0x7031…`)

Not yet reviewed line by line by the maintainers. Notes from the permission map:
- `admin` can set the Aave pool (`setAavePool`), operators, rescue tokens/ETH and withdraw profit. `executeOperation` requires `msg.sender == aavePool`, so a malicious pool address set by the admin is a trust issue.
- Operators (the daemon hot key) can trigger arbitrage; the router should hold no funds between runs.
- Slither flags `_executeDualDexV2` for balance-based reentrancy (needs manual confirmation).

## Cross-cutting

- KI-X1 (High, trust): one EOA administers every contract and receives vault fees. Compromise of that key controls all admin functions above.
- KI-X2 (Medium): token supply is fully minted to the deployer at launch (`MAX_SUPPLY == initialMint`, the minter role is inert). Holder concentration is a market issue, not a contract bug.
- KI-X3: current DEX pools hold only dust (about 0.0005 WETH each). Liquidity is not locked; the LP tokens are in the admin wallet.
- KI-X4: contracts are immutable and have no pause or emergency exit.

## Slither summary (43 results; `audit/slither-output.txt`)

| Detector | Count | Triage |
| --- | --- | --- |
| reentrancy-balance (High) | 8 | Vault `deposit`: guarded by `nonReentrant`; balance read before and after supply is by design. Router `_executeDualDexV2`: needs manual review. |
| incorrect-equality (Medium) | 6 | `== 0` share/balance checks; benign. |
| reentrancy-no-eth (Medium) | 2 | `IsolatedLendingVault` only (not deployed). |
| unused-return (Medium) | 8 | Aave/Compound `supply`/`withdraw`/`approve` return values ignored; low risk for USDC. |
| low and informational | 19 | timestamp (staking lock), missing zero-address checks, benign reentrancy events. |

Only the vault `deposit` flags and the staking contract were reviewed individually. The remaining findings are listed, not individually triaged.
