# Shaggy Dogg DEX

## Technical whitepaper

**Version 2.0 · 4 November 2026**\
**Multi-chain trading, liquidity infrastructure, launchpad suites, and Mutt Rewards ($MRWD)**

Project website: [dex.lumsian.com](https://dex.lumsian.com/)\
Canonical MRWD page: [dex.lumsian.com/mrwd](https://dex.lumsian.com/mrwd)\
Source repository: [rickrichi/shaggy-dogg-dex](https://github.com/rickrichi/shaggy-dogg-dex)\
Implementation baseline: `main` (`shaggy-dogg-dex`, 4 November 2026), `48c1b54` (`shaggy-dogg-market-data`)

> **Current live overview.** Shaggy Dogg DEX is live on Base mainnet (and five additional EVM networks)
> with eight-venue Base swap routing, cross-venue outlier quote filtering, user-selectable execution
> venues, a four-archetype token and DeFi suite launchpad (`LaunchpadFees` at 10 USDC and atomic
> `LaunchpadSuiteDeployer`), in-app token staking and contract administration, hardened Aave v3 and
> Compound v3 USDC vaults, sovereign Uniswap V3 position timelocks, live CeFi and DEX arbitrage
> telemetry, and **Mutt Rewards ($MRWD)** (`0xC17227AAa33C54634B6cE7AD0bf33A156563c179`, verified on
> Sourcify) with its canonical 0.30% Uniswap V3 pool, 24-month locked launch position `#6351512`,
> ownerless 16-quarter `MuttIncentiveScheduler`, 12-month cliff plus 36-month linear `MuttVesting`
> contracts for treasury and team, and ownerless `MuttProStaking` for Equilnyxs Pro access.

### Abstract

Shaggy Dogg DEX is a wallet-connected application for trading tokens, managing decentralized
liquidity, launching fixed-supply tokens and DeFi suites, and operating ecosystem contracts. Its
trading interface compares supported on-chain routes, filters unsafe outlier quotes, and submits
user-authorized transactions to the selected exchange router. Base is the home network; the
application also configures swap routes on Ethereum, Arbitrum One, Optimism, Polygon, and Sepolia.

This whitepaper documents the current live state of the application and **Mutt Rewards ($MRWD)**, an
immutable fixed-supply utility and liquidity-incentive token on Base whose core functions are
rewarding liquidity provision in its canonical Uniswap V3 pool, unlocking Equilnyxs Pro through
`MuttProStaking`, rewarding eligible sponsored operations in `SponsoredRewardPaymaster`, and serving
as a planned optional quote asset for launchpad tokens. Part III separates three kinds of claims,
because only the first can be guaranteed by code:

- **Cryptographically enforced:** properties the contracts make impossible to violate.
- **Economically incentivized:** outcomes the design rewards but cannot force.
- **Market-dependent:** outcomes that depend on participants the project does not control.

### Reading this paper

"Implemented" means the behavior exists in the reviewed source at the baseline. "Deployed" means the
contract is live on Base mainnet and verified on Sourcify, Blockscout, or pinned in repository
bytecode fixtures. "Planned" marks features that remain gated on explicit post-launch conditions
(§17–§19). Nothing in this document is investment advice, an offer of securities, or a promise of
price, yield, or financial return.

---

## Part I — The trading system

## 1. Purpose and scope

Decentralized trading requires users to identify the correct token, compare pools, approve a spender,
execute a swap, and monitor the resulting position. Shaggy Dogg DEX brings trading, liquidity
management, token deployment, staking, yield vaults, protocol operations, and arbitrage workflows
into one application while keeping settlement on the selected blockchain. It does not introduce a
consensus network or bridge assets between chains; a token on Base is distinct from a similarly named
token elsewhere.

| Component | Current live scope |
| --- | --- |
| Market swaps (`/swap`) | Defaults to `ETH → USDC`; route quotation across eight Base venues (and Uniswap on Ethereum, Arbitrum One, Optimism, Polygon, Sepolia), 35% cross-venue median outlier filtering, user venue selection, approval, simulation, submission, and receipt handling (§3) |
| Liquidity & DEX explorer (`/liquidity`, `/stake/dexes`) | Classic Uniswap V2 flows (including Ethereum V2), Base V3 position minting/collection/staking/locking, and `/stake/dexes` comparing seven active Base liquidity venues with portfolio discovery and guided pool planners (§6.1) |
| Price service & Market Data (`/market-data`, `/portfolio`) | Self-hosted exchange medians and Base Uniswap V2, Uniswap V3 (`slot0`), and Aerodrome volatile pool prices; $100 firm-liquidity floor; thin pools ($1–$100) are flagged `indicative` and excluded from portfolio totals; `/market-data` defaults to `AERO` (§4) |
| Token launchpad (`/launchpad`) | Open to any wallet on Base; 10 USDC live launch fee via `LaunchpadFees`; session-persisted wizard; four verified archetypes deployed via `FixedSupplyToken` and atomic `LaunchpadSuiteDeployer`; multi-DEX liquidity seeding; in-app holder staking and contract management (§6.2) |
| Fee-discount staking (`/stake`) | `FeeDiscountStaking` with 365-day lock cap, per-stake unlock snapshot, `accruedFees` admin withdrawal, and 10%/25%/50%/75% vault discount tiers on launchpad suites; SD staking live at `0x8a76…3faa` (§7.1) |
| Lending vaults | `YieldStakingVault` (Aave v3) and `CompoundYieldVault` (Compound v3) with immutable market and staking links, virtual-share offset (`1e6`), fee-increase guard, deposit pause, and vault-only emergency recovery (§7.2) |
| V3 position timelock | `V3PositionTimelock` deployed on Base (`0xb5c9…2e25`), holding the locked MRWD launch position `#6351512` and available to any wallet's Base V3 positions (§6.1) |
| Arbitrage tooling (`/arbitrage`, `/arbitrage/matrix`) | Public spread snapshot feed (`/api/arbitrage/snapshot`), live Base quote scanner, multi-asset triangular routing, CeFi Pair Matrix WebSocket streams (Coinbase, Kraken, Binance, Bybit, OKX), and atomic flash-loan execution via `AtomicFlashArbitrageRouter` (`0xdF77…78Fd`) (§5) |
| Mutt Rewards ($MRWD) & Protocol Hub (`/mrwd`, `/protocol`, `/stake`) | Live on Base (`0xC172…c179`): 1T fixed supply, Uniswap V3 0.30% pool, 16-quarter `MuttIncentiveScheduler`, treasury and team `MuttVesting`, `MuttProStaking`, in-app V3 reward claiming, and 56-aggregator routing audit (Part III) |
| Sponsored paymaster (`/paymaster`) | `SponsoredRewardPaymaster` (`0x9cD4…7CB4`) deployed on Base EntryPoint v0.7 (100 MRWD reward per eligible op); browser-wallet sponsorship is currently disabled and explained in the UI (§8.1) |
| Governance | None; contract roles alone govern administration where roles exist (§8.2) |
| Limit orders | Disabled preview tab (`Limit · Soon`) on `/swap` |

## 2. System architecture

The application has four principal layers.

1. **Wallet and interface.** React, TypeScript, and Vite provide the frontend; Wagmi, Viem, and
   RainbowKit connect wallets and construct contract reads and writes. Fonts (`Inter` and `JetBrains
   Mono`) are bundled locally so pages make no external font requests. Ordinary trading, liquidity,
   staking, and launchpad flows ask the user's wallet to sign every transaction.
2. **Quotation and data.** Public and configured RPC clients read on-chain pools, positions, and
   allowances. The Hono backend and Vercel routes serve market data, arbitrage spread snapshots,
   launch verification, and paymaster policy checks. Displayed prices and analytics inform the
   interface; transaction receipts are the evidence of execution.
3. **Execution.** Exchange routers execute swaps; position managers and liquidity contracts hold
   LP positions; project contracts implement fixed-supply tokens, atomic suite deployment,
   fee-discount staking, Aave and Compound vault accounting, V3 position timelocks, MRWD incentive
   scheduling, vesting, Pro staking, and flash-loan routing.
4. **Operations.** Contract administrators configure parameters only where the contract permits it.
   A dedicated GitHub Actions keeper wallet triggers permissionless `MuttIncentiveScheduler` periods,
   and operator tools run arbitrage checks. Their permissions and custody boundaries differ from the
   wallet-connected interface.

```text
Token, network, and venue selection ("Best price" or chosen DEX)
          |
          v
Pool quotations at a shared block --> Cross-venue median outlier filter (35%)
                                                   |
                                                   v
                                     Route and minimum-output review
                                                   |
                                                   v
                                     Allowance check & approvalSequence()
                                                   |
                                                   v
                                     Re-quote and transaction simulation
                                                   |
                                                   v
                                     Wallet signature --> Router --> Receipt
```

A frontend or API outage can prevent convenient access without changing on-chain ownership. A
compromised frontend could propose an unsafe transaction even when the blockchain works as intended,
so users depend on both contract behavior and the accuracy of the transaction presented for signing.
Sources: [R1], [R2].

## 3. Networks and swap routing

### 3.1 Configured route universe

`/swap` opens on `ETH → USDC` with market swap execution active and the limit tab disabled as
`Limit · Soon`.

| Network | Chain ID | Routes configured in the trading code |
| --- | --- | --- |
| Base | 8453 | Eight venues: Uniswap V3 (direct and two-hop); Uniswap V2; Aerodrome (stable and volatile); PancakeSwap V3 (direct and two-hop); SushiSwap V3 (direct and two-hop); PancakeSwap V2; SushiSwap V2; BaseSwap |
| Ethereum | 1 | Uniswap V2; Uniswap V3 direct and two-hop |
| Arbitrum One | 42161 | Uniswap V2 |
| Optimism | 10 | Uniswap V2 |
| Polygon | 137 | Uniswap V2 |
| Sepolia | 11155111 | Uniswap V2 test configuration |

On Base, the eight configured swap venues and their verified on-chain contracts are:

| Base venue | Router | Factory | Quoter / fee tiers |
| --- | --- | --- | --- |
| Uniswap V3 | `0x2626664c2603336E57B271c5C0b26F421741e481` | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | QuoterV2 `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` (0.01%, 0.05%, 0.30%, 1.00%) |
| Uniswap V2 | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` | `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6` | Router `getAmountsOut` (0.30%) |
| Aerodrome | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` | Router quotes across volatile and stable pools |
| PancakeSwap V3 | `0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86` | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | Quoter `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` (0.01%, 0.05%, 0.25%, 1.00%; two-hop: 0.05%, 0.25%) |
| SushiSwap V3 | `0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f` | `0xc35DADB65012eC5796536bD9864eD8773aBc74C4` | Quoter `0xb1E835Dc2785b52265711e17fCCb0fd018226a6e` (0.01%, 0.05%, 0.30%, 1.00%; two-hop: 0.05%, 0.30%) |
| PancakeSwap V2 | `0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb` | `0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E` | Router `getAmountsOut` (0.25%) |
| SushiSwap V2 | `0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891` | `0x71524B4f93c58fcbF659783284E38825f0622859` | Router `getAmountsOut` (0.30%) |
| BaseSwap | `0x327Df1E6de05895d2ab08513aaDD9313Fe505d86` | `0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB` | Router `getAmountsOut` (0.25%) |

### 3.2 Candidate selection, outlier filtering, and venue choice

The route engine considers a direct pair and, where applicable, a two-hop path through the chain's
wrapped native asset (`WETH`) or `USDC`. V3 candidates are direct pools across configured fee tiers
and, for a two-hop path, fee-tier pairs executed with the router's multi-hop `exactInput` (with
SushiSwap V3 using its original SwapRouter deadline-in-struct and `address(0)` recipient convention
before `unwrapWETH9`). Quotes are collected at a shared block, failed or zero quotes are excluded,
and each venue's price impact is measured against that venue's own factory and pools.

**Cross-venue outlier quote filter (`admitVenueQuotes`).** An initialized V3 pool with negligible
liquidity at an off-market tick can return a numerically valid quote without reverting. When at least
**three** independent venues return positive quotes for a trade, the router computes the cross-venue
median of each venue's best output and excludes any venue whose best quote deviates from that median
by more than **35% (`MAX_QUOTE_DEVIATION_BPS = 3,500`)** before selecting or displaying routes.

By default (**Best price (automatic)**), the highest quoted output among admitted candidates is
selected. Users can also select a specific venue from the **Route** selector or the **Quotes for your
trade** cards:

- A user-selected venue drives the quote, price impact, router approval, and swap call (`Swap on <venue>`).
- The interface shows how a chosen venue compares with the best quote and highlights choices that are
   1% or worse below the best quote.
- If a chosen venue has no route after a pair or amount change, the swap is blocked and **Switch to
  best price** is offered; the application never silently reroutes a user-chosen venue.

The router does not split orders across pools or rank by gas-adjusted proceeds.

### 3.3 Transaction protection and non-standard approvals

For quoted output `Q` and slippage tolerance `s` in basis points:

```text
minimumOutput = floor(Q × (10,000 − s) / 10,000)
```

Quotes older than 30 seconds are treated as stale. Before submission the interface re-reads the
route, checks price impact, and simulates the transaction; approvals use the exact trade or deposit
amount; the deadline buffer is 15 minutes.

Some tokens (such as USDT on Ethereum) revert when `approve` changes an existing non-zero allowance
to another non-zero value. When a wallet already has a non-zero allowance smaller than the required
amount, `approvalSequence()` simulates the direct `approve(spender, needed)` call first and, only if
the token rejects it, prepends `approve(spender, 0)` before setting the new allowance. Standard
ERC-20 tokens still require only a single approval. Sources: [R1], [R2].

## 4. Price data and Market Data

Prices come from the self-hosted market-data service: exchange order-book medians for listed assets,
and Base on-chain pool reserves for tokens no exchange lists. No third-party price API is used.
`/market-data` opens on `AERO` by default.

- **On-chain venues read.** The service reads Base Uniswap V2 pairs, Uniswap V3 pools (0.05%, 0.30%,
  and 1.00% tiers, priced from `slot0` and valued for liquidity depth at twice the pool's WETH or
  USDC reserve), and Aerodrome volatile pools. It does not read Aerodrome concentrated-liquidity
  (Slipstream) pools.
- **Liquidity floor.** A pool price is treated as firm only when the pool holds at least
  `MD_MIN_POOL_LIQUIDITY_USD` (default **$100**). Below that floor (down to
  `MD_MIN_INDICATIVE_LIQUIDITY_USD`, default **$1**), the price is returned only when requested with
  `allowThin=true` and is flagged `indicative` alongside the pool's USD liquidity, because a thin
  pool's price is cheap to move. Indicative prices are never written into price history.
- **Portfolio accounting.** Held tokens whose pools sit below the $100 floor (such as SD and FBA at
  current pool sizes) display their `indicative` price and pool depth on `/portfolio` and
  `/market-data` with sub-cent significant digits preserved, but indicative prices are excluded from
  the portfolio total, 24-hour change, and largest-holding summary. Following the November 2026
  liquidity additions (§13.2–§13.3), the canonical MRWD/WETH 0.30% V3 pool holds `0.0463 WETH`
  (`~$107.27` single-sided WETH, `~$214.54` total pool depth at `2 × WETH`), clearing the $100
  firm-liquidity floor.
- **Honest failure.** When the service cannot price an asset, the API returns `503` rather than a
  fabricated or stale value, and the interface reports that price data is unavailable. Sources:
  [R10], [R11].

## 5. Arbitrage tooling

Arbitrage tools compare execution opportunities across decentralized and centralized venues. A
displayed spread is an estimate; gas, pool fees, flash-loan premiums, slippage, and transaction
ordering can eliminate it.

- **Public spread snapshot (`/arbitrage`).** On the public website, `/arbitrage` polls
  `/api/arbitrage/snapshot` from the self-hosted market-data spread feed to display live cross-venue
  opportunities without requiring a local bot process; when a local bot engine is explicitly
  configured via `VITE_BOT_API_URL`, operator controls connect to that engine.
- **CeFi Pair Matrix (`/arbitrage/matrix`).** Connects directly from the browser to live WebSocket
  order-book and ticker streams from Coinbase, Kraken, Binance (`wss://data-stream.binance.vision`),
  Bybit (`wss://stream.bybit.com`), and OKX (`wss://ws.okx.com:8443`) to compare centralized spreads
  against Base DEX quotes.
- **Browser Auto-Pilot.** Each tick reads live quotes from Base Uniswap V3 and Aerodrome pools,
  scans multiple candidate intermediate assets (including `USDC` and `cbBTC`) for triangular routes,
  and reads Aerodrome's on-chain pool fee and Aave's on-chain flash-loan premium. If any leg fails to
  quote, the tick is skipped.
- **Execution and profit guard.** Wallet-funded triangular trades execute via SwapRouter02
  `exactInput` on the quoted path. Flash-loan routes execute through the pinned
  `AtomicFlashArbitrageRouter` (`0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd`, `executeGenericArbitrage`)
  inside a single Aave V3 flash loan so every leg settles atomically or the transaction reverts.
  Screening and pre-signature checks price L2 execution gas plus the L1 data fee and require quoted
  net profit to cover both gas and the user's profit target.

Every dispatch is simulated before signing. These controls make losing on-chain execution revert
rather than settle; they do not guarantee profitable opportunities. Sources: [R9], [R12].

---

## Part II — Liquidity, launchpad, custody, and contracts

## 6. Liquidity, position ownership, and launchpad

### 6.1 V2 pools, V3 positions, and DEX liquidity explorer

**V2 pools** represent proportional reserve ownership with fungible LP tokens (`x × y = k`). Deposits
must respect the pool ratio, and **the initial deposit sets the starting price**. When no wallet is
connected, `/liquidity` defaults to Base (`8453`); on Ethereum (`1`), `/liquidity` opens directly on
classic Uniswap V2 while Base-only V2→V3 migration, V3 position manager, and V3 timelock tools offer
a one-click switch to Base.

**V3 positions** are NFTs with a fee tier and price range. A position adds depth and earns fees only
while the market price stays inside its range. On Base, `/liquidity` discovers every V3 position a
wallet holds, stakes in `UniswapV3Staker`, or locks in `V3PositionTimelock`.

**DEX liquidity explorer (`/stake/dexes`).** Compares **seven active Base liquidity venues** (Uniswap
V3, Uniswap V2, Aerodrome, PancakeSwap V3, SushiSwap V3, PancakeSwap V2, and SushiSwap V2; BaseSwap
is used for swap routing in §3.1 but omitted from the liquidity directory because its web frontend is
parked), discovers held and staked tokens across ecosystem contracts (even when wallet balance is zero
because the balance is staked), and provides guided in-app pool planners (`POOL_PLANNERS`) and
pair-specific deposit links.

**Sovereign V3 position timelock.** `V3PositionTimelock`
(`0xb5c9bedb57f4e348e40a5e6326c90de474072e25`) holds a V3 position NFT until a user-chosen unlock
timestamp. The recorded lock owner can collect fees (`collectFees`), extend the lock
(`extendLock`), and withdraw the NFT after expiry (`withdraw`). The contract has no administrator
override and no early withdrawal path. Positions must enter through `lockPosition`. Sources: [R3],
[R4].

### 6.2 Token launchpad and atomic suite deployment

The launchpad (`/launchpad`) is open to any wallet on Base mainnet. Wizard steps
(`/launchpad/identity`, `/launchpad/purpose`, `/launchpad/liquidity`, `/launchpad/review`) redirect
incomplete token identities back to Step 1 while persisting drafts across reloads in `sessionStorage`.
Four verified archetypes are offered:

| Archetype card | Contracts deployed | Risk model |
| --- | --- | --- |
| **Standard Fixed-Supply ERC-20** | `FixedSupplyToken.sol` | None (no admin or extra protocol contracts) |
| **Staking & Loyalty Ecosystem** | `FixedSupplyToken.sol` + `FeeDiscountStaking.sol` | Sovereign (creator admin controls tiers, future lock up to 365 days, and unstake fee up to 50%) |
| **Aave v3 CeDeFi Vault** | `FixedSupplyToken.sol` + `FeeDiscountStaking.sol` + `YieldStakingVault.sol` | Pooled + Sovereign (pooled Aave v3 USDC vault; creator admin controls treasury, pause, and fee reductions) |
| **Full Sovereign Protocol Suite** | `FixedSupplyToken.sol` + `FeeDiscountStaking.sol` + `YieldStakingVault.sol` + `CompoundYieldVault.sol` + `AtomicFlashArbitrageRouter.sol` | Pooled + Sovereign (separate Aave v3 and Compound v3 USDC vaults + operator-restricted flash router) |

Key launchpad mechanics enforced in source:

- **Fixed-supply token (`FixedSupplyToken.sol`).** Mints 100% of supply once in the constructor to
  the recipient wallet, with 18 decimals and no mint, owner, admin, pause, fee, or blacklist. Its
  `_transfer` function reverts on `to == address(this)` (`"Transfer to token contract"`) so tokens
  cannot be accidentally stranded in the ownerless token contract. The server's launch verifier
  matches both approved `FixedSupplyToken` creation builds (`0x692f…9343` and `0x79c0…1662`).
- **On-chain launch fee (`LaunchpadFees`).** Before deploying any contract, the launchpad reads live
  `feeAmount()` from `0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b` (**10 USDC**, `10_000_000` base
  units) and verifies the connected wallet holds enough USDC. After the token deploys, the user
  approves and calls `payLaunchFee(tokenAddress)`.
- **Atomic suite deployment (`LaunchpadSuiteDeployer.sol`).** For the Staking, Aave Vault, and Full
  Suite cards, a single `LaunchpadSuiteDeployer` transaction deploys and configures
  `FeeDiscountStaking` (lock, unstake fee, and four discount tiers) and any selected vaults and
  router, verifies that USDC (`0x8335…2913`), Aave v3 Pool (`0xA238…d1c5`), aUSDC (`0x4e65…c0AB`),
  and Compound v3 USDC Comet (`0xb125…Eb2F`) match their canonical Base addresses, revokes its own
  temporary operator/admin privileges, and transfers every admin and tierAdmin role to the creator
  before returning. A launch can never end half-configured.
- **Multi-DEX liquidity seeding.** Optional initial liquidity seeding (minimum **0.05 ETH**) supports
  Base Uniswap V3 (1.00% tier, full-range position), Uniswap V2, PancakeSwap V2, and Aerodrome
  volatile pools (`stable = false`).
- **In-app staking and contract management.** Token holders can stake and unstake launched tokens on
  `/stake` (including via shareable `/stake?contract=0x...` links, Explore Launches, and My Tokens);
  `LaunchStakingPanel` verifies that the contract's runtime bytecode matches the pinned
  `FeeDiscountStaking` build byte-for-byte (outside its immutable token slot) before acting. Creators
  can withdraw accrued staking fees, pause/resume or recover vaults, and manage flash routers from
  `/launchpad/my-tokens`, or load any approved contract on **Load my contract** (which checks
  approved runtime bytecode hashes in `contract-versions.json` before checking `admin`). Sources:
  [R2], [R6], [R7], [R13].

## 7. Fee-discount staking and lending vaults

### 7.1 Fee-discount staking (`FeeDiscountStaking.sol`)

`FeeDiscountStaking` accepts its immutable configured token and records balances by account. Its
implementation enforces the following rules:

- **Capped lock and per-stake unlock snapshot.** `setMinimumStakePeriod` is hard-capped at
  `MAXIMUM_STAKE_PERIOD = 365 days`. When a user stakes, `unlockTimestamp[msg.sender] =
  block.timestamp + minimumStakePeriod` snapshots the unlock time for that position, so a later admin
  increase to `minimumStakePeriod` affects future stakes only and cannot extend existing locks.
  Adding stake to an existing position resets the lock for the user's whole staked balance.
- **Unstake fee and isolated fee accounting.** `setWithdrawalFee` is capped at 5,000 bps (50%) and
  applies at withdrawal. Withheld unstake fees accumulate in `accruedFees`, and `withdrawFees(to,
  amount)` allows the administrator to withdraw at most `accruedFees`, keeping staked principal
  unreachable by the administrator.
- **Vault discount tiers.** Launchpad suites configure four ascending tiers based on supply share:
  staking **0.01%, 0.1%, 1%, and 10% of total supply** grants **10%, 25%, 50%, and 75% discounts**
  (1,000 / 2,500 / 5,000 / 7,500 bps) on linked vault performance fees. Staking alone pays no yield.

For the SD token (`0x051c758521971f5c5a84edaf18eea12854375469`), the active Base `FeeDiscountStaking`
contract is `0x8a765d450d38d13f5e2533d29399f743cdf23faa`. Sources: [R6], [R13].

### 7.2 Lending vaults (`YieldStakingVault.sol` and `CompoundYieldVault.sol`)

`YieldStakingVault` (Aave v3) and `CompoundYieldVault` (Compound v3 Comet) accept USDC on Base,
track internal shares and principal per depositor, and supply deposits to their lending market. With
assets `A` before deposit, total shares `S`, deposit `d`, and virtual offsets (`VIRTUAL_SHARES =
1,000,000`, `VIRTUAL_ASSETS = 1`):

```text
sharesMinted     = floor(d × (S + 1,000,000) / (A + 1))
grossWithdrawal  = floor(sharesRedeemed × (A + 1) / (S + 1,000,000))
effectiveFeeBps  = floor(baseFeeBps × (10,000 − discountBps) / 10,000)
performanceFee   = floor(positiveYield × effectiveFeeBps / 10,000)
```

Both vault contracts enforce identical trust boundaries:

- **Immutable market and staking wiring.** `underlyingAsset`, `discountStaking`, and the lending
  market addresses (`aavePool` and `aToken` in `YieldStakingVault`; `comet` in `CompoundYieldVault`)
  are `immutable`. Neither vault has a market-repointing setter, so an administrator cannot redirect
  deposited funds to a fake market.
- **No fee increase while shares exist.** `performanceFeeBps` defaults to 10% (1,000 bps) and is
  capped at 30% (3,000 bps). `setPerformanceFee` requires `totalShares == 0 || newFeeBps <=
  performanceFeeBps`, so the administrator can lower the fee at any time but cannot raise it while
  any depositor holds shares.
- **Pause and vault-only emergency recovery.** `setPaused(true)` blocks new `deposit` calls while
  leaving `withdraw` open. While paused, `emergencyWithdrawFromAave` /
  `emergencyWithdrawFromComet` pulls funds from the immutable lending market **only back into the
  vault contract (`address(this)`)** so depositors can withdraw their shares; the administrator
  cannot withdraw depositor principal. Source: [R7].

## 8. Sponsored Reward Paymaster and administrative authority

### 8.1 Sponsored Reward Paymaster (`SponsoredRewardPaymaster.sol`)

`SponsoredRewardPaymaster` is deployed on Base mainnet at
[`0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`](https://basescan.org/address/0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4)
on ERC-4337 **EntryPoint v0.7** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`). It sponsors gas in
ETH from its EntryPoint deposit for eligible Base ERC-20 transfers, swaps (on allowlisted Uniswap V3,
Uniswap V2, and Aerodrome routers), and staking calls (`MuttProStaking` and launchpad
`FeeDiscountStaking`), and pays **100 MRWD** to the user inside `_postOp` when
`mode == PostOpMode.opSucceeded`. Each sponsorship is capped at 0.0001 ETH of gas with a 24-hour
per-wallet cooldown.

**Current browser-wallet status: gas-free operations are disabled in the UI.** While the contract
path is verified on a Base fork with real EIP-7702 delegated accounts and EntryPoint v0.7
(`SponsoredRewardPaymaster.t.sol`), current browser wallets cannot submit compatible signatures:

1. **MetaMask EIP-7702 Smart Account (`0x63c0…E32B`, EntryPoint v0.7):** MetaMask refuses website
   EIP-712 UserOperation signature requests whose `verifyingContract` is the internal account itself.
2. **Plain browser (JSON-RPC) wallets:** cannot sign an EIP-7702 authorization for a website.
3. **Simple 7702 accounts (`0xe6Ca…555B`, EntryPoint v0.8):** use EntryPoint v0.8, whereas the
   reward paymaster answers only EntryPoint v0.7; the API refuses to sign mismatched EntryPoint
   requests.

Accordingly, `/paymaster` explains why sponsorship is unavailable for the connected wallet and
disables the sponsored send button until wallet-native ERC-7677 `wallet_sendCalls` support is
available. Source: [R14].

### 8.2 Administrative authority

The system has no DAO or token governance; contract roles alone govern administration where roles
exist:

| Component | Authority in reviewed source |
| --- | --- |
| `FixedSupplyToken` (launchpad tokens) | **None:** no owner, admin, or mint function; transfers to `address(this)` revert |
| `MuttRewards` (MRWD), `MuttIncentiveScheduler`, `MuttProStaking` | **None:** ownerless, non-upgradeable, no pause or admin withdrawal (§11.1, §12, §14.3) |
| `MuttVesting` (treasury and team) | **None over schedule:** fixed beneficiary, 12-month cliff, 36-month linear release; ownership cannot be transferred or renounced (§15) |
| `V3PositionTimelock` | Recorded lock owner collects fees, extends lock, and withdraws NFT after expiry; no admin override |
| `FeeDiscountStaking` | Admin changes future lock (≤ 365 days), unstake fee (≤ 50%), roles, and withdraws `accruedFees` only; tier admin updates tiers |
| `YieldStakingVault` / `CompoundYieldVault` | Admin changes treasury, pauses deposits, recovers market funds into the paused vault only, and lowers fee (or raises only when `totalShares == 0`); market and staking links are immutable |
| `AtomicFlashArbitrageRouter` | Admin and approved operators execute flash routes; callback reverts below required repayment and `minNetProfit` |
| `SponsoredRewardPaymaster` | Owner configures signer, reward amount, cooldown, gas cap, allowlists, and withdraws ETH/MRWD reserves |
| `LaunchpadFees` | Owner updates `feeAmount` and `treasury` |

For project-deployed contracts that have an administrator role, that role is held by the single-key
wallet `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`. For launchpad suites deployed by users,
`LaunchpadSuiteDeployer` transfers all administrator roles to the creator's recipient wallet.

## 9. Security model and limitations

- **Trading and liquidity:** thin pools, adverse ordering, token restrictions, and changing prices
  can materially affect execution outcomes.
- **Contract custody:** deposited or staked assets follow each contract's rules; wallet custody
  before a deposit does not mean immediate withdrawal after it.
- **Administration:** for contracts with admin roles, a compromised admin key or adverse parameter
  change (such as raising `withdrawalFeeBps` up to 50% in `FeeDiscountStaking`) can affect users.
- **Dependencies:** RPC providers, wallet extensions, external lending markets (Aave v3, Compound
  v3), centralized exchange WebSockets, and the market-data service can fail or lag.
- **Bytecode verification:** the application's contract loader checks runtime bytecode hashes
  (`contract-versions.json`) before interacting with user-supplied staking, vault, or router
  contracts and refuses unapproved contracts.

The repository includes unit tests and Base-fork test suites (`YieldVaultBaseFork.t.sol`,
`CompoundVaultBaseFork.t.sol`, `LaunchpadSuiteBaseFork.t.sol`, `FlashRouterBaseFork.t.sol`,
`MuttIncentiveScheduler.t.sol`, `SponsoredRewardPaymaster.t.sol`, and `V3PositionTimelock.t.sol`)
that run against real Base USDC, Aave v3, Compound v3, Uniswap V2/V3, Aerodrome, UniswapV3Staker,
and EntryPoint v0.7, alongside a self-assessment in `audit/KNOWN-ISSUES.md`. Passing tests and
Sourcify/Blockscout verification do not constitute an independent security audit, and this paper
asserts no completed external audit. Report vulnerabilities privately via
[private vulnerability reporting](https://github.com/rickrichi/shaggy-dogg-dex/security/advisories/new)
or the [security policy](https://github.com/rickrichi/shaggy-dogg-dex/security/policy). No bug bounty
is offered.

## 10. Active ecosystem tokens

In addition to **Mutt Rewards ($MRWD)** (Part III), the Base token registry and portfolio views
include three project-associated tokens:

- **SD (`0x051c758521971f5c5a84edaf18eea12854375469`):** Base ecosystem token with 1,000,000 fixed
  supply and active `FeeDiscountStaking` at `0x8a765d450d38d13f5e2533d29399f743cdf23faa`.
- **FBA (`0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263`):** Base ERC-20 token included in the token
  registry and portfolio views; no reward or governance entitlement is attached to it.
- **EQX (`0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C`):** Equilnyxs shares on Base. Only wallets
  verified in its on-chain `IdentityRegistry` can hold or receive EQX, and it has no DEX pool. It is
  shown in `/portfolio`, `/launchpad/my-tokens`, and the beneficiary vesting view, and is
  intentionally excluded from `/swap` and pool planners. Source: [R5].

---

## Part III — Mutt Rewards ($MRWD), the liquidity-rewards and utility token

## 11. Purpose and design principle

**Mutt Rewards ($MRWD)** (`0xC17227AAa33C54634B6cE7AD0bf33A156563c179` on Base mainnet, canonical
page [dex.lumsian.com/mrwd](https://dex.lumsian.com/mrwd)) is a utility and liquidity-incentive
token. It is not a meme token, and it is not a claim on project revenue, profit, treasury assets, or
governance. Public listings and search profiles must use only its canonical Base address above.

MRWD has four documented functions in the ecosystem:

1. **Liquidity-provider rewards (live):** rewarding eligible liquidity providers who stake in-range
   positions from the canonical MRWD/WETH 0.30% Uniswap V3 pool in `UniswapV3Staker` (§14).
2. **Equilnyxs Pro access (live):** locking 1 billion MRWD in `MuttProStaking` to unlock Equilnyxs
   Pro without paying a subscription fee (§11.1).
3. **Sponsored-operation rewards (deployed on-chain):** paying 100 MRWD per eligible sponsored
   operation in `SponsoredRewardPaymaster` (§8.1).
4. **Launchpad quote asset (planned):** serving as an optional quote asset for tokens launched on the
   launchpad once the launchpad demand test (§17.2) is evaluated.

The design starts from a fundamental economic question: **why would anyone hold or acquire the token
after liquidity incentives decline?** A rewards program can rent liquidity temporarily without
creating lasting demand. Reward sustainability and durable demand are therefore treated as explicit
design requirements (§16–§17), without adding transfer taxes, governance promises, or revenue
sharing.

### 11.1 Demand architecture and Equilnyxs Pro staking

**Primary (planned): MRWD-quoted launches.** The launchpad is designed to gain an option to pair a
new token against MRWD (`PROJECT/MRWD`), requiring creators who choose it to hold MRWD to seed the
pool and routing `WETH → MRWD → PROJECT` trades through the canonical MRWD/WETH pool. Before enabling
MRWD-quoted launches, actual launchpad activity is measured on WETH-paired launches during the
three-month demand test window (§17.2).

**Secondary (live): utility staking for Equilnyxs Pro.** Equilnyxs, the project's language and
toolchain for strategy code and Base DEX execution, sells Pro passes ($12 for 30 days, $99 for a
year in USDC on Base). Staking MRWD is a live second path to Pro: keeping **1,000,000,000 (1 billion)
MRWD** locked in `MuttProStaking` unlocks a free Equilnyxs Pro key at
`https://www.lumsian.com/pro/stake.php`, with staking managed on `https://dex.lumsian.com/stake`.

- **Staking contract (`MuttProStaking`, `0x67dBC193bF510225EBf189ab25dC3b34a32c1766`).** Separate
  from the token, non-upgradeable, and verified on Sourcify (`exact_match`), with **no owner and no
  pause**: each deposit has a fixed 30-day lock (`lockSeconds = 2,592,000`), there is no exit fee,
  matured deposits can always be withdrawn (`withdrawMatured`), and no function can move staked MRWD
  except back to its depositor. A wallet holds at most 32 open deposits. It records stakes only and
  pays **no yield**.
- **License issuance.** The holder signs a message with the staking wallet. The store recovers the
  signer, reads the wallet's locked deposits, checks `lockedUntil(wallet, T)` against the 1 billion
  MRWD threshold, and issues an `EQX1` Pro license valid until the day before the stake unlocks. A
  license therefore never outlives the stake behind it. Calling `relockAll` relocks all open deposits
  for a full 30-day period from `block.timestamp`.
- **Free features stay free.** The Equilnyxs compiler, checker, REPL, dry runs, and test-network
  trading never require MRWD, and USDC passes remain available.

**Target and model findings.** The economic model (`scripts/mchow-model/`) puts the volume at which
outside LPs stay without rewards at roughly $150,000–$220,000 per month through MRWD/WETH
($220,000/month conservative target, or ~$660/month in gross fees at 0.30%). The deployed 60/20/15/5
allocation passes every model criterion across all three organic scenarios at ~15 seeded launches per
month ($40,000 first-month volume each), passes the base scenario at 5 launches per month ($25,000
each), and fails below 5 launches per month (§17.2). Sources: [R15], [R16].

## 12. Token contract (MuttRewards.sol)

`MuttRewards` is a standard, fixed-supply ERC-20 on Base built on OpenZeppelin Contracts 5.x (`ERC20`
and `ERC20Permit`) and verified on Sourcify as an exact bytecode match.

| Parameter | Value on Base mainnet | Status |
| --- | --- | --- |
| Name | **Mutt Rewards** | Deployed 25 October 2026 |
| Symbol | **MRWD** | Deployed 25 October 2026 |
| Contract address | [`0xC17227AAa33C54634B6cE7AD0bf33A156563c179`](https://basescan.org/token/0xC17227AAa33C54634B6cE7AD0bf33A156563c179) | Verified on Sourcify (`exact_match`) |
| Network | Base mainnet (chain ID 8453) | Deployed |
| Standard and library | ERC-20 + EIP-2612 Permit (`ERC20`, `ERC20Permit`, OpenZeppelin 5.x, solc 0.8.28) | Deployed |
| Total supply | **1,000,000,000,000** (10¹² MRWD, 10³⁰ base units) | Minted once in constructor |
| Decimals | 18 | Immutable |
| Further issuance | None: no external or internal mint path reachable after construction | Enforced by bytecode |
| Owner / admin roles | None | Enforced by bytecode |
| Upgradeability | None (no proxy) | Enforced by bytecode |
| Transfer behavior | Standard ERC-20: no tax, reflection, rebase, blacklist, or pause | Enforced by bytecode |
| Burn / voting extensions | Excluded (`ERC20Burnable` and `ERC20Votes` omitted) | Enforced by bytecode |

The deployer wallet (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`) holds **0 MRWD** from the initial
allocation, and unused rounding dust sits at `0x000000000000000000000000000000000000dEaD`. Source:
[R15].

## 13. Liquidity architecture and aggregator routing

### 13.1 Canonical pool and 56-aggregator routing audit

The canonical pool is the **MRWD/WETH 0.30% Uniswap V3 pool on Base**,
[`0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5`](https://basescan.org/address/0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5),
created through Uniswap's canonical Base V3 factory (`0x33128a8fC17869897dcE68Ed026d694621f6FDfD`)
and position manager (`0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`). Because V3 liquidity is held as
position NFTs with chosen price ranges, usable depth must be measured as **active, in-range
liquidity**, not nominal deposited value. A second pool on another venue would split liquidity and
would not share the `UniswapV3Staker` incentive key bound to this pool.

On `/protocol`, the **56-Aggregator Routing Audit** (`MrwdAggregatorAuditCard`) quotes 11 on-chain
Base routers and quoters live against the canonical MRWD/WETH V3 pool and classifies 56 aggregator
routing targets (`public/mrwd-56-aggregators/report.json`), distinguishing venues that route through
Uniswap V3 automatically from those requiring additional pools or off-chain indexing.

### 13.2 Three kinds of liquidity

| Kind | What it is | On-chain state |
| --- | --- | --- |
| **Protocol-owned launch liquidity** | Position **#6351512**, covering ¼× to 4× around the launch tick `318126` (ticks `304260` to `331980`, spacing 60), seeded with 200 billion MRWD (20% of supply) and 0.003059671793548375 WETH | Locked in `V3PositionTimelock` (`0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25`) until **24 October 2028 23:11:39 UTC** (`1856041899`), owner `0x9dC0…7C98` |
| **Staked V3 positions** | Six full-range V3 position NFTs (`#6367926`, `#6383531`, `#6383541`, `#6383553`, `#6448087`, and `#6448166`, ticks `-887220` to `887220`) deposited and staked in `UniswapV3Staker` (`0x42bE…C3C1`), bringing canonical pool reserves to `0.04633571 WETH` (`~$107.27` single-sided WETH) and `171.44 billion MRWD` (`~$214.54` total pool depth at `2 × WETH`) | Earn MRWD in proportion to in-range liquidity-seconds; can be claimed+restaked or unstaked at any time on `/stake` and `/protocol` |
| **Liquidity depth** | What a trader can actually execute | Measured by price impact at stated trade sizes and active in-range liquidity |

Locking the protocol's launch position does not lock any other position; holders of staked V3
positions can unstake and withdraw their own NFTs at any time. The enforced commitment on `#6351512`
is the 24-month timelock until 24 October 2028, accompanied by a declared policy to retain or extend
the position through the 48-month reward program.

### 13.3 Pool price and valuation versus depth

Following the November 2026 full-range LP additions (staked positions `#6367926`, `#6383531`,
`#6383541`, `#6383553`, `#6448087`, and `#6448166`), the canonical MRWD/WETH 0.30% V3 pool holds
`0.04633571 WETH` (`~$107.27` single-sided WETH) and `171.44 billion MRWD` (`~$214.54` total pool
depth at `2 × WETH`), clearing the market-data service's $100 firm-liquidity floor (§4). Implied
whole-supply valuation (`5 × E` for a 20% supply pairing) is never equal to executable pool depth:
selling into a modest pool still moves the price rapidly, and when the spot tick moves outside a
concentrated position's tick range (such as `#6351512`'s ticks `304260–331980`), only positions
covering the active tick (including the six full-range staked positions) supply executable liquidity
and earn rewards.

## 14. Rewards program

### 14.1 Mechanism: `UniswapV3Staker` and in-app claiming

Rewards are distributed through Uniswap's official **UniswapV3Staker** on Base,
[`0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`](https://basescan.org/address/0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1).
Rewards accrue in proportion to a staked position's **in-range liquidity multiplied by seconds in
range**:

```text
reward ≈ unclaimedRewards × (Δ secondsPerLiquidityInside × positionLiquidity) / unclaimedLiquiditySeconds
```

Because `secondsPerLiquidityInside` is tracked by the V3 pool across **all** active in-range
liquidity (staked or unstaked), any unstaked in-range position—including the locked launch position
whenever the price is inside its range—dilutes the share of the period budget claimable by staked
positions, and the unclaimed remainder goes to the burn-address refundee (`0x…dEaD`) when the period
is finalized.

On `/stake` and `/protocol`, the MRWD rewards panel discovers the connected wallet's staked and
unstaked MRWD/WETH V3 positions directly from contract state and provides three owner-checked
actions:

- **Claim:** unstakes the position, claims accrued MRWD to the wallet, and re-stakes the position in
  the same transaction so it keeps earning without interruption.
- **Unstake:** claims rewards and withdraws the position NFT back to the wallet after confirmation.
- **Claim to Wallet:** withdraws rewards already credited in the staker.

### 14.2 Emissions and 16-quarter schedule

- **60% maximum reserve (600,000,000,000 MRWD).** Allocated to `MuttIncentiveScheduler` at launch; no
  tokens can be minted.
- **48-month declining linear curve across 16 quarters (`MuttEmissionSchedule.sol`).** Monthly
  emissions start at 1.5× the 48-month average (18.75 billion MRWD/month) and decline linearly to
  0.5× (6.25 billion MRWD/month) in month 48. The program runs as **16 consecutive quarterly periods**
  of 91.25 days (`7,884,000` seconds) starting **26 October 2026 00:07:15 UTC** (`1792973235`):
  quarter *k* (for *k* = 0 … 15) holds `600,000,000,000 × (417 − 18k) / 4,512` MRWD (about 55.45
  billion MRWD in Quarter 1 down to 19.55 billion MRWD in Quarter 16, summing to exactly 600 billion
  MRWD).
- **Quarter 1 (live):** funded on `UniswapV3Staker` with 55.45 billion MRWD, running from
  **26 October 2026 00:07:15 UTC** to **25 January 2027 06:07:15 UTC** (`1800857235`).
- **Unused rewards go to `0x…dEaD`.** Every period's refundee is
  `0x000000000000000000000000000000000000dEaD`. Unclaimed rewards and any missed period are
  permanently removed from circulation (while remaining part of `totalSupply()`, as MRWD has no burn
  function).

### 14.3 Bounded authority: `MuttIncentiveScheduler` and automated keeper

`MuttIncentiveScheduler` is deployed on Base mainnet at
[`0xCAbf284806b800d9A771B55857B9fCF735ea7109`](https://basescan.org/address/0xCAbf284806b800d9A771B55857B9fCF735ea7109)
and verified on Sourcify (`exact_match`). It:

- holds the 544.55 billion MRWD reserve for Quarters 2–16 on-chain;
- encodes all 16 periods, the canonical pool, and the `0x…dEaD` refundee immutably at construction;
- has **no owner, no admin, and no withdrawal function**;
- exposes four permissionless functions callable by any address:
  1. `createIncentive(period)` — creates that quarter's incentive on `UniswapV3Staker` inside its
     30-day lead window;
  2. `skipMissedPeriod(period)` — if a quarter's start time passes without creation, sends that
     quarter's MRWD allocation to `0x…dEaD` so tokens are never trapped;
  3. `finalize(period, tokenIds)` — after a quarter ends, unstakes any remaining positions and calls
     `endIncentive`, sending unclaimed rewards to `0x…dEaD`;
  4. `burnLeftover()` — after all 16 quarters are settled, sends any residual balance to `0x…dEaD`.

A daily GitHub Actions workflow (`.github/workflows/mrwd-keeper.yml`, running `server/src/mrwd/keeper.ts`
with dedicated gas-only keeper wallet `0x5Fb98222c6010D6A3fCD3119372e82777282796f`) checks the
scheduler each day at 07:41 UTC and submits any due permissionless call. Quarter 2's creation window
opens on **26 December 2026 06:07 UTC**. Sources: [R15], [R17].

## 15. Allocation and vesting (MuttVesting.sol)

| Allocation | Share | MRWD | On-chain custody and release schedule |
| --- | --- | --- | --- |
| LP rewards | 60% | 600,000,000,000 | `MuttIncentiveScheduler` (`0xCAbf…7109`); Quarter 1 (55.45B) funded on `UniswapV3Staker`, Quarters 2–16 (544.55B) in scheduler |
| Launch liquidity | 20% | 200,000,000,000 | Uniswap V3 position `#6351512`, locked in `V3PositionTimelock` (`0xB5C9…2E25`) until 24 October 2028 |
| Treasury | 15% | 150,000,000,000 | `MuttVesting` (`0x7bC37041E1205841a83413625650EC12DA119697`) → beneficiary `0xB04A0b807BCD463351F90133242F0AcA15C2280f` |
| Team | 5% | 50,000,000,000 | `MuttVesting` (`0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1`) → beneficiary `0x88D67A5fEAafd4501B0E3510ebb3533b7d8245f2` |

Both `MuttVesting` contracts are deployed on Base mainnet, verified on Sourcify (`exact_match`), and
built on OpenZeppelin `VestingWallet` with ownership transfer and renunciation disabled:

- **12-month cliff:** zero tokens release before **25 October 2027 23:11:39 UTC** (`1824505899`).
- **36-month linear vesting:** releases linearly over `94,608,000` seconds (1,095 days), completing
  on **24 October 2030 23:11:39 UTC**.
- **Permissionless release:** anyone can call `release(token)`, which always transfers vested tokens
  to the fixed beneficiary address. Source: [R15].

## 16. Measurement and economic model

The project tracks and evaluates the following metrics for the MRWD liquidity program:

| Metric | Definition |
| --- | --- |
| Depth at 1% and 2% | USD trade size that moves the canonical MRWD/WETH pool's price by 1% and 2% |
| Reference slippage | Price impact for benchmark trade sizes |
| LP concentration | Share of active in-range liquidity held by top position owners (launch position reported separately) |
| In-range share | Share of staked liquidity that is currently in range |
| Holder concentration | Top-10 holder share excluding labelled custody contracts (pool, scheduler, staker, vesting, timelock, Pro staking) |
| Yield composition | Trading-fee yield and MRWD incentive yield reported separately |
| Finalization delay | Time between a quarter's scheduled end and its `endIncentive` settlement |

In simplified constant-liquidity form, effective rewards claimable by staked positions are:

```text
R_effective ≈ R_emitted × L_staked,in-range / L_total,in-range
```

Because rewards sold into the pool move the price, the economic model (`scripts/mchow-model/`) values
emissions at realizable prices rather than spot valuation. Source: [R16].

## 17. Launch verification and launchpad demand test

### 17.1 Mainnet deployment status

MRWD and its companion contracts are live on Base mainnet (`deployments/mrwd-base-mainnet.json`):

- **Live and verified on-chain:**
  - Sourcify `exact_match` verification of all five MRWD contracts (`MuttRewards`,
    `MuttIncentiveScheduler`, treasury `MuttVesting`, team `MuttVesting`, and `MuttProStaking`).
  - Canonical 0.30% V3 pool (`0xa7D4…bDB5`) initialized with `0.04633571 WETH` (`~$107.27`
    single-sided WETH, `~$214.54` total pool depth) and `171.44B MRWD`, Quarter 1 active on
    `UniswapV3Staker` (55.45B MRWD funded) with 6 staked full-range positions (`#6367926`,
    `#6383531`, `#6383541`, `#6383553`, `#6448087`, and `#6448166`), launch position `#6351512`
    locked in `V3PositionTimelock` until 24 October 2028, and 0 unpaired MRWD held in the deployer
    wallet.
  - Uniswap V3 pool pricing active in `shaggy-dogg-market-data`, daily automated keeper running in
    GitHub Actions, in-app V3 reward claiming and `MuttProStaking` live on `/stake` and `/protocol`,
    and canonical token identity published at `https://dex.lumsian.com/mrwd`.
- **Open items:**
  - Third-party token-profile submissions (BaseScan, CoinGecko, CoinMarketCap, DexScreener, Birdeye)
    and search-index verification.
  - Continued expansion of WETH liquidity in the canonical MRWD/WETH pool beyond its current
    `~$214.54` (`0.0463 WETH`) depth for larger trade sizes.
  - Independent external security review of the ecosystem contracts.
  - Completion of the three-month launchpad demand test below before enabling MRWD-quoted token
    launches.

### 17.2 Launchpad demand test

Before relying on launchpad activity as a primary source of MRWD demand (§11.1), the project
measures real launchpad usage on WETH-paired launches against fixed thresholds:

- **Window:** Three consecutive full calendar months (UTC) with persistent Supabase launch storage
  active, opening **November 2026**.
- **Counted launches (`/api/launches/stats`):** Deployment transaction verified on Base, creation
  bytecode matching an approved `FixedSupplyToken` build (`server/src/launches/verify.ts`), and
  **seeded** with at least 0.05 WETH in the token's Uniswap V3 1.00% WETH pool within 24 hours.
- **Trading per launch (`npm --prefix server run launches:measure -- --window YYYY-MM`):** 30-day
  WETH swap volume in that pool from public Base `Swap` events, excluding the creator and initial
  supply recipient.

| Three-month average | Seeded launches / month | Median 30-day trading / launch | Consequence for MRWD-quoted launches |
| --- | --- | --- | --- |
| **Proceed** | 15 or more | $40,000 or more | Rerun the §16 model with measured inputs and proceed with MRWD pairing |
| **Re-model** | 5 to 14 | $25,000 or more | Rerun the §16 model; proceed only if the conservative scenario passes every criterion |
| **Stop** | Fewer than 5 | Below $25,000 | Do not enable MRWD-quoted launches as designed; rely on utility staking or revise the demand model |

Source: [R18].

## 18. Open decisions and legal notice

1. **MRWD staking and EQX coexistence:** Equilnyxs Pro access via 1 billion MRWD in `MuttProStaking`
   is live (§11.1), and `EQX` (`0x1aEB…a56C`) is deployed as transfer-restricted Equilnyxs shares
   (§10). How MRWD utility staking and EQX relate in future Equilnyxs tiers will be specified in a
   later edition.
2. **Browser-wallet gas sponsorship:** `SponsoredRewardPaymaster` (`0x9cD4…7CB4`) is live on Base
   EntryPoint v0.7, while browser-wallet submission awaits wallet-native ERC-7677 `wallet_sendCalls`
   support or an updated account integration (§8.1).
3. **Second MRWD liquidity venue:** Deferred (`docs/MRWD_LIQUIDITY_VENUES_2026-10-30.md`) until
   organic trading volume justifies splitting liquidity or funding a separate gauge.
4. **Legal and regulatory notice:** MRWD rewards and staking utilities are functional protocol
   mechanisms, not investment contracts or promised yields. No APY is promised, and holding or
   staking MRWD does not grant equity, revenue rights, or governance control.

## 19. Roadmap

| Stage | Deliverable | Status |
| --- | --- | --- |
| MRWD mainnet launch & keeper | Token, 0.30% V3 pool, 24-month timelock, 16-quarter scheduler, vestings, Pro staking, Sourcify verification, daily keeper | **Live on Base mainnet** (`deployments/mrwd-base-mainnet.json`) |
| Multi-venue Base routing & launchpad suite hardening | Eight Base swap venues with 35% outlier filter and user selection; 4 launchpad archetypes, 10 USDC `LaunchpadFees`, atomic `LaunchpadSuiteDeployer`, hardened vaults/staking, in-app holder staking | **Live on Base mainnet** |
| Launchpad demand measurement | Three full calendar months of verified launches and 30-day trading volume | **In progress** (window opens November 2026; §17.2) |
| Browser-wallet paymaster sponsorship | ERC-7677 `wallet_sendCalls` or compatible smart-account signing in browser wallets | Open (§8.1) |
| Contract assurance & decentralization | Independent security review of ecosystem contracts; evaluate multisignature administration for admin-governed contracts | Open (§8.2, §9) |

## 20. Base contract inventory

All addresses below are live on **Base mainnet (chain ID 8453)**. Base swap venue routers, factories,
and quoters are listed in §3.1.

| Contract or asset | Address | Notes |
| --- | --- | --- |
| **Mutt Rewards (MRWD) token** | [`0xC17227AAa33C54634B6cE7AD0bf33A156563c179`](https://basescan.org/token/0xC17227AAa33C54634B6cE7AD0bf33A156563c179) | 1T fixed supply; Sourcify `exact_match`; §12 |
| **MRWD/WETH 0.30% Uniswap V3 pool** | [`0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5`](https://basescan.org/address/0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5) | Canonical MRWD pool; §13.1 |
| **MRWD launch position NFT** | `#6351512` in `V3PositionTimelock` | Locked until 24 October 2028; §13.2 |
| **MuttIncentiveScheduler** | [`0xCAbf284806b800d9A771B55857B9fCF735ea7109`](https://basescan.org/address/0xCAbf284806b800d9A771B55857B9fCF735ea7109) | 600B MRWD reserve across 16 quarters; ownerless; Sourcify `exact_match`; §14.3 |
| **MuttVesting (Treasury / Team)** | [`0x7bC37041E1205841a83413625650EC12DA119697`](https://basescan.org/address/0x7bC37041E1205841a83413625650EC12DA119697) / [`0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1`](https://basescan.org/address/0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1) | 150B / 50B MRWD; cliff to 25 Oct 2027, linear to 24 Oct 2030; Sourcify `exact_match`; §15 |
| **MuttProStaking** | [`0x67dBC193bF510225EBf189ab25dC3b34a32c1766`](https://basescan.org/address/0x67dBC193bF510225EBf189ab25dC3b34a32c1766) | 30-day deposit lock; 1B MRWD for Equilnyxs Pro; ownerless; Sourcify `exact_match`; §11.1 |
| **SponsoredRewardPaymaster (v0.7)** | [`0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`](https://basescan.org/address/0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4) | EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`); 100 MRWD reward; §8.1 |
| **LaunchpadFees** | [`0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b`](https://basescan.org/address/0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b) | On-chain USDC launch fee collector (live `feeAmount()`: 10 USDC); §6.2 |
| **V3PositionTimelock** | [`0xb5c9bedb57f4e348e40a5e6326c90de474072e25`](https://basescan.org/address/0xb5c9bedb57f4e348e40a5e6326c90de474072e25) | Sovereign V3 NFT locker; §6.1 |
| **AtomicFlashArbitrageRouter** | [`0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd`](https://basescan.org/address/0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd) | Pinned Aave V3 flash-loan arbitrage router; §5 |
| **SD token / SD FeeDiscountStaking** | [`0x051c758521971f5c5a84edaf18eea12854375469`](https://basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469) / [`0x8a765d450d38d13f5e2533d29399f743cdf23faa`](https://basescan.org/address/0x8a765d450d38d13f5e2533d29399f743cdf23faa) | Active SD token and fee-discount staking contract; §7.1, §10 |
| **YieldStakingVault (Aave v3 USDC)** | [`0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5`](https://basescan.org/address/0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5) | 10,000 bps discount denominator and virtual-share protection; §7.2 |
| **FBA token / EQX token** | [`0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263`](https://basescan.org/address/0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263) / [`0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C`](https://basescan.org/address/0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C) | Base registry tokens (EQX transfer-restricted); §10 |
| **UniswapV3Staker (external)** | [`0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`](https://basescan.org/address/0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1) | Official Uniswap V3 Staker on Base; §14.1 |
| **Owner / administrator / keeper** | [`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`](https://basescan.org/address/0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98) / [`0x5Fb98222c6010D6A3fCD3119372e82777282796f`](https://basescan.org/address/0x5Fb98222c6010D6A3fCD3119372e82777282796f) | Project admin EOA / gas-only MRWD scheduler keeper EOA |

## 21. Evidence and references

Repository references are pinned to the current implementation baseline (`main` in
`shaggy-dogg-dex` and `48c1b54` in `shaggy-dogg-market-data`).

- **[R1] Network and venue configuration:** [contracts.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/config/contracts.ts), [dex-venues.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/config/dex-venues.ts), [chain configuration](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/config/chains/config.ts).
- **[R2] Routing, outlier filtering, approvals, and swap workflow:** [smart-routing.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/amm/smart-routing.ts), [useSwap.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/hooks/useSwap.tsx), [approvals.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/approvals.ts).
- **[R3] Liquidity integration and DEX explorer:** [Uniswap V3 compatibility review](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/audit/UNISWAP-V3-COMPATIBILITY.md), [Liquidity.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/pages/Liquidity.tsx), [DexStaking.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/pages/DexStaking.tsx).
- **[R4] Liquidity locking:** [V3PositionTimelock.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/V3PositionTimelock.sol), [timelock-deployment.json](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/config/dex/timelock-deployment.json).
- **[R5] Ecosystem token registry:** [tokens.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/config/tokens.ts), [base-mainnet.json](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/deployments/base-mainnet.json).
- **[R6] Fee-discount staking:** [FeeDiscountStaking.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/FeeDiscountStaking.sol), [LaunchStakingPanel.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/components/launchpad/LaunchStakingPanel.tsx), [base-mainnet-staking-migration.json](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/deployments/base-mainnet-staking-migration.json).
- **[R7] Vault accounting and Base fork tests:** [YieldStakingVault.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/YieldStakingVault.sol), [CompoundYieldVault.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/CompoundYieldVault.sol), [FeeDiscountMath.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/FeeDiscountMath.sol), [LaunchVaultForkTests.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/test/LaunchVaultForkTests.sol).
- **[R8] Flash-loan implementations and review:** [AtomicFlashArbitrageRouter.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/AtomicFlashArbitrageRouter.sol), [ROUTER-REVIEW.md](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/audit/ROUTER-REVIEW.md), [KNOWN-ISSUES.md](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/audit/KNOWN-ISSUES.md).
- **[R9] Arbitrage snapshot, Auto-Pilot, and CeFi Matrix feeds:** [Arbitrage.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/pages/Arbitrage.tsx), [bot-market-snapshot.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/amm/bot-market-snapshot.ts), [flash-routes.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/amm/flash-routes.ts), [gas-cost.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/amm/gas-cost.ts), [useCeFiMatrixFeeds.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/hooks/useCeFiMatrixFeeds.ts).
- **[R10] Price API and thin-pool handling:** [prices.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/server/src/routes/prices.ts), [marketData.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/server/src/utils/marketData.ts).
- **[R11] Market-data service:** [market_data.py](https://github.com/rickrichi/shaggy-dogg-market-data/blob/48c1b54/app/market_data.py), [main.py](https://github.com/rickrichi/shaggy-dogg-market-data/blob/48c1b54/app/main.py).
- **[R12] Aggregator routing audit:** [MrwdAggregatorAuditCard.tsx](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/components/mrwd/MrwdAggregatorAuditCard.tsx), [report.json](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/public/mrwd-56-aggregators/report.json).
- **[R13] Launchpad suite deployment and contract loader:** [FixedSupplyToken.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/FixedSupplyToken.sol), [LaunchpadSuiteDeployer.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/LaunchpadSuiteDeployer.sol), [deployEngine.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/launchpad/deployEngine.ts), [settings.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/launchpad/settings.ts), [contract-versions.json](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/src/lib/launchpad/contract-versions.json).
- **[R14] Sponsored Reward Paymaster:** [SponsoredRewardPaymaster.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/SponsoredRewardPaymaster.sol), [SponsoredRewardPaymaster.t.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/test/SponsoredRewardPaymaster.t.sol), [PAYMASTER.md](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/docs/PAYMASTER.md).
- **[R15] Mutt Rewards ($MRWD) contracts and deployment record:** [MuttRewards.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/MuttRewards.sol), [MuttIncentiveScheduler.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/MuttIncentiveScheduler.sol), [MuttEmissionSchedule.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/MuttEmissionSchedule.sol), [MuttVesting.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/MuttVesting.sol), [MuttProStaking.sol](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/contracts/src/MuttProStaking.sol), [mrwd-base-mainnet.json](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/deployments/mrwd-base-mainnet.json).
- **[R16] Economic model:** [MCHOW-ECONOMIC-MODEL-v0.4.md](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/docs/MCHOW-ECONOMIC-MODEL-v0.4.md), [model-v0.4.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/scripts/mchow-model/model-v0.4.ts).
- **[R17] Automated MRWD scheduler keeper:** [keeper.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/server/src/mrwd/keeper.ts), [run-keeper.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/server/src/mrwd/run-keeper.ts), [mrwd-keeper.yml](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/.github/workflows/mrwd-keeper.yml).
- **[R18] Launchpad verification and trading measurement:** [verify.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/server/src/launches/verify.ts), [trading.ts](https://github.com/rickrichi/shaggy-dogg-dex/blob/main/server/src/launches/trading.ts).

---

### Appendix A — How each MRWD launch risk is handled

| Risk | Enforced by contract | Incentivized by design | Depends on the market |
| --- | --- | --- | --- |
| Mintable supply | **Yes:** 1T supply minted once in constructor; no callable mint path, no owner, no proxy | — | — |
| Thin launch liquidity | Pool price below $100 floor is flagged `indicative` and excluded from portfolio totals (§4) | 16-quarter V3 Staker rewards attract LP deposits | Depth depends on independent LPs and trading volume |
| Unlocked launch liquidity | **Yes, for position `#6351512`:** locked in `V3PositionTimelock` until 24 October 2028 | — | Community V3 positions are unlocked by design |
| Reserve redirection | **Yes:** `MuttIncentiveScheduler` has no owner or withdrawal path; unused/missed rewards go to `0x…dEaD` | — | — |
| Team / treasury dump at launch | **Yes:** 150B treasury and 50B team MRWD sit in `MuttVesting` with a 12-month cliff to 25 Oct 2027 and 36-month linear release | — | Beneficiaries decide what to do with tokens after they vest |
| Holder concentration | Vesting for team and treasury; immutable scheduler custody for rewards | LP emissions and utility staking distribute tokens over time | Unemitted reserve remains concentrated in the scheduler until paid out |
| Durable demand after emissions | `MuttProStaking` enforces a 30-day lock per deposit with no admin override | Equilnyxs Pro access, LP rewards, and planned launchpad pairing | Whether users value Pro access and launched tokens |
