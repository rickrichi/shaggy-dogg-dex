# Known issues (self-assessment, pre-audit)

Written by the maintainers' tooling before an independent review. It is not an audit report.
Severity is a preliminary judgement. Each issue marked "test" is reproduced by a passing Foundry test
that documents the current behaviour. The tests assert the problem exists; they do not fix it.

Run: `cd contracts && forge test --match-contract "FeeDiscountStakingTest|LaunchpadSuiteDeployerTest"`. The vault and router suites (`YieldVaultBaseForkTest`, `CompoundVaultBaseForkTest`, `LaunchpadSuiteBaseForkTest`, `FlashRouterBaseForkTest`) run on a Base mainnet fork against the real Aave v3, Compound v3, Uniswap V2 and Aerodrome contracts and need an archive-capable `BASE_FORK_RPC_URL`.

## FeeDiscountStaking (`0x055B…`, SD copy `0x4213…`)

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-S1 | High (trust), **fixed for new launchpad deployments** | The lock is now capped at 365 days and snapshotted per position. Admin lock changes affect future stakes only and cannot extend existing unlock times. Older deployments remain unchanged. | `testAdminLockChangeDoesNotRelockExistingPosition` |
| KI-S2 | High (trust), partially fixed | `setWithdrawalFee` (cap 50%) still applies to existing stakes by design and is disclosed in the launchpad. Fees are now tracked in `accruedFees` and the admin can collect only those fees with `withdrawFees`; staked principal remains reserved. | `testWithdrawalFeeChangesApplyToExistingAndAccrueCollectibleFees`, `LaunchpadSuiteDeployerTest.testFeesWithdrawalCannotTouchStakes` |
| KI-S3 | Low | `getTier` assumes ascending tiers; an unsorted array silently lowers discounts. `setTiers` is unbounded (gas of `getTier` grows with tier count). | `testKnownIssueUnsortedTiersLowerDiscount` |
| KI-S4 | Info | Staking again resets the lock for the whole position (documented in the UI). Fee-on-transfer tokens would be over-credited (AMUTT is not one). | `testRestakeResetsLockForWholePosition` |

Fixes require a new deployment (the contract is not upgradeable).

## YieldStakingVault v2 (`0xC29c…`) and CompoundYieldVault

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-V1 | Medium, **fixed in v3 `0x5c98…` and both new launchpad vaults** (older vaults unchanged) | First-depositor share-price donation. Fixed by virtual shares/assets (`VIRTUAL_SHARES = 1e6`, `VIRTUAL_ASSETS = 1`) in both vault sources: on the real Aave and Compound markets the attacker loses money and the victim loses at most 0.01 USDC on 15,000. Shares carry 6 extra decimals. The v1 and v2 vaults still have the issue (zero assets). | `testDonationAttackIsUnprofitable`, `testTinyDepositAfterDonationReverts` (both vault fork suites) |
| KI-V2 | High, **fixed for new launchpad vaults (Aave and Compound)** | The Aave pool and aToken, and the Compound Comet, are now immutable; `setAavePoolAndAToken` and `setComet` were removed, so the administrator cannot redirect later deposits. `LaunchpadSuiteDeployer` also rejects any non-canonical USDC, Aave pool, aUSDC or Comet. Older deployed vaults are unchanged. | `testMarketAddressesAreFixed` (both vault fork suites), `LaunchpadSuiteDeployerTest.testInvalidSettingRevertsEverything` |
| KI-V3 | High, **fixed for new launchpad vaults (Aave and Compound)** | Market repointing was removed. A paused vault can pull assets only from its immutable market (`emergencyWithdrawFromAave` / `emergencyWithdrawFromComet`, `type(uint256).max` for everything) and only back into the vault for share withdrawals. Older deployed vaults are unchanged. | `testPauseBlocksDepositsKeepsWithdrawalsAndRecoversOnlyIntoTheVault` (both vault fork suites), `LaunchpadSuiteBaseForkTest.testAdminControlsBothVaultsTheSameWay` |
| KI-V4 | Medium | If the treasury cannot receive the asset (for example a USDC blocklist), `withdraw` reverts for any position with profit, because the fee transfer is `require`d. Not covered by a test. | none |
| KI-V5 | Low, **fee increase fixed for new launchpad vaults (Aave and Compound)** | The performance fee (cap 30%) and discount apply at withdrawal. While shares exist, the administrator may only reduce the fee; increases are permitted only after the vault is empty. A zero `assetsBefore` with non-zero shares re-prices new deposits 1:1 (edge case, no test). Older deployed vaults are unchanged. | `testFeeCannotIncreaseWhileSharesExist` (both vault fork suites) |
| KI-V6 | Info | The v1 vaults (`0x16a1…`, `0x8531…`) use the old discount scale (1,000 base) and hold zero assets. v2 and both current vault sources use 10,000 and expose `discountDenominator()`. | `testWiringMatchesTheLaunch` (both vault fork suites) |

## AtomicFlashArbitrageRouter (`0x7031…`)

Full line-by-line self-review: `ROUTER-REVIEW.md`. Summary:

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-R1 | High (operations) | The deployer `0xc1c3…f42B` is an operator from the constructor and still is on-chain; the admin is a different wallet. Recommended: use a dedicated operator wallet and revoke `0xc1c3…`. Routers from `LaunchpadSuiteDeployer` revoke the deploying contract and have no operators. | `FlashRouterBaseForkTest.testInitialisationAndKnownIssueDeployerIsOperator`, `LaunchpadSuiteBaseForkTest.testEveryContractIsWiredToTheLaunch` |
| KI-R2 | High (trust) | An operator can move any token the router holds via generic steps; only the borrowed asset is protected by the profit guard. Reproduced with real WETH and a real Aave flash loan. | `testKnownIssueOperatorCanMoveOtherTokensHeldByRouter` |
| KI-R3 | Medium | Pre-existing balances of the borrowed asset are counted as profit and paid out (reproduced with a real Aave flash loan). | `testKnownIssueExistingBalanceIsPaidOutAsProfit` |
| KI-R4 | Medium (MEV) | All swaps use `amountOutMin = 0`; protection is the final profit guard only. | `testAntiLossGuardRevertsALosingRouteAndAnUnmetTarget` |

Aave-borrowed funds cannot be taken by an operator: the callback requires principal, premium and `minNetProfit` to be covered or the transaction reverts.

## Cross-cutting

- KI-X1 (High, trust): one EOA administers every contract and receives vault fees. Compromise of that key controls all admin functions above.
- KI-X2 (Medium): token supply is fully minted to the deployer at launch (`MAX_SUPPLY == initialMint`, the minter role is inert). Holder concentration is a market issue, not a contract bug.
- KI-X3: current DEX pools hold only dust (about 0.0005 WETH each). Liquidity is not locked; the LP tokens are in the admin wallet.
- KI-X4: contracts are immutable and have no pause or emergency exit.
- KI-X5 (High, operations; history purged, key still burned): a deployer private key (`0xc1c3…f42B`, router operator, about 0.0004 ETH) was hardcoded in a script and committed in `ddddb02`, and pushed to the private remote. A second hardcoded key (`0xD22a…AfD1`, a throwaway test key, empty on Base) was in a tracked script and remains as a fixture in one test file. Both were removed from the scripts in `ea67044`, and the deployer key was rewritten out of all git history on 2026-10-04 (commit hashes changed; tags re-pointed). History rewriting does not un-leak a key: GitHub may keep cached views of old commits until it garbage-collects, so treat both keys as compromised, revoke `0xc1c3…` as router operator, and stop using them. The scripts now read `PRIVATE_KEY` from the environment only.

## Slither (41 results)

Every result is triaged individually in `SLITHER-TRIAGE.md`: 10 false positives, 13 out of scope (`IsolatedLendingVault`, not deployed),
4 real and documented (vault pool setters, KI-V2/V3), the rest accepted with a rationale (one hardening suggestion: check Aave's returned
withdrawal amount).
