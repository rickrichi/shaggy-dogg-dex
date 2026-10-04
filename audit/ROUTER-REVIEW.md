# AtomicFlashArbitrageRouter: line-by-line review (maintainers' self-review)

Contract: `contracts/src/AtomicFlashArbitrageRouter.sol` (491 lines), deployed at
`0x70315019D12A11556C837970675cDC8Fa54d186b` (admin `0x9dC0…47C98`, Aave pool `0xA238…d1c5`).
This is a pre-audit review, not an audit. Tests: `contracts/test/AtomicFlashArbitrageRouter.t.sol` (12) and
`contracts/test/AtomicFlashArbitrageRouterSecurity.t.sol` (new).

## Verdict

No way was found for a third party, or for an operator, to take the **Aave-borrowed** funds: the final balance
check (L275-280) must cover principal plus premium plus `minNetProfit`, or the whole transaction reverts.
The router's real exposure is **anything it holds between runs**, and the **operator hot key**, which has far
more power than its name suggests. Both are trust and operations issues rather than code bugs.

## What was checked, by region

| Lines | Area | Result |
| --- | --- | --- |
| 17-83 | State, roles, constructor | OK. `admin` is mutable by admin; **constructor makes the deployer an operator (L81)**: R1 |
| 91-109 | `setAdmin` / `setOperator` / `setAavePool` | Admin-only, zero-address checked. One-step admin transfer (no acceptance step). `setAavePool` accepts any address: R7 |
| 118-229 | Dispatchers | `nonReentrant` + `onlyAuthorized`; encode a route and call Aave. Operator chooses routers, paths and `profitRecipient` freely: R2 |
| 238-298 | `executeOperation` callback | Requires `msg.sender == aavePool` and `initiator == address(this)` (correct, stops third-party-initiated loans). Final guard includes the premium. Events precede the payout transfer (cosmetic) |
| 304-323 | Generic steps | Arbitrary `target.call(callData)` and approvals chosen by the caller: R2, R8 |
| 325-361 | Uniswap V2 / Aerodrome paths | Path start and end are checked against the borrowed asset. `amountOutMin = 0`: R4 |
| 363-403 | Dual-DEX | Uses router-reported output (`amountsA[1]`): R6. Exact-amount approvals |
| 420-438 | `_safeApprove` / `_safeTransfer` | Handles no-return-data tokens; approve is reset to 0 first (result intentionally ignored) |
| 454-490 | `rescueTokens`, `rescueETH`, `withdrawProfit` | Admin-only, `nonReentrant`. `receive()` is open, so ETH can be sent in; the admin can recover it |

## Findings

| ID | Severity | Finding | Test |
| --- | --- | --- | --- |
| R1 | High (operations) | The constructor adds the **deployer** as an operator. On-chain, the only `OperatorUpdated` event ever emitted is `0xc1c3…f42B` approved at block 52,071,572, and `isOperator(0xc1c3…) == true` today. That wallet is not the admin and its key lives on a developer machine. Recommended: the admin calls `setOperator(0xc1c3…, false)` after moving the daemon to a dedicated, low-balance operator wallet. | `testKnownIssueDeployerIsOperatorFromConstructor` |
| R2 | High (trust) | An operator can run generic steps: `target.call(callData)` with approvals for any token the router holds. It can move **any non-borrowed token balance out of the router** (the guard only checks the borrowed asset), and can pick any `profitRecipient`. The router must hold no balances between runs. | `testKnownIssueOperatorCanMoveOtherTokensHeldByRouter` |
| R3 | Medium | Profit is `finalBalance - totalDebt`, which counts any **pre-existing balance** of the borrowed asset. Stray funds are paid to the recipient as "profit". | `testKnownIssueExistingBalanceIsPaidOutAsProfit` |
| R4 | Medium (MEV) | Every swap uses `amountOutMin = 0`. Only the final guard protects the run, so a sandwiched run reverts or earns less, costing gas but not principal. Set `minNetProfit` above the premium and submit privately. | `testFlashLoanWithoutProfitReverts` |
| R5 | Low | `minNetProfit` is caller-supplied and may be zero: a zero-profit run is allowed and only costs gas and premium. | n/a |
| R6 | Low (hardening) | `tokenBBal` uses the router's return value, not a balance delta. A dishonest or fee-on-transfer router makes the later step revert; it cannot cause an overspend. | n/a |
| R7 | Low | `setAavePool` can point at any contract; `executeOperation` trusts `msg.sender == aavePool`. A hostile pool set by the admin could call the callback directly. No escalation beyond admin power. | `testOnlyAdminControlsRolesPoolAndRescue` |
| R8 | Low | Generic-step approvals (up to `spend`) can remain unused, leaving an allowance to a caller-chosen target. | n/a |
| R9 | Info | `executeOperation` is not itself `nonReentrant`; it is protected because Aave calls it inside a guarded dispatcher. | `testCallbackRejectsStrangersAndWrongInitiator` |
| R10 | Info | Admin transfer is single-step (a mistyped address would be permanent). Same pattern in every contract here. | n/a |

## Recommended operational changes (no redeploy needed)

1. Run the daemon from a **separate operator wallet** that holds only gas, never the deployer or admin key.
2. Revoke `0xc1c3…f42B` as an operator once the new one is set (admin transaction).
3. Keep the router's token balances at zero; sweep dust with `rescueTokens`.
4. Always pass `minNetProfit` greater than the Aave premium and use a private submission endpoint.

## Not covered

Economic and MEV behaviour against live pools, gas griefing, and the off-chain daemon logic.
