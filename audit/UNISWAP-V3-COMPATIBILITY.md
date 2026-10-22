# Uniswap V3 integration audit — 2026-10-12

The implemented Base Mainnet V3 flows are compatible with the canonical interfaces in the
checks below after remediation. This is a repository integration review, not an independent
security certification or a claim that every feature is a V3 implementation. No live
transactions were signed or broadcast, and no deployed contracts or liquidity were changed.

## Scope and protocol references

Reviewed the smart swap router and quote consumer, V3 matrix quotes, liquidity migration,
position fee collection, launchpad seeding, ABIs, deployment addresses, token price encoding,
and how these connect to the custom contracts. The custom DEX remains V2. Its LP tokens
are not V3 position NFTs. Aave V3 is a separate protocol from Uniswap V3.

Canonical Base factory, SwapRouter02, QuoterV2, position manager and WETH addresses match
[Uniswap's Base deployment registry](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments).
The fork tests additionally check periphery factory/WETH getters and fee tick spacing.

Interface checks use the upstream
[SwapRouter02 V3 interface](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol),
[deadline multicall implementation](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/base/MulticallExtended.sol),
[position manager interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/INonfungiblePositionManager.sol),
[pool initializer](https://github.com/Uniswap/v3-periphery/blob/main/contracts/base/PoolInitializer.sol),
and [TickMath bounds](https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol).

## Findings and changes

Severity describes the pre-fix integration behavior, not an external auditor's rating.

| ID | Severity | Finding | Remediation |
| --- | --- | --- | --- |
| V3-01 | High | ERC-20 output swaps called `exactInputSingle` without an enforceable deadline. SwapRouter02's tuple has no deadline field. | All V3 swaps now use `multicall(deadline, calls)`; native inputs append `refundETH`, and native outputs swap to the router sentinel then unwrap to the wallet. Route/token/chain and positive minimum checks added. |
| V3-02 | High | Migration and launchpad minted with both minimum amounts set to zero. | Shared atomic initialize-and-mint builder uses a 99.5% minimum for each explicitly selected amount, rounded up to avoid a zero minimum. Simulation precedes submission. |
| V3-03 | High | Migration selected the entire wallet token balance and fell back to 0.001 WETH after withdrawal refreshed LP balances to zero. | Token and WETH deposit fields are explicit and validated. No automatic whole-wallet deposit or hard-coded WETH fallback. |
| V3-04 | Medium | Pool address existence was used to skip initialization, breaking already-created uninitialized pools. Separate initialization exposed a gap before mint. | Always include the idempotent position-manager initializer and mint in the same transaction. |
| V3-05 | Medium | Wrapping and approvals did not consistently check receipt status; launchpad swallowed seeding failure into an overall success message. | V3 receipts are checked. Seeding failure is returned separately and shown in the launch log and warning toast while preserving deployed contract results. |
| V3-06 | Medium | Canonical Base launchpad addresses could be used without an engine-level chain guard; form decimals could disagree with the 18-decimal GovernanceToken. | Require Base, bind writes to Base, reject unsupported decimals and seeding from a wallet that does not receive the supply. Migration and fee collection recheck wallet context before writes. |
| V3-07 | Low | Square root of 3 returned 2; unknown fees silently used spacing 60; 0.01% tier was missing from swaps/migration. | Correct integer square root, price/address validation, explicit supported spacing, and the 100 fee tier. |
| V3-08 | Low | Matrix quotes accepted V2-shaped output from a V3 quoter. | Require a four-element QuoterV2 tuple and decode amountOut from index 0. |
| V3-09 | Low | Position lists could retain another account's results; copy implied Universal Router and one-click migration. | Clear/guard account-scoped data, guard collection, disclose the ten-position display limit, and correct the UI description. |

The existing QuoterV2 and SwapRouter02 tuple layouts were correct. Quote calls use RPC
simulation (`eth_call`/multicall), not paid quoter transactions. Direct collection pays ERC-20
tokens, including WETH, to the owner. No protocol-level swap callback implementation is needed
in the frontend because it delegates execution to the canonical router.

Small existing TypeScript errors in market feeds, activity/portfolio code and test fixtures
were also corrected so the full frontend type check succeeds.

## Validation

- Frontend: 135 tests passed, 1 existing todo, across 29 files.
- Backend: 25 tests passed across 3 files; backend TypeScript check passed.
- Frontend and tooling TypeScript checks passed; Vite production build passed.
- Changed TypeScript files pass ESLint with zero errors; an existing accessibility warning
  remains in `BaseDex.tsx`. Diff whitespace checks passed.
- Existing contract source verification, compile, and 76 tests passed. Existing Forge lint
  warnings remain in separate custom contracts.
- Five new V3 tests passed against canonical deployed contracts on a local Base fork at
  block **52,144,242**. They exercise metadata/fee tiers, QuoterV2, native input/refund,
  native output/unwrap, deadline and minimum-output rejection, full-range NFT minting,
  an existing uninitialized pool, and fee collection after a real fork swap.
- Unit regressions cover sorted mint amounts/minimums, bounds, square-root invariants,
  calldata/deadlines/refunds, wrong-chain/route rejection, malformed quotes, launchpad
  preconditions and reverted seeding transactions.
- Repository-wide ESLint has pre-existing import-order errors in
  `scripts/add-fba-liquidity.ts` (an existing untracked user file) and
  `src/components/arbitrage/PairMatrix100.tsx`. These are outside the V3 changes.

Reproduce with `npm test -- --run`, `npm --prefix server test`, `npm run type-check`,
`npm --prefix server run typecheck`, `npm run build`, `npm run contracts:check`, and
`npm run contracts:test:v3-fork`. Fork tests use `BASE_FORK_RPC_URL` when provided and otherwise
the public Base endpoint; an unavailable endpoint fails the new tests rather than silently skipping.

## Remaining scope and operational limits

- V3 execution is Base Mainnet only. Other chains continue using their existing V2 paths.
  Executable V3 swaps use a single pool; matrix multi-hop quotes are informational and
  do not establish executable multi-hop support in the swap UI.
- Minting supports full-range positions in four standard fee tiers. Existing pool deposits
  must match the pool ratio closely enough to consume both requested minimums. This can
  reject imbalanced or very small deposits; protection is deliberately not weakened.
- The migration's V2 withdrawal, wrapping/approvals, and V3 deposit are separate wallet
  transactions. Failure after withdrawal leaves assets in the wallet; it is not a whole-flow
  atomic V3Migrator transaction. Review deposit amounts again after withdrawal.
- Position viewing/fee collection is implemented; custom ranges, position increase/decrease,
  NFT burning and pagination beyond the first ten positions are not implemented in this UI.
- Fee-on-transfer/rebasing token compatibility was not established. The project's reviewed
  GovernanceToken has neither mechanism. Do not infer compatibility for arbitrary imported tokens.
- Fork validation is pinned historical state, not proof of current liquidity or every token
  route. Browser wallet signing, current live balances, deployed frontend updates, and
  third-party aggregator responses were not end-to-end validated by this review.
- [Previously documented custom-contract risks](KNOWN-ISSUES.md), including privileged
  staking/vault controls, arbitrage operator authority and compromised-key history, remain
  separate open concerns. Several passing tests reproduce known issues; passing them does
  not resolve those issues. Immutable deployed contracts were not modified or redeployed.
