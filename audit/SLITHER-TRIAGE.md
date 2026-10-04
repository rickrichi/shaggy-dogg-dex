# Slither triage (all 41 results)

Tool output: `slither-output.txt` (re-run after the vault share-price fix; the two vault `incorrect-equality` results disappeared).
Each result is listed once with a disposition. Dispositions are the maintainers' judgement, not an audit opinion.
Categories: **False positive**, **Accepted** (understood, no change needed), **Accepted (hardening)** (safe today; recommended improvement), **Real (documented)** (see `KNOWN-ISSUES.md`), **Out of scope** (`IsolatedLendingVault`, not deployed).

| # | Impact | Detector | Location | Disposition | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | High | reentrancy-balance | `AtomicFlashArbitrageRouter.sol` `_executeDualDexV2` (L363) | Accepted (informational) | `tokenBBal` is the router-reported leg-1 output. A dishonest router can only cause a revert (the router cannot spend more than it holds). Routers are operator-chosen. Hardening: use a balance delta. See ROUTER-REVIEW R6. |
| 2 | High | reentrancy-balance | `AtomicFlashArbitrageRouter.sol` `_executeDualDexV2` (L363) | Accepted (informational) | `tokenBBal` is the router-reported leg-1 output. A dishonest router can only cause a revert (the router cannot spend more than it holds). Routers are operator-chosen. Hardening: use a balance delta. See ROUTER-REVIEW R6. |
| 3 | High | reentrancy-balance | `CompoundYieldVault.sol` `deposit` (L115) | False positive | `assetsBefore` is read before this deposit's own transfer on purpose; `nonReentrant` blocks re-entry and USDC has no transfer hooks. Residual: read-only re-entrancy for third-party integrators (none exist). |
| 4 | High | reentrancy-balance | `CompoundYieldVault.sol` `deposit` (L115) | False positive | `assetsBefore` is read before this deposit's own transfer on purpose; `nonReentrant` blocks re-entry and USDC has no transfer hooks. Residual: read-only re-entrancy for third-party integrators (none exist). |
| 5 | High | reentrancy-balance | `CompoundYieldVault.sol` `deposit` (L115) | False positive | `assetsBefore` is read before this deposit's own transfer on purpose; `nonReentrant` blocks re-entry and USDC has no transfer hooks. Residual: read-only re-entrancy for third-party integrators (none exist). |
| 6 | High | reentrancy-balance | `YieldStakingVault.sol` `deposit` (L116) | False positive | `assetsBefore` is read before this deposit's own transfer on purpose; `nonReentrant` blocks re-entry and USDC has no transfer hooks. Residual: read-only re-entrancy for third-party integrators (none exist). |
| 7 | High | reentrancy-balance | `YieldStakingVault.sol` `deposit` (L116) | False positive | `assetsBefore` is read before this deposit's own transfer on purpose; `nonReentrant` blocks re-entry and USDC has no transfer hooks. Residual: read-only re-entrancy for third-party integrators (none exist). |
| 8 | High | reentrancy-balance | `YieldStakingVault.sol` `deposit` (L116) | False positive | `assetsBefore` is read before this deposit's own transfer on purpose; `nonReentrant` blocks re-entry and USDC has no transfer hooks. Residual: read-only re-entrancy for third-party integrators (none exist). |
| 9 | Medium | incorrect-equality | `AtomicFlashArbitrageRouter.sol` `_safeApprove` (L420) | False positive | `data.length == 0` accepts tokens that return no data (USDT-style). Required for compatibility; the success flag is still checked. |
| 10 | Medium | incorrect-equality | `AtomicFlashArbitrageRouter.sol` `_safeTransfer` (L433) | False positive | `data.length == 0` accepts tokens that return no data (USDT-style). Required for compatibility; the success flag is still checked. |
| 11 | Medium | incorrect-equality | `IsolatedLendingVault.sol` `convertToAssets` (L105) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 12 | Medium | incorrect-equality | `IsolatedLendingVault.sol` `convertToShares` (L99) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 13 | Medium | reentrancy-no-eth | `IsolatedLendingVault.sol` `deposit` (L110) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 14 | Medium | reentrancy-no-eth | `IsolatedLendingVault.sol` `mint` (L133) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 15 | Medium | unused-return | `CompoundYieldVault.sol` `deposit` (L115) | Accepted | `approve` return value ignored; USDC returns true or reverts, and a missing allowance makes the following `supply` revert. |
| 16 | Medium | unused-return | `IsolatedLendingVault.sol` `_redeemInternal` (L179) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 17 | Medium | unused-return | `IsolatedLendingVault.sol` `deposit` (L110) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 18 | Medium | unused-return | `IsolatedLendingVault.sol` `deposit` (L110) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 19 | Medium | unused-return | `IsolatedLendingVault.sol` `mint` (L133) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 20 | Medium | unused-return | `IsolatedLendingVault.sol` `mint` (L133) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 21 | Medium | unused-return | `YieldStakingVault.sol` `deposit` (L116) | Accepted | `approve` return value ignored; USDC returns true or reverts, and a missing allowance makes the following `supply` revert. |
| 22 | Medium | unused-return | `YieldStakingVault.sol` `withdraw` (L144) | Accepted (hardening) | Aave `withdraw` returns the amount actually withdrawn and it is ignored. A short withdrawal makes the following transfer revert, so funds are not mis-paid. Hardening: require the returned amount. |
| 23 | Low | calls-loop | `AtomicFlashArbitrageRouter.sol` `_executeGenericSteps` (L304) | Accepted | Generic steps are operator-chosen and gas-bound; the arbitrary-call power itself is KI-R2 (trust). |
| 24 | Low | calls-loop | `AtomicFlashArbitrageRouter.sol` `_executeGenericSteps` (L304) | Accepted | Generic steps are operator-chosen and gas-bound; the arbitrary-call power itself is KI-R2 (trust). |
| 25 | Low | missing-zero-check | `IsolatedLendingVault.sol` `newAdapter` (L253) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 26 | Low | missing-zero-check | `YieldStakingVault.sol` `_aToken` (L63) | Real (documented) | Zero is allowed on purpose (no pool means the vault holds cash), but the admin setter can also point away from a pool that holds funds. See KI-V2 and KI-V3. |
| 27 | Low | missing-zero-check | `YieldStakingVault.sol` `_aavePool` (L61) | Real (documented) | Zero is allowed on purpose (no pool means the vault holds cash), but the admin setter can also point away from a pool that holds funds. See KI-V2 and KI-V3. |
| 28 | Low | missing-zero-check | `YieldStakingVault.sol` `newAToken` (L99) | Real (documented) | Zero is allowed on purpose (no pool means the vault holds cash), but the admin setter can also point away from a pool that holds funds. See KI-V2 and KI-V3. |
| 29 | Low | missing-zero-check | `YieldStakingVault.sol` `newPool` (L98) | Real (documented) | Zero is allowed on purpose (no pool means the vault holds cash), but the admin setter can also point away from a pool that holds funds. See KI-V2 and KI-V3. |
| 30 | Low | reentrancy-benign | `CompoundYieldVault.sol` `deposit` (L115) | False positive | State is updated after external calls, but the function is `nonReentrant` and the order is intentional (shares priced from pre-deposit assets). |
| 31 | Low | reentrancy-benign | `DeployEcosystem.sol` `run` (L49) | Accepted (benign) | One-shot deployment helper; holds no funds and exposes no user-facing state. |
| 32 | Low | reentrancy-benign | `IsolatedLendingVault.sol` `deposit` (L110) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 33 | Low | reentrancy-benign | `IsolatedLendingVault.sol` `mint` (L133) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 34 | Low | reentrancy-benign | `YieldStakingVault.sol` `deposit` (L116) | False positive | State is updated after external calls, but the function is `nonReentrant` and the order is intentional (shares priced from pre-deposit assets). |
| 35 | Low | reentrancy-events | `AaveFlashBorrower.sol` `executeOperation` (L82) | Accepted (cosmetic) | Events are emitted after external calls; affects log ordering only. |
| 36 | Low | reentrancy-events | `AtomicFlashArbitrageRouter.sol` `executeOperation` (L238) | Accepted (cosmetic) | Events are emitted after external calls; affects log ordering only. |
| 37 | Low | reentrancy-events | `DeployEcosystem.sol` `run` (L49) | Accepted (benign) | One-shot deployment helper; holds no funds and exposes no user-facing state. |
| 38 | Low | reentrancy-events | `IsolatedLendingVault.sol` `mint` (L133) | Out of scope | Contract is not deployed and untested (0% coverage); review required before any deployment. |
| 39 | Low | timestamp | `AtomicFlashArbitrageRouter.sol` `_executeDualDexV2` (L363) | Accepted (informational) | `block.timestamp` is passed as the swap deadline, so there is no deadline protection; swaps are atomic inside one transaction, so this has no effect. |
| 40 | Low | timestamp | `AtomicFlashArbitrageRouter.sol` `_safeApprove` (L420) | Accepted (informational) | `block.timestamp` is passed as the swap deadline, so there is no deadline protection; swaps are atomic inside one transaction, so this has no effect. |
| 41 | Low | timestamp | `FeeDiscountStaking.sol` `unstake` (L127) | Accepted (intended) | `block.timestamp` is the clock for a multi-day lock. The real issue with the lock is its unbounded admin setter: KI-S1. |

## Totals

- Accepted: 4
- Accepted (benign): 2
- Accepted (cosmetic): 2
- Accepted (hardening): 1
- Accepted (informational): 4
- Accepted (intended): 1
- False positive: 10
- Out of scope: 13
- Real (documented): 4
- Total: 41
