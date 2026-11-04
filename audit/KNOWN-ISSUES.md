# Known issues (self-assessment, pre-audit)

Written by the maintainers' tooling before an independent review. It is not an audit report.
Severity is a preliminary judgement. Each issue marked "test" is reproduced by a passing Foundry test
that documents the current behaviour.

Run: `cd contracts && forge test --match-contract "FeeDiscountStakingTest|LaunchpadSuiteDeployerTest"`. The vault and router suites (`YieldVaultBaseForkTest`, `CompoundVaultBaseForkTest`, `LaunchpadSuiteBaseForkTest`, `FlashRouterBaseForkTest`) run on a Base mainnet fork against the real Aave v3, Compound v3, Uniswap V2 and Aerodrome contracts and need an archive-capable `BASE_FORK_RPC_URL`.

## FeeDiscountStaking (SD `0x8a76…3faa` and Launchpad deployments)

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-S1 | High (trust), **fixed in active `0x8a76…3faa` and all launchpad deployments** | The lock is capped at 365 days and snapshotted per position. Admin lock changes affect future stakes only and cannot extend existing unlock times. | `testAdminLockChangeDoesNotRelockExistingPosition` |
| KI-S2 | High (trust), partially fixed | `setWithdrawalFee` (cap 50%) still applies to existing stakes by design and is disclosed in the launchpad. Fees are tracked in `accruedFees` and the admin can collect only those fees with `withdrawFees`; staked principal remains reserved. | `testWithdrawalFeeChangesApplyToExistingAndAccrueCollectibleFees`, `LaunchpadSuiteDeployerTest.testFeesWithdrawalCannotTouchStakes` |
| KI-S3 | Low | `getTier` assumes ascending tiers; an unsorted array silently lowers discounts. `setTiers` is unbounded (gas of `getTier` grows with tier count). | `testKnownIssueUnsortedTiersLowerDiscount` |
| KI-S4 | Info | Staking again resets the lock for the whole position (documented in the UI). Fee-on-transfer tokens would be over-credited (`FixedSupplyToken`, `MRWD`, and `SD` have no transfer fees). | `testRestakeResetsLockForWholePosition` |

Fixes require a new deployment (the contract is not upgradeable).

## YieldStakingVault v3 (`0x5c98…59e5`) and CompoundYieldVault

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-V1 | Medium, **fixed in v3 `0x5c98…59e5` and both launchpad vaults** | First-depositor share-price donation. Fixed by virtual shares/assets (`VIRTUAL_SHARES = 1e6`, `VIRTUAL_ASSETS = 1`) in both vault sources: on the real Aave and Compound markets the attacker loses money and the victim loses at most 0.01 USDC on 15,000. Shares carry 6 extra decimals. | `testDonationAttackIsUnprofitable`, `testTinyDepositAfterDonationReverts` (both vault fork suites) |
| KI-V2 | High, **fixed in current launchpad vaults (Aave and Compound)** | The Aave pool and aToken, and the Compound Comet, are immutable; `setAavePoolAndAToken` and `setComet` were removed, so the administrator cannot redirect later deposits. `LaunchpadSuiteDeployer` also rejects any non-canonical USDC, Aave pool, aUSDC or Comet. | `testMarketAddressesAreFixed` (both vault fork suites), `LaunchpadSuiteDeployerTest.testInvalidSettingRevertsEverything` |
| KI-V3 | High, **fixed in current launchpad vaults (Aave and Compound)** | Market repointing was removed. A paused vault can pull assets only from its immutable market (`emergencyWithdrawFromAave` / `emergencyWithdrawFromComet`, `type(uint256).max` for everything) and only back into the vault for share withdrawals. | `testPauseBlocksDepositsKeepsWithdrawalsAndRecoversOnlyIntoTheVault` (both vault fork suites), `LaunchpadSuiteBaseForkTest.testAdminControlsBothVaultsTheSameWay` |
| KI-V4 | Medium | If the treasury cannot receive the asset (for example a USDC blocklist), `withdraw` reverts for any position with profit, because the fee transfer is `require`d. Not covered by a test. | none |
| KI-V5 | Low, **fee increase fixed in current launchpad vaults (Aave and Compound)** | The performance fee (cap 30%) and discount apply at withdrawal. While shares exist, the administrator may only reduce the fee; increases are permitted only after the vault is empty. | `testFeeCannotIncreaseWhileSharesExist` (both vault fork suites) |
| KI-V6 | Info | Current vault sources use a 10,000 bps discount denominator and expose `discountDenominator()`. | `testWiringMatchesTheLaunch` (both vault fork suites) |

## AtomicFlashArbitrageRouter (`0xdF77…78Fd`)

Full line-by-line self-review: `ROUTER-REVIEW.md`. Summary:

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-R1 | High (operations) | Routers deployed via `LaunchpadSuiteDeployer` revoke the deploying contract and transfer `admin` to the creator with no extra operators. | `FlashRouterBaseForkTest.testInitialisationAndKnownIssueDeployerIsOperator`, `LaunchpadSuiteBaseForkTest.testEveryContractIsWiredToTheLaunch` |
| KI-R2 | High (trust) | An operator can move any token the router holds via generic steps; only the borrowed asset is protected by the profit guard. Reproduced with real WETH and a real Aave flash loan. | `testKnownIssueOperatorCanMoveOtherTokensHeldByRouter` |
| KI-R3 | Medium | Pre-existing balances of the borrowed asset are counted as profit and paid out (reproduced with a real Aave flash loan). | `testKnownIssueExistingBalanceIsPaidOutAsProfit` |
| KI-R4 | Medium (MEV) | All swaps use `amountOutMin = 0`; protection is the final profit guard only. | `testAntiLossGuardRevertsALosingRouteAndAnUnmetTarget` |

Aave-borrowed funds cannot be taken by an operator: the callback requires principal, premium and `minNetProfit` to be covered or the transaction reverts.

## SponsoredRewardPaymaster (`0x9cD4…7CB4`)

Tested on a Base fork against the real EntryPoint v0.7 and MetaMask's 7702 DeleGator: real delegated accounts sign real user operations submitted with `handleOps` (`SponsoredRewardPaymasterTest`).

| ID | Severity | Issue | Test |
| --- | --- | --- | --- |
| KI-P1 | Medium (product) | `SIMPLE_7702_IMPLEMENTATION` (`0xe6Ca…555B`) is whitelisted, but that account implementation uses EntryPoint v0.8 while this paymaster answers only v0.7, so Simple 7702 accounts can never be sponsored. MetaMask 7702 accounts (v0.7) pass on-chain, but MetaMask refuses to sign their user operations for websites (see `docs/SWAP_ROUTING_SESSION_RECORD_2026-10-30.md`), so no browser wallet can currently complete a sponsored operation through the site. **Handled in the app:** the API refuses to sign a sponsorship whose account EntryPoint differs from the paymaster's (`accountEntryPointMismatch`), and `/paymaster` tells users sponsorship is unavailable and disables sending. | `testKnownIssueSimple7702AccountsCannotBeSponsored`, `server/src/routes/paymaster.test.ts` |

## Cross-cutting

- KI-X1 (High, trust): for admin-governed project contracts (`FeeDiscountStaking`, `YieldStakingVault`, `AtomicFlashArbitrageRouter`, `SponsoredRewardPaymaster`, `LaunchpadFees`), one EOA (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`) holds the administrator role. `MuttRewards`, `MuttIncentiveScheduler`, `MuttProStaking`, `V3PositionTimelock`, and `FixedSupplyToken` are ownerless.
- KI-X2 (Medium): `FixedSupplyToken` supply is minted once in the constructor. For `MRWD`, 60% sits in `MuttIncentiveScheduler`, 20% in locked V3 position `#6351512`, 15% in treasury `MuttVesting`, and 5% in team `MuttVesting`.
- KI-X3: pools below the $100 liquidity floor are flagged `indicative` in the market-data service and excluded from portfolio totals.
- KI-X4: contracts are non-upgradeable; `YieldStakingVault` and `CompoundYieldVault` include deposit pause and vault-only market recovery.
- KI-X5 (High, operations; history purged, key still burned): an old deployer private key (`0xc1c3…f42B`) and a throwaway test key (`0xD22a…AfD1`) were removed from scripts in `ea67044` and rewritten out of git history on 2026-10-04. Scripts read `PRIVATE_KEY` from the environment only.

## Slither (41 results)

Every result is triaged individually in `SLITHER-TRIAGE.md`.
