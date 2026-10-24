# Shaggy Dogg DEX

## Technical whitepaper — DRAFT

**Version 2.0 draft · 23 October 2026 · not approved, not published**\
**Multi-chain trading, liquidity infrastructure, and Mutt Rewards ($MRWD), a liquidity-rewards token**

Project website: [dex.lumsian.com](https://dex.lumsian.com/)\
Source repository: [rickrichi/shaggy-dogg-dex](https://github.com/rickrichi/shaggy-dogg-dex)\
Implementation baseline: `cfe2bb0` (shaggy-dogg-dex), `e29afd2` (shaggy-dogg-market-data)\
Superseded edition: [Version 1.3](./WHITEPAPER.md), the published edition until this draft is approved.

> **Draft status.** Parts I and II describe what is implemented and recorded at the baseline.
> Part III describes Mutt Rewards ($MRWD), a **proposed** token that does not exist yet: it has no
> contract, address, or deployment. Every Part III parameter is a modeling assumption until §17 is satisfied.
> Nothing in this draft is an offer of tokens, a promised return, or a commitment to launch.

### Abstract

Shaggy Dogg DEX is a wallet-connected application for trading tokens, managing decentralized
liquidity, and accessing ecosystem contracts. Its trading interface compares supported on-chain
routes and submits user-authorized transactions to the selected exchange router. Base is the home
network; the application also configures routes on Ethereum, Arbitrum, Optimism, and Polygon.

This edition proposes **Mutt Rewards ($MRWD)**, a token whose single purpose is to **reward liquidity provision**. Its design
objective is to establish deep, persistent, and decentralized liquidity while preserving the token's
economic integrity — not to maximize the number of rewarded wallets or advertise high yields. Part III
therefore separates three kinds of claims, because only the first can be guaranteed:

- **Cryptographically enforced:** properties the contracts make impossible to violate.
- **Economically incentivized:** outcomes the design rewards but cannot force.
- **Market-dependent:** outcomes that depend on participants the project does not control.

Astro Mutt (AMUTT), the ecosystem token of earlier editions, is discontinued and has no role in the
project (§10).

### Reading this paper

"Implemented" means the behavior exists in the reviewed source. "Recorded deployment" means the
repository identifies an address on a particular chain. "Proposed" means a design in this draft with
no implementation. "Provisional" marks a number that must be validated by the model in §16 before it
can become a deployment parameter.

---

## Part I — The trading system

## 1. Purpose and scope

Decentralized trading requires users to identify the correct token, compare pools, approve a spender,
execute a swap, and monitor the result. Shaggy Dogg DEX brings these workflows into one application
while keeping settlement on the selected blockchain. It does not introduce a consensus network or
bridge assets between chains; a token on Base is distinct from a similarly named token elsewhere.

| Component | Scope at this edition |
| --- | --- |
| Market swaps | Route quotation, approval, simulation, submission, receipt handling. Swap opens on ETH → USDC |
| Liquidity tools | V2 liquidity flows and Base V3 position workflows |
| Price service | Self-hosted exchange medians and Base on-chain pool prices; thin pools are flagged, not hidden (§4) |
| Lending vaults | Implementations and recorded deployments (§7) |
| V3 position timelock | Source and Base deployment record |
| Arbitrage tooling | Operator tool using live Base quotes; atomic flash-loan routes through a deployed router (§5) |
| Mutt Rewards (liquidity-rewards token) | **Proposed** (Part III); not implemented |
| Governance | None in this edition |
| Limit orders | Preview-only |

## 2. System architecture

The application has four layers.

1. **Wallet and interface.** React, TypeScript, and Vite; Wagmi, Viem, and RainbowKit connect wallets
   and construct reads and writes. Ordinary trading asks the user's wallet to authorize every
   transaction.
2. **Quotation and data.** Public Base RPCs read pools and allowances. A Hono API serves prices from the
   self-hosted market-data service. Displayed prices inform the interface; transaction receipts are
   the evidence of execution.
3. **Execution.** Exchange routers execute swaps; position managers and pools hold liquidity; project
   contracts implement vault accounting, timelocks, and flash-loan routing.
4. **Operations.** Administrators configure contracts where the contract permits it. Operator tools may
   hold execution credentials; their custody model differs from the wallet-connected interface.

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

A frontend or API outage can prevent convenient access without changing on-chain ownership. A
compromised frontend could propose an unsafe transaction, so users depend on both contract behavior
and the accuracy of the transaction presented. Sources: [R1], [R2].

## 3. Networks and swap routing

| Network | Chain ID | Routes configured |
| --- | --- | --- |
| Ethereum | 1 | Uniswap V2; Uniswap V3 direct and two-hop |
| Base | 8453 | Uniswap V2; Uniswap V3 direct and two-hop; Aerodrome stable and volatile routes |
| Arbitrum One | 42161 | Uniswap V2 |
| Optimism | 10 | Uniswap V2 |
| Polygon | 137 | Uniswap V2 |
| Sepolia | 11155111 | Uniswap V2 test configuration |

The swap route engine considers a direct pair and, where applicable, a two-hop path through the
chain's wrapped native asset or USDC. Its V3 candidates are direct pools across fee tiers and, for a
two-hop path, every pair of fee tiers, executed with the router's multi-hop `exactInput`. Quotes are collected at a shared block, failed or zero quotes are excluded, and the highest
output **among the candidates checked** is selected. It does not split orders or rank by gas-adjusted
proceeds.

For quoted output `Q` and slippage tolerance `s` in basis points:

```text
minimumOutput = floor(Q × (10,000 − s) / 10,000)
```

Quotes older than 30 seconds are stale. Before submission the interface re-reads the route, checks
price impact, and simulates the transaction; approvals use the trade amount; the deadline buffer is
15 minutes. These controls bound execution but cannot guarantee inclusion or prevent adverse
ordering, and a reverted transaction still consumes gas. Sources: [R1], [R2].

## 4. Price data

Prices come from the self-hosted market-data service: exchange order-book medians for listed
assets, and Base on-chain pool reserves for tokens no exchange lists. No third-party price API is
used.

- **Liquidity floor.** A pool price is treated as firm only when the pool holds at least
  `MD_MIN_POOL_LIQUIDITY_USD` (default **$100**). Below that, the price is returned only on request
  and flagged `indicative` with the pool's liquidity, because a thin pool's price is cheap to move.
  Pools under `MD_MIN_INDICATIVE_LIQUIDITY_USD` (default **$1**) receive no price at all. Indicative
  prices are never written into price history.
- **Batching.** Up to 100 Base tokens are priced in two Multicall3 reads.
- **Honest failure.** When the service cannot price anything, the API answers `503` rather than an
  empty success, and the interface reports "price data unavailable" instead of a stale or invented
  value. When the service's own feeds are still connecting after a restart, it withholds a verdict
  rather than misjudging a pool.

The service reads Uniswap V2 and Aerodrome volatile pools; it does not yet read Uniswap V3 or
Aerodrome concentrated-liquidity pools, so some assets with deep V3 liquidity appear unpriced or
indicative. Sources: [R12], [R13].

## 5. Arbitrage tooling

Arbitrage tools compare execution opportunities across venues. A displayed spread is an estimate;
gas, pool fees, flash-loan premiums, slippage, and ordering can eliminate it.

At the baseline, the browser Auto-Pilot:

- **Prices from live quotes only.** Each tick reads Uniswap V3 (all 32 fee-tier combinations of the
  WETH → USDC → DAI → WETH cycle, and each WETH/USDC tier) and Aerodrome volatile pools, plus
  Aerodrome's on-chain pool fee and Aave's on-chain flash-loan premium. If any quote fails, the tick
  is skipped and nothing is dispatched.
- **Executes exactly what it priced.** Triangular trades use SwapRouter02 `exactInput` on the quoted
  path. Flash-loan and two-sided spread routes run through the deployed `AtomicFlashArbitrageRouter`
  (`executeGenericArbitrage`) inside one Aave flash loan, so both legs complete or neither does.
- **Prices gas from the chain.** Screening uses measured gas units multiplied by the live gas price
  with a 25% buffer; before signing, the exact fee (L2 execution plus L1 data fee) must be covered by
  the quoted profit on top of the user's profit target.
- **Never accepts a loss on wallet-funded trades.** The minimum output is at least the input plus the
  profit target plus gas. Flash routes set the router's `minNetProfit` to at least target plus fee.

Every dispatch is simulated before signing. These rules make losing execution revert rather than
settle; they do not create opportunities. At the baseline no route cleared its real costs. A browser
tab is latency- and RPC-limited; a server process with private RPC access is a separate roadmap
item (§20). Sources: [R9], [R14].

---

## Part II — Liquidity, custody, and contracts

## 6. Liquidity and position ownership

**V2 pools** represent proportional reserve ownership with fungible LP tokens and approximately
follow `x × y = k`. Deposits must respect the pool ratio. **The initial deposit sets the price**: a
pool seeded with a large token amount against very little ETH values the entire supply at almost
nothing, and that price persists until someone trades against it.

**V3 positions** are NFTs with a fee tier and price range. A position earns fees only while the price
is inside its range; out of range it earns nothing and holds one asset. Because a V3 position's
contribution to market depth depends on its range, V3 liquidity is harder to verify and reward fairly
than fungible V2 liquidity (§13).

**Sovereign V3 position timelock.** `V3PositionTimelock` holds a position NFT until a chosen time. The
lock owner can collect fees, extend, and withdraw after expiry; the source has no administrator
override or early withdrawal. It locks V3 NFTs only; it cannot lock V2 LP tokens. Positions must
enter through `lockPosition`. Source: [R4].

## 7. Lending vaults and fee accounting

`YieldStakingVault` (Aave) and `CompoundYieldVault` track internal shares and principal and supply
assets to an external market. With assets `A`, shares `S`, deposit `d`, and virtual offsets:

```text
sharesMinted     = floor(d × (S + 1,000,000) / (A + 1))
grossWithdrawal  = floor(sharesRedeemed × (A + 1) / (S + 1,000,000))
effectiveFeeBps  = floor(baseFeeBps × (10,000 − discountBps) / 10,000)
performanceFee   = floor(positiveYield × effectiveFeeBps / 10,000)
```

The performance fee applies only to positive yield, defaults to 10%, and is capped at 30%. A vault
reads a discount only from the staking contract fixed in its constructor; there is no setter.
Administrators can change the treasury, fee within its cap, and lending configuration. Source: [R8].

## 8. Administrative authority

| Component | Authority in reviewed source |
| --- | --- |
| Lending vaults | Admin changes treasury, fee within cap, lending configuration |
| AtomicFlashArbitrageRouter | Admin and authorized operators execute; contract reverts below required profit |
| V3PositionTimelock | Lock owner collects, extends, withdraws after expiry; no admin override |
| Mutt Rewards (Part III) | **None by design** (§12) |

At the baseline these roles are held by the single-key wallet
`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`. This edition does not claim any role is held by a
multisignature or a DAO. Part III requires multisignature control of the treasury before launch (§15).

## 9. Security model and limitations

- **Trading and liquidity:** thin pools, adverse ordering, token restrictions, and changing prices.
- **Contract custody:** deposited assets follow each contract's rules; wallet custody before a
  deposit does not mean immediate access after it.
- **Administration:** a compromised key or adverse parameter change can affect fees, withdrawals, and
  lending destinations.
- **Dependencies:** RPCs, wallets, lending markets, and price feeds can fail or be incomplete.
- **Version mismatch:** improving local source does not upgrade a deployed contract.

The repository has unit, integration, and fork tests. Tests, verification, and published source are
not an independent audit, and this edition asserts no audit. Report vulnerabilities privately through
[private vulnerability reporting](https://github.com/rickrichi/shaggy-dogg-dex/security/advisories/new)
or the [security policy](https://github.com/rickrichi/shaggy-dogg-dex/security/policy). No bug bounty
is offered.

## 10. Discontinued: AMUTT

AMUTT (`0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7`) is discontinued. It has no role in the project's
trading features, staking, rewards, governance, or the token proposed in Part III, and there is no
conversion or transition arrangement. The AMUTT USDC staker-reward policy described in Version 1.3 is
cancelled and will not be activated. The website no longer features AMUTT.

The following contracts were tied to AMUTT. They are retired, are not part of the project's system,
and are listed only so they can be identified: AMUTT/WETH pair `0x581B294FeC1A4332f17cf18B49D68087c09b6784`,
AMUTT FeeDiscountStaking `0x055BB4eD8d5464C25D71391E940ce53CA30845fC`, and the yield vaults wired to it,
`0x16a1E9c10B913912b7B7df4649D9596D95ce33E6`, `0xc29c4b5aF82f6c1469bc47CfA167386F93514981`, and
`0x5c98F6bC9d17ba0eB02e1336bDF035938f5859e5`.

---

## Part III — Mutt Rewards, the proposed liquidity-rewards token

## 11. Purpose and design principle

Mutt Rewards' distribution purpose is to **reward people who provide liquidity to its canonical pool.**
Its demand is meant to come from use: MRWD as a **quote asset for tokens launched on the project's
launchpad** (primary), and holding or staking MRWD for **premium DEX features** (secondary), as set
out in §11.1. It is not a claim on revenue, profit, treasury assets, or governance in this edition.

The design starts from a harder question than which risk flags to avoid: **why would anyone hold or
acquire the token after incentives decline?** A rewards program can rent liquidity temporarily
without creating lasting demand. This draft does not yet answer that question; §16 requires it to be
modeled, and §17 makes a credible answer a launch condition.

**Design requirement.** Reward sustainability and durable token demand are requirements of the
design, not hoped-for outcomes. Meeting them must not rely on adding governance, transfer taxes, or
revenue sharing, and no claim is made that owning the token guarantees a return. There is a tension
to resolve openly: a token whose only described utility is rewarding liquidity providers needs a
coherent role in its incentive economy beyond its own future emissions.

### 11.1 Demand architecture (proposed)

**Primary: MRWD-quoted launches.** The launchpad gains an option to launch a token against MRWD
instead of WETH, creating a `PROJECT/MRWD` pool. A creator choosing it must hold MRWD to seed that
pool, and the MRWD then sits in the project's pool as reserves; this is the one mechanism in the
design that creates sustained net demand for MRWD. Buyers coming from WETH reach the project through
`WETH → MRWD → PROJECT`, so routed trades pass through the canonical MRWD/WETH pool and pay its
fees, but routed trading is two-sided and nets out over time.

**Secondary: utility staking.** Holding or staking MRWD unlocks premium tools — advanced Auto-Pilot
strategies, launch analytics, liquidity monitoring, alerts, and launchpad dashboards — in a contract
separate from the token. Ordinary swapping and basic features never require MRWD. Staking creates
holding demand; it does not by itself create pool volume.

**Rules.**

1. Volume targets count only genuine, transactional activity: no wash trading, self-routing, or
   incentivized circular trades. Distinct users, net fees, and repeat activity are reported.
2. MRWD routes are not forced where they are uneconomic. A two-hop route pays two pool fees and two
   price impacts and must stay competitive with WETH and USDC alternatives.
3. Launchpad volume is not counted one-for-one as MRWD/WETH volume; only the routed share is.
4. The DEX, its LPs, and MRWD holders are evaluated separately: the platform can do well while MRWD
   liquidity does not.

**What is built and what remains.** At the baseline the launchpad is open to any wallet, charges no
platform fee, and launches tokens with `FixedSupplyToken`: the whole supply is minted once in the
constructor, with no mint, owner, or admin, so launched tokens do not carry a "Mintable" flag. DEX
seeding requires at least 0.05 ETH and pairs every new token against WETH. The swap router quotes and
executes two-hop Uniswap V3 routes across fee-tier pairs, not only single pools. What remains for
MRWD-quoted launches is a MRWD pairing option in the launchpad and MRWD as a configured
intermediate hop; both wait for the token.

**Target.** The v0.3 model put the volume at which outside LPs stay without rewards at roughly
$150,000–$220,000 a month through MRWD/WETH; $220,000 a month (about $7,300 a day) is the
conservative planning target. At a 0.30% tier that is about $660 a month of gross fees before the
protocol fee, so the KPI is net fee income relative to outside LPs' capital and risk, not volume
alone. With organic MRWD trading at $32,500 a month, reaching that target needs about $375,000 a
month of launched-token trading if half of it routes through MRWD, or $750,000 at a quarter.

**What the v0.4 model found.** Allocation R3 is viable with about $9,500 of launch WETH only if the
launchpad is busy: about 15 launches a month, each trading about $40,000 in its first month, which
passes every criterion in all three organic scenarios. A steady launchpad (5 a month, about $25,000
each) passes in the base scenario but fails LP retention in the conservative one. Two launches a
month is not enough. Seed buying by creators is what supports the price in those results, so they
are only as good as the launch-count and seed-size assumptions. Those assumptions are tested before
MRWD exists (§17.1).

## 12. Token contract (technical baseline)

The token is a standard, fixed-supply ERC-20 on Base, built on OpenZeppelin Contracts 5.x and kept
deliberately simple. Complexity belongs in the separately reviewed liquidity, rewards, vesting, and
treasury contracts, not in the token.

| Parameter | Baseline | Status |
| --- | --- | --- |
| Name | **Mutt Rewards** | Chosen (24 October 2026). A USPTO knockout search the same day found no record for MUTT REWARDS, its variants, or near spellings, and a web search found no token by that name. Formal trademark screening is still required: "Rewards" is descriptive, so protection rests mainly on "Mutt", and several tokens already use "Mutt" names, including one trading on Base. The name describes how the token is distributed, not a return; it must not be marketed as one (§19) |
| Ticker | **MRWD** | Chosen (24 October 2026). A web search found no existing MRWD token. "MUTT" was avoided because at least four tokens already use it, including one on Base. Exclusivity, registry, and on-chain collision checks are still required |
| Network | Base mainnet (8453) | Decided |
| Standard and library | ERC-20, OpenZeppelin Contracts 5.x (`ERC20`, `ERC20Permit`) | Decided |
| Total supply | **1,000,000,000,000** (one trillion) MRWD | Chosen. 10³⁰ base units: within ERC-20's 256-bit balances and Uniswap V2's 112-bit reserves (max ≈ 5.19 × 10³³). Nominal supply does not set valuation (§13.3) |
| Decimals | 18 | Decided |
| Supply creation | Entire supply issued once by the constructor through the library's internal `_mint` | Decided |
| Further issuance | No externally callable path that can mint after deployment | Decided |
| Owner / admin roles | None | Decided |
| Upgradeability | None: no proxy | Decided |
| Transfer behavior | Standard ERC-20: no tax, reflection, rebase, blacklist, or pause | Decided |
| EIP-2612 Permit | **Included** | Decided |
| Holder self-burn (`ERC20Burnable`) | **Excluded** in version 1.0 | Decided |
| Voting checkpoints (`ERC20Votes`) | **Excluded** in version 1.0 | Decided |
| Verification | Verified source and reproducible build published at deployment | Required |
| Review | Independent security review before mainnet deployment | Required |

"Fixed supply" here means no tokens can be created after construction. The constructor calls the
library's internal `_mint` exactly once; the deployed contract exposes no function that reaches it.
Name and symbol are fixed at deployment and cannot be changed afterwards.

**Permit.** EIP-2612 lets a holder grant an allowance by signature instead of a separate approval
transaction. It adds no administrative authority, but it adds signature verification and
allowance-management considerations, and it does not by itself make deposits one-click: the router,
staking contract, and wallet must support it. Smart-contract wallets that cannot produce the
signature use the ordinary `approve` path, which remains fully supported.

**No burn function.** Self-burn adds nothing to the liquidity-rewards model. Any holder can already
send tokens to an irrecoverable address; total supply then stays unchanged.

**No voting checkpoints.** Governance is not a purpose of this edition, and `ERC20Votes` would add
checkpoint and delegation logic to an immutable contract. Excluding it does not rule governance out:
a later edition could introduce governance through a separate system, such as a voting wrapper or
staking-based voting, without altering this token. The token itself will never gain native
`ERC20Votes` behavior.

**Why standard transfers matter.** Fee-on-transfer and rebasing tokens are documented as
incompatible with Uniswap's newer routing and are a common risk signal; they also break the
reserve accounting that V2 pools and staking contracts rely on.

A safe token does not make the rest of the system safe. The rewards contract, vesting contracts,
treasury controls, and the liquidity lock are reviewed independently (§17, condition 4).

## 13. Liquidity architecture

### 13.1 Canonical pool and version

One canonical **MRWD/WETH Uniswap V3 pool on Base**, created through Uniswap's canonical Base V3
factory (`0x33128a8fC17869897dcE68Ed026d694621f6FDfD`) and position manager
(`0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`). A V3 pool has a single fee tier. **0.30% is the provisional
baseline**; 1.00% is adopted only if the model shows the better LP economics outweigh the volume lost
to higher trading costs. The comparison weighs trading cost, projected volume, depth, LP
profitability, adverse selection, inventory and out-of-range risk, reward dilution, and routing
competition from other Base pools. Uniswap V2 and V4 are out of scope for the
first program.

V3 liquidity is held as position NFTs, each with its own price range. A position adds depth and earns
fees only while the price is inside its range. This makes V3 more capital-efficient than V2 but means
that "liquidity" must be measured as **active, in-range liquidity**, not as deposited value (§16).
The application's existing Base V3 workflow mints full-range positions through the canonical
position manager.

### 13.2 Three kinds of liquidity

| Kind | What it is | Mechanism |
| --- | --- | --- |
| **Protocol-owned launch liquidity** | One V3 position covering **¼× to 4×** the launch price: MRWD from the 20% allocation plus funded WETH | The position NFT is locked for **24 months**, with chain, locker, position ID, and unlock date published. Preferred locker: the **UNCX Uniswap V3 locker on Base**, subject to verifying its deployment, fee option, NFT custody, fee-collection permissions, lock immutability, and withdrawal restrictions. Reviewed alternative: the project's `V3PositionTimelock` (`0xb5c9bedb57f4e348e40a5e6326c90de474072e25`, no administrator override in source) |
| **Community-provided liquidity** | V3 positions created by independent providers, in ranges they choose | Eligible for rewards when staked in the Uniswap V3 Staker (§14); **not** locked by the protocol lock |
| **Liquidity depth** | What a trader can actually execute | Measured by price impact and slippage at stated trade sizes and by in-range liquidity (§16), not by advertised TVL |

Locking the protocol's position does not lock anyone else's. Community providers can always
withdraw their own positions.

A ¼×–4× launch position gives about twice the depth of a full-range position per dollar while the
price stays inside it, so the same depth needs about half the WETH. Outside the range it adds no depth:
below ¼× of the launch price (a 75% fall) it holds only MRWD, above 4× only WETH. A locked position
cannot be repositioned to restore depth, so range-boundary stress is part of the model (§16).
Concentrated community positions add more depth near the current price but can leave their range and
stop contributing.

**Lock length and continuity policy.** The **enforced** commitment is a 24-month lock. The project's
**declared policy** is to retain or extend the launch position through the whole 36–48-month reward
program, not to withdraw it at month 24. A public relock decision is made well before month 24, at a
date fixed before launch; UNCX documents a relock function for extending V3 locks, which must be
verified. A stated intention to relock is not an enforced lock, and this paper does not claim that
liquidity is secured beyond month 24 unless an enforceable lock exists. If the model shows that
continuous locked liquidity is essential for the full program, the position is locked for 48 months
at launch instead.

### 13.3 Launch price and valuation

The launch deposit, not the supply, sets the starting price. For a symmetric range position (and for
full range), the starting
price is the ratio of the deposited amounts, so if the full 20% launch allocation (200 billion
MRWD) is paired with WETH worth `E`:

```text
launch price per MRWD      = E / 200,000,000,000
whole-supply value         = 1,000,000,000,000 × E / 200,000,000,000 = 5 × E
pool liquidity             = 2 × E
```

| WETH paired (`E`) | Pool liquidity | Price per MRWD | Whole-supply value |
| --- | --- | --- | --- |
| $500 | $1,000 | $0.0000000025 | $2,500 |
| $2,000 | $4,000 | $0.00000001 | $10,000 |
| $10,000 | $20,000 | $0.00000005 | $50,000 |

A one-trillion supply implies a very small per-token price; that is expected and says nothing about
value. Pairing fewer than 200 billion tokens raises the starting price for the same WETH. Both the WETH
amount and the number of tokens paired are outputs of the §16 model, fixed before launch (§17).

**Valuation is not depth.** Implied whole-supply value is not capital available to absorb selling. In
a constant-product (full-range) position holding $2,000 of WETH and $2,000 of MRWD, selling $200 of MRWD at the spot
price returns about $181.82 of WETH before a 0.30% swap fee and about $181.32 after it — 9.34% below
the spot value, assuming no other liquidity and no other trades. A $10,000 implied valuation therefore
does not mean the pool can absorb $10,000 of selling; that is a question of depth (§16.1), not supply.

## 14. Rewards program

### 14.1 Mechanism: the Uniswap V3 Staker

Rewards are paid through Uniswap's official **UniswapV3Staker** on Base,
`0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`. On-chain reads at this edition confirm that it is
wired to the canonical Base V3 factory and position manager above, that one incentive may last at most
**two years** (`maxIncentiveDuration` = 63,072,000 seconds), and that an incentive must start within
**30 days** of being created (`maxIncentiveStartLeadTime` = 2,592,000 seconds).

An incentive fixes a pool, a reward amount, a start and end time, and a **refundee**. A provider
deposits a position NFT into the staker and stakes it; rewards accrue in proportion to the position's
**liquidity multiplied by the seconds it is in range**, measured by the pool itself. Out-of-range
time earns nothing. Rewards are paid from the incentive's funded amount; nothing is minted. A
provider can unstake and withdraw their own position at any time and keeps rewards already accrued.

**Unstaked liquidity dilutes rewards.** The staker measures time in range with the pool's own
`secondsPerLiquidityInside`, which counts **all** in-range liquidity, staked or not:

```text
reward ≈ unclaimedRewards × (Δ secondsPerLiquidityInside × positionLiquidity) / unclaimedLiquiditySeconds
```

A position's share therefore depends on its liquidity relative to the pool's whole active liquidity.
The locked launch position cannot claim rewards, but it still takes its share of every
second. If it supplies 80% of in-range liquidity-seconds and staked community positions 20%, only about
20% of the period's budget is claimable; the rest is unclaimed and goes to the refundee at
finalization (§14.2). Excluding the project's position therefore does **not** make the whole budget
available to the community. The model must include this effect, or projected reward yields would be
overstated (§16.3).

### 14.2 Emissions

- **60% of supply is a maximum reserve, not a commitment** to distribute all of it on a fixed timetable.
  It includes the former 15% community allocation, so MRWD reaches the community only by providing
  liquidity.
- Proposed duration **36–48 months**: a uniform 36-month schedule releases about 1.67% of supply
  (16.7 billion MRWD) per month; 48 months, about 1.25% (12.5 billion). The curve, for example
  front-weighted steps, is chosen by the §16 model.
- Because one incentive lasts at most two years, the program runs as **consecutive funded periods**
  (for example two 24-month or four 12-month incentives). Each period's amount, start, and end are
  fixed and published before launch.
- **Unused rewards: irreversible dead-address allocation.** The reserve is a maximum; it need not
  all be emitted. Each incentive's refundee is `0x000000000000000000000000000000000000dEaD`, an address
  no one controls, so unclaimed rewards are permanently removed from circulation instead of returning
  to a treasury. This is **not** an ERC-20 burn: Mutt Rewards has no burn function, and the tokens remain
  counted in `totalSupply()`.
- **Finalization is a transaction, not automatic.** `endIncentive` succeeds only after the period's end
  time, when no positions remain staked and a refund is due. After the end time **anyone** may unstake
  the remaining positions, so finalization needs no owner: unstake every remaining position, then call
  `endIncentive`. Until it succeeds, the remainder stays in the staker and cannot be diverted.

### 14.3 Bounded authority and scheduling

Fixed supply alone does not guarantee that reserves cannot be redirected. Because each period must be
created no earlier than 30 days before it starts, the reserve for later periods has to be held until
then. Proposed: a small **incentive scheduler** contract, written for this program, that

- receives the full reward reserve at launch and holds it;
- encodes the complete schedule at deployment — every period's amount, start, end, the pool, and the
  burn-address refundee — and cannot change it;
- exposes one permissionless function that, inside each period's 30-day window, creates exactly that
  period's incentive on the staker and nothing else;
- has **no owner, no withdrawal function, and no way to send MRWD anywhere except into its scheduled
  incentives**.

With this, the emission schedule and the destination of unused rewards are cryptographically enforced;
no person, multisignature, or treasury can redirect the reserve. The scheduler is a new contract and
requires its own tests, rehearsal, and independent review (§17). The staker itself is Uniswap's
contract, used as deployed; its maximum duration and start window are constructor settings of that
deployment, so the scheduler reads them from the staker's getters at deployment and the schedule must
fit them.

The scheduler must also:

1. create each period permissionlessly and verify it is fully funded when created;
2. handle a **missed creation window** without owner intervention and without trapping reserve
   tokens, for example by sending that period's amount to the dead-address refundee;
3. prevent duplicate, repeated, or overlapping incentives and double funding;
4. support permissionless finalization after each period (unstake remaining positions, then
   `endIncentive`);
5. behave safely when a period was created but a later scheduled step cannot execute.

Its tests must cover missed windows, overlapping periods, exhausted incentives, unclaimed rewards,
finalization, and stranded balances, using real consecutive V3 stake transitions on a fork or test
network, not only simulated time. The scheduler is not deployed, and no reward reserve is committed
to it, until its code and economic behavior pass independent security review.

### 14.4 Farming, concentration, and Sybil resistance

The staker pays by in-range liquidity-seconds, which has consequences the design must state plainly:

- **Narrow ranges earn more per dollar.** A concentrated position near the current price has more
  liquidity per unit of capital and so earns more rewards per dollar while in range. That liquidity
  is genuinely usable by traders near the price, but it can leave its range quickly. The model must
  test whether rewards flow to depth that persists, and published TVL and reward-yield figures must
  not let narrow-range positions overstate usable depth (§16).
- **No vesting or duration weighting.** The official staker pays accrued rewards whenever claimed and
  does not weight by how long a position has been staked. Deposit–withdraw cycling is limited only by
  the gas and price risk of moving a position. Adding vesting or duration weighting would require a
  custom staking contract instead of Uniswap's, with a much larger review surface; this edition does
  not propose that.
- **Protocol liquidity is not rewarded, but it dilutes.** The protocol-owned launch position is held
  by the locker and is never staked, so it cannot earn incentives; this follows from custody. Its
  in-range liquidity still reduces what community stakers can claim (§14.1). Project-controlled wallets
  commit not to stake positions; they are listed publicly, and their staking would be visible
  on-chain. The staker cannot exclude addresses itself, so this part is a published commitment, not
  a contract rule.
- **Wallet count is not people.** Splitting a position across wallets does not change rewards, and no
  mechanism can prove that many wallets are independent. Reported metrics must say so (§16).

## 15. Allocation (provisional, design R3)

| Allocation | Share | MRWD | Conditions |
| --- | --- | --- | --- |
| LP rewards | 60% | 600,000,000,000 | Maximum reserve held by the incentive scheduler, including the former community allocation; 36–48 months of scheduled V3 Staker incentives (§14) |
| Launch liquidity | 20% | 200,000,000,000 | ¼×–4× V3 position with **funded** WETH at launch; position NFT locked 24 months |
| Treasury | 15% | 150,000,000,000 | Multisignature wallet, timelock on transfers, public periodic reporting |
| Team | 5% | 50,000,000,000 | 12-month cliff, then 36-month linear vesting in a public vesting contract |

This is a starting hypothesis, not a validated optimum. Until the reward reserve is paid out, it is
itself a concentrated balance in one contract; scanners and readers should see it labelled as such.
The team allocation uses a public vesting contract (for example OpenZeppelin `VestingWallet` with a
cliff), whose beneficiary and ownership semantics must be specified explicitly. The treasury requires
a multisignature (for example a Safe) **before launch**; today's single-key administration is not
acceptable for these funds.

## 16. Measurement and economic model

### 16.1 Metrics the project will publish

| Metric | Definition |
| --- | --- |
| Depth at 1% and 2% | USD size of a trade that moves the canonical pool's price by 1% and 2% |
| Reference slippage | Price impact for fixed trade sizes (thresholds to be set by the model) |
| LP concentration | Share of in-range liquidity held by the top 1 and top 10 position owners (protocol position shown separately) |
| In-range share | Share of staked community liquidity that is in range, sampled over time |
| Holder concentration | Top-10 holder share, excluding labelled contracts (pool, rewards, vesting, locker) |
| Retention | Share of staked community liquidity still staked after 30 and 90 days |
| Reward distribution | Rewards claimed per participant; share received by the top 10 |
| Yield composition | Trading-fee yield and subsidized token-reward yield, reported separately |
| Finalization delay | Time between each incentive's scheduled end and its `endIncentive` settlement (operational KPI) |

Numerical thresholds for these metrics are not yet set. They are outputs of the model, and they
become part of the launch criteria.

### 16.2 Required scenarios

Before deployment, three scenarios — **low, baseline, and high adoption** — must model, month by
month: reward emissions, circulating supply, depth at 1% and 2%, LP retention, treasury runway, and
the effect of declining incentives, with fee yield and subsidy yield kept separate. The model must
state the answer to §11's question for each scenario.

### 16.3 Required outputs

The model must determine:

1. the minimum WETH launch commitment, from benchmark trade sizes and a maximum permissible price
   impact;
2. the number of MRWD paired at launch, the starting price, and the implied valuation (§13.3);
3. sustainable emission schedules over 36 and 48 months under each demand and liquidity scenario,
   including reward yields, selling pressure, and remaining reserve;
4. protections against excessive reward extraction, farming, and concentration among providers;
5. the conditions under which providing liquidity stays attractive after incentives decline;
6. the effect of the locked launch position on claimable rewards (§14.1): effective community reward
   yield and the expected dead-address allocation under realistic ranges and participation;
7. **how much community liquidity participation is required for the rewards to be worthwhile**, which
   guides the launch WETH minimum and the emission design more than the nominal 60%;
8. month-24 scenarios side by side — position retained, removed, or reduced and repositioned —
   quantifying the trade-off between community reward efficiency and resilience to selling;
9. downside scenarios: declining token price, high selling pressure, limited trading, and low LP
   participation.

The model optimizes for **retained, executable liquidity per dollar of rewards**, not for the largest
share of emissions claimed, and it does not assume that distributing more rewards creates healthier
liquidity. In a simplified constant-liquidity form, effective community rewards are

```text
R_effective ≈ R_emitted × L_staked,eligible / L_total,in-range
```

but the model integrates liquidity-seconds over time as ranges enter and leave the market. It values
rewards at **realizable** prices: rewards sold into the pool move the price, so they are not worth
their spot value. For each incentive it separates the scheduled end of accrual, the amount eventually
claimed, the amount sent to the dead address, and the delay between scheduled end and final
settlement (rewards still change after the nominal end while positions stay staked).

### 16.4 Launch thresholds and budget

Objective launch thresholds — executable depth, maximum acceptable price impact for benchmark trades,
minimum external LP participation, and sustainable reward economics — are fixed **before** an ETH
budget is chosen. The model then recommends a **minimum viable** ETH commitment and a more
**conservative target**, with the starting valuation, circulating supply, and marketable float each
implies. The model is not asked to justify a predetermined budget, curve, or valuation: it may
conclude that launch needs substantially more ETH, that the reward program needs restructuring, or
that launch is not viable.

The model's assumptions, calculations, downside scenarios, and objective go/no-go thresholds are
presented and reviewed **before** any launch budget is recommended.

## 17. Launch and no-launch criteria

The token launches only when **every** condition holds. A missed condition delays launch; it is not
waived to meet a date.

1. Name (Mutt Rewards) and ticker (MRWD) formally screened for trademark, registry, and on-chain collisions (§12).
2. The §16 model is complete, and its minimum launch WETH and depth thresholds are adopted.
3. **Funded WETH for launch liquidity is held and verified on-chain**, at or above the model's minimum.
4. Token, incentive scheduler, vesting, and treasury contracts and the liquidity lock implemented,
   tested, and each independently security reviewed; the Uniswap V3 Staker's address and wiring on
   Base re-verified at deployment.
5. Full rehearsal on Base Sepolia: deploy token and scheduler, create the pool, mint and lock the
   launch position, create an incentive, stake, accrue, claim, unstake, withdraw, and end an incentive
   to the burn refundee.
6. The chosen V3 locker verified on Base for the launch position NFT (deployment, fees, permissions,
   lock and unlock behavior), with the lock transaction prepared.
7. Treasury multisignature and timelock deployed and tested (§15).
8. Legal and regulatory review complete (§19).
9. All contracts verified on the explorer at publication, with addresses added to this paper.
10. The price service reads the MRWD/WETH V3 pool, so the application can show a real MRWD price
    from launch (§4).
11. **Durable demand and reward sustainability** are documented: the model's answer to §11 is
    adopted and published, showing what supports demand for the token beyond future emissions in
    each scenario, without claiming that holding the token guarantees a return.
12. **The launchpad demand test has passed** (§17.1), and the §16 model has been rerun with the
    measured launch rate and trading per launch in place of the hypothetical ones.

### 17.1 Launchpad demand test

The deciding unknown in the v0.4 model is how many tokens are actually launched and how much they
trade. It is measured on the open launchpad, with WETH pairs, before any MRWD contract, WETH
commitment, or reward reserve exists. The thresholds below were adopted on 24 October 2026, before
any launch was counted, and are not adjusted to fit the result.

- **Window.** Three consecutive full calendar months (UTC), starting with the first full month in
  which the launchpad is publicly live **and** the launch counter's records persist across server
  restarts. Counts kept before that are best-effort and are not used for the thresholds.
- **Launch count.** Launches recorded by the server (`/api/launches/stats`). A launch is counted only
  after its deployment transaction is read from Base and its creation code matches the
  `FixedSupplyToken` template. Only **seeded** launches (at least 0.05 ETH of initial liquidity)
  count toward the thresholds.
- **Trading per launch.** First-month swap volume in each seeded launch's pool, read on-chain.
  Swaps by the creator's own wallets and circular trades are excluded where they can be identified.
  *This measurement is not built yet; it is required before the window opens.*
- **Reported alongside:** distinct creator wallets (wallets, not people), the share of seeded
  launches, and the median as well as the mean trading per launch.

| Outcome (three-month average) | Seeded launches/month | Median first-month trading per launch | Consequence |
| --- | --- | --- | --- |
| **Proceed** | 15 or more | $40,000 or more | Finish the §16 model with measured inputs; continue toward §17 |
| **Re-model** | 5 to 14 | $25,000 or more | Rerun the §16 model with measured inputs; proceed only if the conservative scenario passes every criterion |
| **Stop** | fewer than 5 | or below $25,000 | Do not launch MRWD as designed; restructure the demand architecture or end the program |

Limits of the test: WETH-paired launches show whether people launch and trade, not whether creators
would buy MRWD to seed a MRWD pair. The test is therefore an upper bound on MRWD-quoted demand, and
passing it is necessary, not sufficient. Launches made while the counter is offline can be counted
later from Base, because counting depends only on the deployment transaction.

## 18. Open decisions

1. **Formal screening** of the name Mutt Rewards and ticker MRWD (§12). Supply is set at one trillion.
2. **Allocation and emission curve** (§14, §15), after the model.
3. **Minimum launch WETH, the number of tokens paired at launch, and depth thresholds**, from the
   model (§13.3, §16).
4. **Final fee tier**, after the model's 0.30% versus 1.00% comparison (§13.1).
5. **Locker confirmation:** UNCX V3 preferred, subject to verification (§13.2).
6. **Lock length:** 24 months enforced with a declared retain-or-extend policy, or 48 months at launch
   if the model shows continuous locked liquidity is essential (§13.2).
7. **Fee discounts and governance:** not purposes of the token in this edition. Governance, if ever
   wanted, would come through a separate system (§12) described in a new edition.
8. **Persistent storage for the launch counter** (§17.1): the API runs on a free instance whose files
   are lost on every restart, so the measurement window cannot open until launch records persist.

## 19. Legal and regulatory review

Distributing transferable tokens as compensation for providing liquidity can raise regulatory issues
depending on jurisdiction, promotion, and economic arrangements. The rewards must not be marketed as
investment returns, and no APY is promised. A legal and regulatory review is a launch condition
(§17, condition 8), and the project's legal overview must be updated to cover the token before deployment.

## 20. Roadmap

| Stage | Deliverable | Evidence required |
| --- | --- | --- |
| Demand test | Open launchpad with fixed-supply tokens; verified launch counter | §17.1 thresholds published before the window; three months measured |
| Token design | Part III, approved | Open decisions resolved; model rerun with measured demand |
| Contracts | Token, rewards, vesting, treasury | Tests; independent review; Sepolia rehearsal |
| Launch | Canonical pool, lock, rewards | §17 satisfied; verified addresses published |
| Operations | Metric reporting | §16.1 metrics published on a fixed schedule |
| Execution | Server-side operator with private RPC and event subscriptions | Reproducible tests; no keys in the browser |
| Price coverage | Uniswap V3 pools in the price service (required for MRWD, §17) and Aerodrome CL | Coverage and accuracy tests |

## 21. Base contract inventory

Base mainnet (8453). These addresses are recorded, not recommendations to deposit. Retired AMUTT
contracts are listed only in §10.

| Contract or asset | Address | Note |
| --- | --- | --- |
| AtomicFlashArbitrageRouter | `0x70315019D12A11556C837970675cDC8Fa54d186b` | Admin `0x9dC0…7C98`; §5 |
| V3 position timelock | `0xb5c9bedb57f4e348e40a5e6326c90de474072e25` | §6 |
| SD token / SD staking | `0x051c758521971f5c5a84edaf18eea12854375469` / `0x42134CcC6c41149cF71C7b4994E33Ee66758aF20` | Historical SD deployment |
| SD-wired vaults | `0x38cccAFb4ae96A8ef187F07fB17D18eb63E43782`, `0x8531807Ef36560CD7Db230c95DB85791aA586Dda` | §7 |
| Owner and administrator wallet | `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` | Single key |
| Uniswap V3 factory / position manager (external) | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` / `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1` | Canonical Uniswap; §13 |
| UniswapV3Staker (external) | `0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1` | Uniswap's staker; wiring read on-chain at this edition; §14 |
| Mutt Rewards token, incentive scheduler, vesting, treasury | — | Not deployed; added only after verification |

## 22. Evidence and references

[R1]–[R4], [R8], and [R9] are as listed in [Version 1.3](./WHITEPAPER.md#13-evidence-and-references).
New references are pinned to the baseline commits.

- **[R12] Price API and client:** [prices.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/ca37838/server/src/routes/prices.ts), [marketData.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/ca37838/server/src/utils/marketData.ts).
- **[R13] Market-data service:** [market_data.py](https://github.com/rickrichi/shaggy-dogg-market-data/blob/e29afd2/app/market_data.py), [main.py](https://github.com/rickrichi/shaggy-dogg-market-data/blob/e29afd2/app/main.py).
- **[R14] Auto-Pilot quoting, routes, and gas:** [bot-market-snapshot.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/ca37838/src/lib/amm/bot-market-snapshot.ts), [flash-routes.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/ca37838/src/lib/amm/flash-routes.ts), [gas-cost.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/ca37838/src/lib/amm/gas-cost.ts).
- External: [Uniswap fees](https://developers.uniswap.org/docs/get-started/concepts/fees), [concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity).

### Publication record

Version 2.0 (draft, 23 October 2026) discontinues AMUTT and cancels its USDC staker-reward policy;
describes the live-quote Auto-Pilot, on-chain gas accounting, and the price service's liquidity floor;
and proposes Mutt Rewards, a fixed-supply liquidity-rewards token on a Uniswap V3 pool with rewards
through Uniswap's V3 Staker and an ownerless incentive scheduler — a standard OpenZeppelin ERC-20 with Permit,
without burn or voting extensions, and with no owner — with enforceable, incentivized, and
market-dependent properties stated separately, durable demand as a design requirement, explicit
launch criteria, and a launchpad demand test with thresholds fixed before it is measured. It is not published until
approved; Version 1.3 remains the published edition.

---

### Appendix A — How each launch risk is handled

| Risk | Enforced by contract | Incentivized by design | Depends on the market |
| --- | --- | --- | --- |
| Mintable supply | **Yes:** supply issued once in the constructor; no callable mint path, no owner, no upgrade path | — | — |
| Thin launch liquidity | Only that launch requires verified funded WETH (§17, condition 3) | Rewards attract deposits | Depth after launch depends on providers and traders |
| Unlocked liquidity | **Yes, for the protocol-owned launch position:** 24-month public NFT lock | — | Community positions are unlocked by design |
| LP whale concentration | Protocol position cannot earn incentives (held by locker) | Rewards attract more providers | A large or narrow-range provider can still dominate |
| Low LP holder count | — | Rewards for staked V3 positions | Wallet count ≠ independent people |
| Holder concentration | Vesting for team; controls on treasury | Emissions spread supply | Reserve remains concentrated until paid; buyers decide |
| Low holder count | — | LP rewards; launchpad and staking use | Rewarded wallets may not be genuine or lasting users |

Only the first column can be promised. The rest are targets, measured by §16.
