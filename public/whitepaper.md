# Shaggy Dogg DEX

## Technical whitepaper

**Version 1.3 · 21 October 2026**\
**Multi-chain trading, liquidity infrastructure, and the Astro Mutt ecosystem**

Project website: [dex.lumsian.com](https://dex.lumsian.com/)\
Source repository: [rickrichi/shaggy-dogg-dex](https://github.com/rickrichi/shaggy-dogg-dex)\
Implementation baseline: `b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899`\
Reward-distribution revision: `56732cfce5dbd24bfbdf0e1fde5ca1eff89997e3`; owner and exclusions: `fd24c15a9fa487852fb14a8fb16189807a5dc7e5`

### Abstract

Shaggy Dogg DEX is a wallet-connected application for trading tokens, managing decentralized liquidity, and accessing ecosystem contracts. Its trading interface compares supported on-chain routes and submits user-authorized transactions to the selected exchange router. Base is the home network for the Astro Mutt (AMUTT) ecosystem; the application also configures trading routes on Ethereum, Arbitrum, Optimism, and Polygon.

The project combines market swaps, Uniswap-compatible liquidity tools, token deployment tooling, fee-discount staking, lending-vault implementations, and operator tools for arbitrage research and execution. These components have different maturity levels and trust assumptions. A deployed token, an implemented contract, and an enabled financial product are separate milestones.

This paper describes the implementation and published deployment records available at the baseline above. It explains token mechanics, fee flows, administrative powers, and development priorities. AMUTT profit-sharing terms are approved but not yet active. Version 1.1 adds a USDC distributor contract, staking-history accounting, and a claim interface; these are implemented and tested but not deployed, funded, or enabled. The 10% staker share is reserved for stakers outside the project: project wallets, including the owner and administrator wallet, receive no staker allocation. Governance policy is advisory and does not give token holders automatic control over contracts or treasury assets.

### Reading this paper

“Implemented” means the behavior exists in the reviewed source. “Recorded deployment” means the repository identifies an address on a particular chain; it does not certify that the latest local source is deployed there. “Approved, not live” means a policy exists but its execution infrastructure is incomplete or disabled. This edition does not provide a fresh block-pinned audit of every deployment, balance, administrator, or pool.

## 1. Purpose and scope

Decentralized trading requires users to coordinate several tasks: identify the correct token, compare pools, approve a spender, execute a swap, and monitor the resulting position. Liquidity management adds another set of tasks, including choosing a pool type, depositing at the correct ratio, collecting fees, and understanding withdrawal restrictions.

Shaggy Dogg DEX brings these workflows into one application while keeping transaction settlement on the selected blockchain. The project's design objectives are explicit transaction review, traceable contract identities, reusable liquidity infrastructure, and a clear distinction between observed data and estimated outcomes.

The application does not introduce a new consensus network. It relies on existing EVM chains and liquidity protocols. Multi-chain support means that users can select supported networks and transact within each network; it does not mean a swap bridges assets between chains. A token on Base is distinct from a similarly named token elsewhere.

| Component | Scope at this edition |
| --- | --- |
| Market swaps | Implemented route quotation, approval, simulation, submission, and receipt handling |
| Liquidity tools | V2 liquidity flows and Base V3 position workflows; availability depends on pool and deployment configuration |
| AMUTT staking | Base staking address configured; contract interface exposes deposits, withdrawals, lock terms, and discount tiers |
| Aave and Compound vaults | Contract implementations and deployment records; each deployment requires its own configuration and bytecode checks |
| V3 position timelock | Source and Base deployment record available |
| Token launchpad | Deployment tooling and token templates; a generated token has its own configuration and permissions |
| Arbitrage tooling | Research, quoting, and operator execution components; neither a quote nor a displayed spread proves realized profit |
| AMUTT USDC rewards | Approved policy; distributor, accounting, and claim interface implemented and tested; not deployed, funded, or enabled |
| Governance | Advisory policy; no automatic treasury access or binding contract execution |
| Limit orders | Preview-only according to the repository's documented product scope |

## 2. System architecture

The application has four principal layers.

1. **Wallet and interface.** React, TypeScript, and Vite provide the interface. Wagmi, Viem, and RainbowKit connect compatible wallets and construct contract reads and writes. The ordinary trading flow asks the user's wallet to authorize transactions.
2. **Quotation and data.** Public RPC clients read on-chain pools and allowances. The Hono backend provides API services for market information and integrations. Prices, analytics, and external feeds inform the interface but do not replace transaction receipts as evidence of execution.
3. **Execution.** Selected exchange routers execute swaps. Position managers and liquidity contracts hold liquidity positions. Project contracts implement staking, vault accounting, and timelocks. Approval gives a specified contract spending authority; depositing into a contract changes where assets are held.
4. **Operations.** Administrators configure supported services and contract parameters where the contract permits it. Separate operator tools may use automation and execution credentials. Their permissions and custody model differ from the wallet-connected trading interface.

The basic trading flow is:

```text
Token and network selection
          |
          v
Pool quotations at an observed block --> Route and minimum-output review
                                                   |
                                                   v
                                     Wallet approval, when required
                                                   |
                                                   v
                                     Re-quote and transaction simulation
                                                   |
                                                   v
                                     Wallet signature --> Router --> Receipt
```

A frontend or API outage can prevent convenient access without changing blockchain ownership. Conversely, a compromised frontend can propose an unsafe transaction even if the destination chain works correctly. Users therefore depend on both contract behavior and the accuracy of the transaction presented by the interface. Source references: [R1], [R2].

## 3. Networks and swap routing

### 3.1 Configured route universe

| Network | Chain ID | Routes configured in the reviewed trading code |
| --- | --- | --- |
| Ethereum | 1 | Uniswap V2; direct Uniswap V3 pools |
| Base | 8453 | Uniswap V2; direct Uniswap V3 pools; Aerodrome stable and volatile routes |
| Arbitrum One | 42161 | Uniswap V2 |
| Optimism | 10 | Uniswap V2 |
| Polygon | 137 | Uniswap V2 |
| Sepolia | 11155111 | Uniswap V2 test-network configuration |

Configuration does not guarantee liquidity for every pair. RPC availability, pool reserves, token behavior, and network selection determine whether a route can be quoted and executed. Base Sepolia appears in historical ecosystem records but is not listed as a current swap chain in the reviewed configuration.

### 3.2 Candidate selection

The route engine considers a direct token pair and, where applicable, a two-hop path through the chain's wrapped native asset or USDC. V3 candidates are direct single-pool routes across configured fee tiers. On Base, Aerodrome candidates consider stable and volatile settings for each hop.

Candidate quotations are collected at a shared observed block. Failed or zero-output quotes are excluded; remaining quotes are ranked by output amount. The selected route is therefore the highest quoted output **among the candidates actually checked**. The algorithm does not search every exchange, split an order across pools, or optimize the ranking for gas-adjusted proceeds. Its V3 path generation does not implement multi-hop V3 routing. Source references: [R1], [R2].

### 3.3 Transaction protection

For quoted output `Q` and slippage tolerance `s` in basis points, the minimum acceptable output is:

```text
minimumOutput = floor(Q × (10,000 − s) / 10,000)
```

The current swap hook refreshes quotes periodically and treats quotes aged 30 seconds or more as stale. Before submission it checks the wallet and network, reads the selected route again, checks price impact, and simulates the transaction. ERC-20 approval requests use the trade amount. Higher-impact trades require a review tied to the quote being submitted. The configured deadline buffer is 15 minutes; V3 swaps use a deadline-protected router multicall.

These controls constrain execution but cannot guarantee inclusion or eliminate adverse ordering. A price move beyond the minimum can cause a revert, and a failed transaction can still consume gas. Slippage tolerance and price impact are different: tolerance bounds deterioration from a quote, while price impact describes the trade's effect relative to the market reference used by the estimator.

## 4. Liquidity and position ownership

### 4.1 V2 pools

V2-style pools represent proportional reserve ownership with fungible LP tokens. In the constant-product model, reserves approximately follow `x × y = k`, with fees changing the reserve accounting. Deposits must respect the pool's asset ratio. Removing liquidity burns the holder's LP tokens and returns the corresponding assets according to the pool's rules.

Uniswap V2 charges a 0.30% swap fee, with protocol-fee treatment determined by the underlying protocol configuration. The entire trading fee should not be described as revenue belonging to Shaggy Dogg DEX. The project's economic exposure depends on the liquidity it actually owns. See [Uniswap's fee documentation](https://developers.uniswap.org/docs/get-started/concepts/fees).

### 4.2 V3 positions

V3 liquidity positions are represented by NFTs with a token pair, fee tier, and price range. A position earns swap fees while its liquidity is active within that range. Leaving the range can stop fee accrual and leave the position concentrated in one asset. See [Uniswap's concentrated-liquidity documentation](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity).

The project's documented Base integration supports full-range minting and fee collection through the canonical position manager. Its mint flow uses atomic pool initialization where needed and minimum-consumption checks on selected deposit amounts. Removing V2 liquidity and depositing into V3 remain separate transactions, creating an interval of market exposure. The recorded compatibility work does not certify every custom contract in the repository. Source reference: [R3].

### 4.3 Sovereign V3 position timelock

The `V3PositionTimelock` contract holds a position NFT until a user-selected future timestamp. The recorded lock owner can collect amounts owed by the position manager, extend the unlock time, and withdraw the NFT after expiry. The reviewed source contains no administrator override, early principal-withdrawal function, or mechanism to shorten a lock.

The contract itself holds the NFT during the lock. Its fee-collection call sends collected assets to the lock owner and adds no project collection fee. Locking does not stabilize a token price, prevent sales of other token holdings, or lock all liquidity in a market. A public lock claim must identify the chain, timelock, position ID, owner, and unlock timestamp.

Positions should enter through `lockPosition`, which creates the ownership record. Sending an NFT directly to the contract can bypass that record and leave it without the normal withdrawal path. This restriction follows from the reviewed receiver and withdrawal logic. Source reference: [R4].

## 5. Tokens and supply mechanics

### 5.1 Astro Mutt (AMUTT)

| Property | Recorded value |
| --- | --- |
| Name / symbol | Astro Mutt / AMUTT |
| Network | Base, chain ID 8453 |
| Contract | `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7` |
| Decimals | 18 |
| Initial supply and cap | 100,000,000 AMUTT |
| Initial recipient | Constructor administrator; the supplied verification record identifies `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` |
| Configured staking contract | `0x055BB4eD8d5464C25D71391E940ce53CA30845fC` |

The `GovernanceToken` design sets `MAX_SUPPLY` equal to `initialMint` and mints that amount to the administrator at construction. Although it exposes a minter role and a `mint` function, the entire cap is consumed initially. The reviewed implementation has no burn function to reopen supply capacity and no setter to raise the cap. It has no transfer tax, rebase, blacklist, or token-holder voting implementation.

The administrator can change the administrator and minter addresses. These role changes do not expand the immutable cap. This paper does not claim that administration has been renounced.

**Initial allocation:** the constructor assigns 100% of the initial mint to its administrator. Subsequent transfers can distribute tokens or seed liquidity, but are separate from the initial allocation. The reviewed records do not establish an enforceable team vesting schedule, a current circulating-supply figure, or fixed community and treasury allocation percentages. This paper therefore does not invent an allocation chart. Explorer transfers and balances are the evidence for subsequent distribution.

The supplied AMUTT BaseScan result reports successful source verification with Solidity `0.8.36` and 200 optimizer runs. The current repository contract declares Solidity `0.8.28`; later local revisions must not be presumed byte-for-byte identical to the deployed contract. Deployment-specific verified source and creation data remain the reference for that address. Sources: [R5] and the [AMUTT contract page](https://basescan.org/address/0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7#code).

### 5.2 SD, FBA, and other listed assets

SD is a separate Base ecosystem token recorded at `0x051c758521971f5c5a84edaf18eea12854375469`. Historical deployment documentation records a supply of 1,000,000 SD and separate staking and vault addresses. Those records do not establish today's holder balances or prove that the AMUTT staking contract accepts SD.

FBA is included in the Base token registry at `0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263`, with 18 decimals. Registry inclusion alone does not establish its supply schedule, allocation, governance authority, or entitlement to project revenue. No FBA reward or governance entitlement is asserted in this paper.

AMUTT, SD, FBA, and third-party trading assets are distinct contracts. Holding one does not create ownership of the others, a claim on LP positions, or an automatic right to treasury funds. The approved reward policy specifically names eligible AMUTT stake. Sources: [R5], [R6].

## 6. Fee-discount staking

`FeeDiscountStaking` accepts its immutable configured token and records balances by account. An account's qualifying tier is returned by `getTier`. Tier thresholds, discount values, minimum stake duration, and withdrawal fees are parameters; the current deployed values must be read before depositing.

The reviewed implementation has several material properties:

- A new stake resets the account's stake timestamp, including the withdrawal clock applied to its existing balance.
- Withdrawal requires the minimum stake period to have elapsed. A withdrawal fee is not an early-exit option.
- The administrator can change the minimum period and set a withdrawal fee up to 5,000 basis points, or 50%. Those mutable values are read when withdrawing.
- A separate tier administrator can replace the tier list. The administrator can replace that role.
- Withheld withdrawal fees remain in the staking contract under the reviewed implementation; the withdrawal function does not route them to the treasury.
- The contract contains no built-in interest accrual or USDC reward claim function. Approved rewards would be paid by the separate distributor described in §8.3, using this contract's recorded stake history.

Discounts apply only where another contract explicitly reads the staking tier and uses it in fee calculation. The reviewed Aave and Compound vault implementations do so when configured with a discount-staking contract. Direct swaps through external routers do not automatically reduce an external pool's fee because the wallet holds or stakes AMUTT. Sources: [R7], [R8].

## 7. Lending vaults and fee accounting

The repository includes an Aave-oriented `YieldStakingVault` and a Compound-oriented `CompoundYieldVault`. They accept an underlying asset, track each user's internal shares and deposited principal, and can supply assets to the configured external lending market. These internal share balances should not be assumed to be transferable ERC-20 receipt tokens or a complete ERC-4626 interface.

In the current source, let `A` be assets before deposit, `S` total shares, and `d` the deposited amount. Virtual offsets are one underlying base unit and one million share units:

```text
sharesMinted = floor(d × (S + 1,000,000) / (A + 1))
grossWithdrawal = floor(sharesRedeemed × (A + 1) / (S + 1,000,000))
```

The offsets reduce the effect of first-depositor donation manipulation. Integer arithmetic introduces rounding. These are current source formulas, not a claim that older recorded deployments have received those changes.

On withdrawal, the implementation compares gross proceeds with the proportional recorded principal. It charges a performance fee only on a positive difference. The source defaults to a 10% performance fee and permits the administrator to set up to 30%. A configured staking discount reduces the fee rate:

```text
effectiveFeeBps = floor(baseFeeBps × (10,000 − discountBps) / 10,000)
performanceFee = floor(positiveYield × effectiveFeeBps / 10,000)
```

The helper clamps discounts of 10,000 basis points or more to a zero fee. For illustration, 100 units of positive yield, a 10% base fee, and a 25% discount produce a 7.5-unit fee before base-unit rounding. This is an accounting example, not a yield forecast.

Administrators can change the treasury, performance fee, and external lending configuration. Withdrawal availability depends on contract solvency and the external market's liquidity. Incorrect configuration, lending-market losses, or unsupported token behavior can impair deposits and withdrawals. Source reference: [R8].

## 8. Arbitrage and approved reward economics

### 8.1 Execution boundaries

Arbitrage tools compare execution opportunities across supported venues. A displayed spread is an estimate before all execution outcomes are known. Network gas, pool fees, flash-loan premiums, slippage, centralized-exchange fills, and settlement costs can eliminate it.

The basic `AaveFlashBorrower` source verifies its callback origin and repayment balance but contains no swap execution in the callback. Deploying that contract alone does not establish an automated trading strategy. The separate `AtomicFlashArbitrageRouter` implements authorized route execution, including generic steps and supported cyclical routes. Its operational use requires the correct deployment, operator permissions, funding for costs, and strategy validation. Source reference: [R9].

An on-chain flash-loan transaction must satisfy its repayment checks within the transaction or revert. A centralized-exchange trade cannot participate in the same atomic rollback. Cross-venue hedging therefore introduces partial-fill, custody, timing, and inventory risks. Neither flash lending nor strategy automation establishes risk-free profit.

### 8.2 Approved policy, not yet active

The machine-readable policy is `approved-not-live` with `enabled: false`. It specifies weekly settlement in native Base USDC, allocating 10% of eligible realized net arbitrage profit to eligible AMUTT stakers and 90% to treasury. This is a share of eligible profit, not a promised percentage return on deposits.

An epoch's eligible profit is calculated after recovering deployed capital, execution and funding costs, and carried losses. All amounts are integer USDC base units (six decimals):

```text
eligibleProfit = max(0, settledProceeds − deployedCapital − verifiedCosts − carriedLosses)
stakerPool = floor(10% × eligibleProfit)
treasuryShare = eligibleProfit − stakerPool
distributable = stakerPool + carriedDust
stakeWeight(account) = sum(stakedAMUTT × secondsStakedDuringEpoch)   (excluded wallets omitted)
allocation(account) = floor(distributable × stakeWeight(account) / totalStakeWeight)
```

The allocation formula requires a positive total stake weight. When no eligible stake exists, no account allocations are made and the distributable amount carries forward. Otherwise, allocations are rounded down to USDC base units and residual dust carries forward to the next week. Tokens held outside the staking contract do not qualify.

For example, proceeds of 100 USDC above recovered capital, minus 20 USDC of verified costs and 10 USDC of carried losses, produce 70 USDC eligible profit: 7 USDC for eligible stakers and 63 USDC for treasury. Zero or negative eligible profit produces no distribution and carries the loss forward.

Unresolved exchange fills, missing receipts, or missing valuations block epoch finalization. No reward APR is promised. The planned first week runs from Monday 30 November 2026, 00:00 UTC, to Monday 7 December 2026; this start is a plan, not a commitment. It becomes fixed only when the distributor is deployed, and it moves to a later Monday if the independent review or test-network rehearsal is incomplete. Source references: [R10], [R11].

### 8.3 Distribution mechanism (implemented, not deployed)

The `WeeklyUsdcDistributor` contract pays allocations; the staking contract is unchanged. Week *N* covers `[origin + (N − 1) × 7 days, origin + N × 7 days)` and can be published only after it ends, in strict sequence. Weeks without profit are published with a zero allocation so no period can be skipped or reused.

- **Publication.** The distributor owner publishes a week's Merkle root, the hash of the week's full ledger, and its total allocation. The same transaction pulls exactly that amount of USDC from the owner, so a published week is always fully funded.
- **Claims.** Each allocation is proven against the root. A proof is bound to the chain, the distributor, the week, the account, and the amount. Each account can claim a week once; anyone may submit a claim, but payment always goes to the proven account. Earlier allocations remain claimable after unstaking.
- **No discretionary withdrawal.** The contract has no clawback, expiry, pause, upgrade path, or owner withdrawal. Unclaimed USDC remains claimable indefinitely. USDC sent to the contract outside publication cannot be recovered.
- **Ownership.** Ownership transfers in two steps. The intended owner is the single-key ShaggyDogg wallet `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`, which also holds the token and staking administrator roles; its key alone would control publication. No distributor has been deployed in this edition.

Off-chain accounting reads finalized `Staked` and `Unstaked` events from the staking contract's deployment onward and replays every balance. If any replayed balance differs from the contract's `stakedBalance`, or if any RPC request fails, the week is not calculated; no substitute data is used. Each week produces a public ledger whose hash is the one committed on-chain, the claim manifest the app verifies, and unsigned transactions for the owner's wallet.

**Trust boundary:** the contract enforces funding, sequencing, and single claims, but it cannot verify that a ledger's profit is real. The owner attests to the ledger; the committed hash lets anyone confirm that the published ledger is the one the owner funded. Source reference: [R11].

### 8.4 Project wallets do not share the staker pool

The 10% staker share is reserved for stakers outside the project. Wallets controlled by the project may stake, but their stake is omitted from the weight calculation, and the full staker pool is divided among the remaining stakers. Each weekly ledger lists every excluded wallet and the stake weight it would otherwise have had.

| Excluded wallet | Role | Recorded holding |
| --- | --- | --- |
| [0x88315fb3A3dC6ce4c997caeCdc74637C72857d28](https://basescan.org/address/0x88315fb3A3dC6ce4c997caeCdc74637C72857d28) | AMUTT project wallet | 500,000 AMUTT (0.5% of supply), none staked, at Base block 52,893,733 |
| [0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98](https://basescan.org/address/0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98) | ShaggyDogg owner and administrator: intended distributor owner; AMUTT token admin and minter; staking admin and tier admin | 54,028,054 AMUTT in wallet (about 54% of supply) and 5,000 AMUTT staked, at Base block 52,895,655 |

The reason is proportion. At those blocks the staking contract held 5,000 AMUTT, all of it staked by the owner wallet. Without exclusion, the owner wallet would have received the entire staker pool, and the project wallet, had it staked its balance, about 99% of it. Per 100 USDC of eligible profit, the exclusion produces 90 USDC to treasury, 10 USDC to outside stakers, and nothing to project wallets through the staker pool. If no outside stake exists in a week, the staker pool carries forward rather than paying a project wallet.

The exclusion applies only to listed wallets. Further team, treasury, or market-making wallets are to be listed before they stake, and every list change appears in the following week's ledger. Source reference: [R11].

## 9. Governance and administrative authority

Approved governance terms use staked AMUTT at a finalized snapshot block as advisory voting power. The policy specifies seven-day votes, 5% quorum of snapshot staked supply, and an approval threshold encoded as 5,001 basis points. Votes do not execute transactions and do not grant direct treasury access.

Current contract roles continue to govern administration. An accepted advisory proposal still requires an authorized administrator to review and sign any resulting transaction. Binding governance would require a separately reviewed governor, execution timelock, and explicit transfer of administrative authority.

| Component | Authority in reviewed source |
| --- | --- |
| GovernanceToken | Administrator changes admin and minter; immutable cap remains fixed |
| FeeDiscountStaking | Admin changes duration, withdrawal fee, and roles; tier admin replaces tiers |
| Lending vaults | Admin changes treasury, fee within its cap, and lending configuration |
| Flash-loan tooling | Admin and, in the atomic router, authorized operators control execution |
| V3PositionTimelock | Recorded owner collects, extends, and withdraws after expiry; no admin override in source |
| WeeklyUsdcDistributor (not deployed) | Owner publishes funded weekly roots in sequence and transfers ownership in two steps; no withdrawal, clawback, or pause |

A contract name containing “governance,” “sovereign,” or “decentralized” does not remove these powers. This edition does not claim that existing roles are held by a multisignature or transferred to a DAO. Sources: [R4], [R7]–[R11].

## 10. Base contract inventory

All addresses below refer to **Base mainnet, chain ID 8453**. They are identified in repository configuration or deployment records; they are not a recommendation to deposit. Historical SD deployments and AMUTT deployments must be evaluated separately. Before use, compare verified bytecode and read the deployment's token, asset, role, fee, and external-market parameters.

| Contract or asset | Address | Record |
| --- | --- | --- |
| AMUTT token | [0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7](https://basescan.org/address/0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7) | AMUTT metadata and current staking configuration |
| AMUTT fee-discount staking | [0x055BB4eD8d5464C25D71391E940ce53CA30845fC](https://basescan.org/address/0x055BB4eD8d5464C25D71391E940ce53CA30845fC) | Current staking configuration |
| AMUTT yield vault | [0x16a1E9c10B913912b7B7df4649D9596D95ce33E6](https://basescan.org/address/0x16a1E9c10B913912b7B7df4649D9596D95ce33E6) | AMUTT deployment record |
| AMUTT flash borrower | [0x936a3D52c3037848879F3641dfBc9132aAe51bDF](https://basescan.org/address/0x936a3D52c3037848879F3641dfBc9132aAe51bDF) | AMUTT deployment record |
| AMUTT/WETH V2 pair | [0x581B294FeC1A4332f17cf18B49D68087c09b6784](https://basescan.org/address/0x581B294FeC1A4332f17cf18B49D68087c09b6784) | AMUTT token page and deployment record |
| SD token | [0x051c758521971f5c5a84edaf18eea12854375469](https://basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469) | Historical SD deployment |
| SD fee-discount staking | [0x42134ccc6c41149cf71c7b4994e33ee66758af20](https://basescan.org/address/0x42134ccc6c41149cf71c7b4994e33ee66758af20) | Historical SD deployment |
| SD yield vault | [0x8531807ef36560cd7db230c95db85791aa586dda](https://basescan.org/address/0x8531807ef36560cd7db230c95db85791aa586dda) | Historical SD deployment |
| Compound yield vault | [0x38cccafb4ae96a8ef187f07fb17d18eb63e43782](https://basescan.org/address/0x38cccafb4ae96a8ef187f07fb17d18eb63e43782) | Historical ecosystem deployment |
| SD flash borrower | [0xa5b50037a8d2fda22805f750252268adaeb36480](https://basescan.org/address/0xa5b50037a8d2fda22805f750252268adaeb36480) | Historical SD deployment |
| FBA token | [0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263](https://basescan.org/address/0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263) | Token registry |
| V3 position timelock | [0xb5c9bedb57f4e348e40a5e6326c90de474072e25](https://basescan.org/address/0xb5c9bedb57f4e348e40a5e6326c90de474072e25) | Deployment recorded at block 52,527,662 |
| V3 position manager used by timelock | [0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1](https://basescan.org/address/0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1) | Timelock deployment configuration |
| USDC designated for future rewards | [0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) | Approved economics policy; distributor reward asset |
| AMUTT project wallet | [0x88315fb3A3dC6ce4c997caeCdc74637C72857d28](https://basescan.org/address/0x88315fb3A3dC6ce4c997caeCdc74637C72857d28) | Excluded from staker allocations (§8.4) |
| Owner and administrator wallet | [0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98](https://basescan.org/address/0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98) | Token and staking admin; intended distributor owner; excluded from staker allocations (§8.4) |

The timelock deployment record identifies transaction [0xf9fd35c9c716e32ae22e5ed3844cd173e97faecd4e003d7a547edafd3dd7ec09](https://basescan.org/tx/0xf9fd35c9c716e32ae22e5ed3844cd173e97faecd4e003d7a547edafd3dd7ec09). An NFT lock requires a separate position-specific transaction and cannot be inferred from deployment alone. `WeeklyUsdcDistributor` has no deployment in this edition; its address will be added only after deployment and source verification. Sources: [R4]–[R7], [R10], [R11].

## 11. Security model and limitations

The system's main risk boundaries are concrete:

- **Trading and liquidity:** thin pools, adverse ordering, token restrictions, changing prices, and liquidity-provider losses can materially change outcomes.
- **Contract custody:** staking, vaults, pools, and timelocks hold assets under their own rules. Wallet custody before deposit does not mean immediate access after deposit.
- **Administration:** compromised keys or adverse parameter changes can affect withdrawal conditions, fees, and lending destinations. The staking source does not cap the minimum stake duration.
- **Dependencies:** RPC services, wallet connections, external lending markets, centralized venues, and market feeds can fail or report incomplete data.
- **Supply concentration:** constructor allocation to one administrator creates initial concentration. Subsequent distribution and lock claims require on-chain evidence.
- **Reward attestation:** distributor payouts rely on the owner's profit ledger. The contract guarantees funding and single claims, not the economic accuracy of the ledger.
- **Version mismatch:** a locally improved contract does not upgrade an older deployed instance. Changes to deployment addresses or user migrations require separate verification.

The repository contains unit, integration, and fork tests and a documented V3 compatibility review. Those records describe specific scopes and historical runs. Source publication, explorer verification, domain allowlisting, and passing tests do not constitute an independent security audit or a guarantee against loss. This whitepaper does not assert completion of an independent audit across the ecosystem.

The source repository is public, so every pinned reference in §13 can be read without an account. Report suspected vulnerabilities privately, either through the repository's [private vulnerability reporting](https://github.com/rickrichi/shaggy-dogg-dex/security/advisories/new) or by following the [security policy](https://github.com/rickrichi/shaggy-dogg-dex/security/policy); do not open a public issue first. Handling is best effort, and no bug bounty is offered. The repository runs secret scanning with push protection, which blocks commits containing recognized credentials.

Useful deployment evidence includes compiler input, creation transaction, runtime bytecode comparison, role addresses, parameter reads at a stated block, and reproducible test results. For a liquidity-lock claim, add the NFT identity and lock state. For revenue claims, add final transaction receipts, exchange fills where relevant, expenses, and reconciliation. Sources: [R3], [R4], [R10].

## 12. Development roadmap

Roadmap stages describe acceptance criteria rather than promised dates.

| Stage | Deliverable | Evidence required |
| --- | --- | --- |
| Deployment transparency | Versioned inventory for each supported token and contract | Chain, address, creation transaction, verified source, compiler settings, and block-pinned roles and parameters |
| Execution reliability | Broader route coverage and clearer cost comparison | Reproducible quote and execution checks; gas-aware comparison; chain-specific integration tests |
| Contract assurance | Review staking, vaults, timelock, reward distributor, and operator execution contracts | Independent findings, fixes, retests, and a deployment-specific release decision |
| Reward activation | Deploy and fund the implemented USDC distributor | Independent review; multi-week Base Sepolia rehearsal; verified mainnet deployment by the designated owner; first ledger reconciled from settled profit; claim confirmed from the app; explicit activation |
| Governance operations | Traceable advisory proposals and administrator responses | Snapshot rules, published votes, decisions, and resulting transaction records |
| Further decentralization | Evaluate multisignature administration and binding governance | Reviewed governance contracts, migration plan, and explicit authority transfers |

Features that depend on these stages remain conditional. In particular, a website description or configuration flag cannot add reward claims to a contract that lacks them.

## 13. Evidence and references

Repository references [R1]–[R10] are pinned to the implementation baseline; [R11] code links are pinned to the reward-distribution revision, and its configuration and runbook links to the owner-and-exclusions revision. They document code and recorded configuration; explorer links identify deployments. External protocol documentation explains mechanisms of the underlying protocols and does not endorse this project.

- **[R1] Network and venue configuration:** [contracts.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/config/contracts.ts), [chain configuration](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/config/chains/config.ts).
- **[R2] Routing and transaction workflow:** [smart-routing.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/lib/amm/smart-routing.ts), [useSwap.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/hooks/useSwap.tsx).
- **[R3] Liquidity integration evidence:** [Uniswap V3 compatibility review](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/audit/UNISWAP-V3-COMPATIBILITY.md).
- **[R4] Liquidity locking:** [V3PositionTimelock.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/V3PositionTimelock.sol), [deployment record](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/config/dex/timelock-deployment.json).
- **[R5] AMUTT token and supply:** [GovernanceToken.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/GovernanceToken.sol), [AMUTT metadata](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/public/amutt.html), [AMUTT deployment record](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/docs/AMUTT_LAUNCH/AMUTT_CONTRACT_ADDRESS.txt).
- **[R6] Other ecosystem assets:** [token registry](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/config/tokens.ts), [historical Base mainnet report](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/docs/current-session-2026-09-30-base-mainnet-live.md).
- **[R7] Staking implementation and selected deployment:** [FeeDiscountStaking.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/FeeDiscountStaking.sol), [staking configuration](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/src/lib/staking.ts).
- **[R8] Vault accounting:** [YieldStakingVault.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/YieldStakingVault.sol), [CompoundYieldVault.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/CompoundYieldVault.sol), [FeeDiscountMath.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/FeeDiscountMath.sol).
- **[R9] Flash-loan implementations:** [AaveFlashBorrower.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/AaveFlashBorrower.sol), [AtomicFlashArbitrageRouter.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/contracts/src/AtomicFlashArbitrageRouter.sol).
- **[R10] Approved economics and activation requirements:** [policy JSON](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/config/protocol-economics.json), [decision record](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/docs/protocol-economics-decision.md), [epoch calculation script](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/scripts/calculate-epoch-rewards.ts), [allocation library](https://github.com/rickrichi/shaggy-dogg-dex/blob/b8e65aba3dcd705b0fb96d8bbe7fc84e525c7899/scripts/lib/epoch-rewards.ts).
- **[R11] Reward distribution:** [WeeklyUsdcDistributor.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/56732cfce5dbd24bfbdf0e1fde5ca1eff89997e3/contracts/src/WeeklyUsdcDistributor.sol), [distributor tests](https://github.com/rickrichi/shaggy-dogg-dex/blob/56732cfce5dbd24bfbdf0e1fde5ca1eff89997e3/contracts/test/WeeklyUsdcDistributor.t.sol), [accounting](https://github.com/rickrichi/shaggy-dogg-dex/blob/56732cfce5dbd24bfbdf0e1fde5ca1eff89997e3/scripts/lib/epoch-rewards.ts), [staking history](https://github.com/rickrichi/shaggy-dogg-dex/blob/56732cfce5dbd24bfbdf0e1fde5ca1eff89997e3/scripts/lib/staking-history.ts), [claim tree](https://github.com/rickrichi/shaggy-dogg-dex/blob/56732cfce5dbd24bfbdf0e1fde5ca1eff89997e3/scripts/lib/reward-merkle.ts), [deployment and exclusion configuration](https://github.com/rickrichi/shaggy-dogg-dex/blob/fd24c15a9fa487852fb14a8fb16189807a5dc7e5/config/reward-deployment.json), [operator runbook](https://github.com/rickrichi/shaggy-dogg-dex/blob/fd24c15a9fa487852fb14a8fb16189807a5dc7e5/docs/reward-distribution-runbook.md).

### Publication record

Version 1.0 establishes the technical scope, recorded Base inventory, token mechanics, approved but inactive economics, and administrative boundaries.

Version 1.1 (21 October 2026) describes the implemented but undeployed USDC distributor, its staking-history accounting and trust boundary, and the exclusion of the AMUTT project wallet from staker allocations. The 10% staker and 90% treasury split is unchanged.

Version 1.2 (21 October 2026) names the intended distributor owner, a single-key wallet rather than the multisignature stated in 1.1, and excludes that owner and administrator wallet from staker allocations. At publication it was the only staker.

Version 1.3 (21 October 2026) states the planned first reward week, which remains conditional on review and rehearsal, notes that the source repository is public, and adds the private vulnerability-reporting channel. Reward terms, addresses, and permissions are unchanged. Future editions should identify their source revision and explain material changes to addresses, permissions, fees, and activation status. This document describes the project; it does not offer a guaranteed return or certify the safety of any asset or contract.
