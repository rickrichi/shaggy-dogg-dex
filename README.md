# Shaggy Mutt DEX 🐕

Live application: **[dex.lumsian.com](https://dex.lumsian.com/)**\
Technical whitepaper: **[dex.lumsian.com/whitepaper](https://dex.lumsian.com/whitepaper)** ([`docs/WHITEPAPER.md`](docs/WHITEPAPER.md))\
Canonical Mutt Rewards ($MRWD) page: **[dex.lumsian.com/mrwd](https://dex.lumsian.com/mrwd)**

Shaggy Mutt DEX is a wallet-connected multi-chain decentralized exchange, liquidity management suite,
token and DeFi suite launchpad, and ecosystem portal centered on **Base Mainnet** (`8453`), with
additional swap routing configured for Ethereum (`1`), Arbitrum One (`42161`), Optimism (`10`),
Polygon (`137`), and Sepolia (`11155111`).

The [technical whitepaper](docs/WHITEPAPER.md) (Version 2.0 · 3 November 2026) documents the live
architecture, eight-venue Base swap routing, launchpad archetypes, staking and lending vault
accounting, **Mutt Rewards ($MRWD)** tokenomics and on-chain custody, administrative permissions, and
verified Base mainnet deployments. Its public page is generated at `public/whitepaper.html` (served
as `/whitepaper`). After editing `docs/WHITEPAPER.md`, run `node scripts/build-whitepaper.mjs` to
regenerate `public/whitepaper.html` and `public/whitepaper.md`.

## Current Capabilities

- **Multi-Venue Base Swap Routing (`/swap`):** Quotes and compares **eight Base DEX venues**
  (Uniswap V3 direct & two-hop, Uniswap V2, Aerodrome volatile & stable, PancakeSwap V3 direct &
  two-hop, SushiSwap V3 direct & two-hop, PancakeSwap V2, SushiSwap V2, and BaseSwap), filters out
  cross-venue outlier quotes (>35% deviation from the median across 3+ venues), and lets users
  choose **Best price (automatic)** or any specific venue without silent rerouting. Limit orders are
  labelled `Limit · Soon`.
- **Liquidity & DEX Explorer (`/liquidity`, `/stake/dexes`):** Supports classic Uniswap V2 liquidity
  (including Ethereum V2), Base Uniswap V3 position minting, fee collection, `UniswapV3Staker`
  farming, sovereign NFT locking in `V3PositionTimelock`, and a 7-venue Base liquidity explorer with
  guided in-app pool planners and staked-token discovery.
- **Token & DeFi Suite Launchpad (`/launchpad`):** Open to any wallet on Base mainnet with a live
  **10 USDC** on-chain launch fee via `LaunchpadFees`. Deploys **four verified archetypes**
  (`Standard Fixed-Supply ERC-20`, `Staking & Loyalty Ecosystem`, `Aave v3 CeDeFi Vault`, and
  `Full Sovereign Protocol Suite`) using `FixedSupplyToken` (with self-transfer protection) and
  atomic `LaunchpadSuiteDeployer` (configuring 10%/25%/50%/75% vault fee-discount tiers and
  transferring admin roles to the creator in one transaction), plus optional initial liquidity
  seeding (minimum 0.05 ETH) and in-app holder staking (`/stake?contract=0x...`).
- **Mutt Rewards (`$MRWD`) & Protocol Hub (`/mrwd`, `/protocol`, `/stake`):** Fixed-supply (`1T`)
  ERC-20 + EIP-2612 Permit utility and liquidity-incentive token on Base (`0xC172…c179`, verified on
  Sourcify as `exact_match`), paired in the canonical 0.30% Uniswap V3 MRWD/WETH pool (`0xa7D4…bDB5`)
  with a 24-month locked launch position (`#6351512`), an ownerless 16-quarter
  `MuttIncentiveScheduler` (`0xCAbf…7109`) and daily automated keeper, 12-month cliff + 36-month
  linear `MuttVesting` contracts for treasury and team, ownerless `MuttProStaking` (`0x67dB…1766`,
  1B MRWD locked for 30 days to unlock Equilnyxs Pro), in-app V3 LP reward claiming, and a live
  56-aggregator routing audit.
- **Price Service, Arbitrage & Paymaster (`/market-data`, `/arbitrage`, `/paymaster`):** Self-hosted
  exchange medians and Base V2/V3/Aerodrome pool pricing with a $100 firm-liquidity floor
  (`indicative` badges for thin pools, excluded from portfolio totals); live CeFi Pair Matrix
  WebSocket streams (Coinbase, Kraken, Binance, Bybit, OKX) and atomic Aave V3 flash-loan routing via
  `AtomicFlashArbitrageRouter`; and `SponsoredRewardPaymaster` deployed on Base EntryPoint v0.7
  (with browser-wallet EIP-7702 sponsorship limitations disclosed in the UI).

## Live Base Mainnet Deployments (Chain ID 8453)

| Contract or Asset | Address | Verification / Notes |
| :--- | :--- | :--- |
| **Mutt Rewards (`MRWD`)** | [`0xC17227AAa33C54634B6cE7AD0bf33A156563c179`](https://basescan.org/token/0xC17227AAa33C54634B6cE7AD0bf33A156563c179) | 1T fixed supply; ownerless; Sourcify `exact_match` |
| **MRWD/WETH 0.30% V3 Pool** | [`0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5`](https://basescan.org/address/0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5) | Canonical Uniswap V3 pool; launch NFT `#6351512` locked until 24 Oct 2028 |
| **MuttIncentiveScheduler** | [`0xCAbf284806b800d9A771B55857B9fCF735ea7109`](https://basescan.org/address/0xCAbf284806b800d9A771B55857B9fCF735ea7109) | 600B MRWD LP reward reserve across 16 quarters; ownerless; Sourcify `exact_match` |
| **MuttVesting (Treasury / Team)** | [`0x7bC37041E1205841a83413625650EC12DA119697`](https://basescan.org/address/0x7bC37041E1205841a83413625650EC12DA119697) / [`0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1`](https://basescan.org/address/0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1) | 150B / 50B MRWD; 12-month cliff to 25 Oct 2027, 36-month linear to 24 Oct 2030 |
| **MuttProStaking** | [`0x67dBC193bF510225EBf189ab25dC3b34a32c1766`](https://basescan.org/address/0x67dBC193bF510225EBf189ab25dC3b34a32c1766) | 30-day lock; 1B MRWD unlocks Equilnyxs Pro; ownerless; Sourcify `exact_match` |
| **SponsoredRewardPaymaster** | [`0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`](https://basescan.org/address/0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4) | ERC-4337 EntryPoint v0.7; 100 MRWD reward per eligible sponsored op |
| **LaunchpadFees** | [`0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b`](https://basescan.org/address/0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b) | On-chain USDC launch fee collector (live `feeAmount()`: 10 USDC) |
| **V3PositionTimelock** | [`0xb5c9bedb57f4e348e40a5e6326c90de474072e25`](https://basescan.org/address/0xb5c9bedb57f4e348e40a5e6326c90de474072e25) | Sovereign Uniswap V3 position NFT locker |
| **AtomicFlashArbitrageRouter** | [`0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd`](https://basescan.org/address/0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd) | Pinned Aave V3 flash-loan arbitrage router |
| **SD Token / SD Staking** | [`0x051c758521971f5c5a84edaf18eea12854375469`](https://basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469) / [`0x8a765d450d38d13f5e2533d29399f743cdf23faa`](https://basescan.org/address/0x8a765d450d38d13f5e2533d29399f743cdf23faa) | 1,000,000 fixed supply / active `FeeDiscountStaking` |
| **YieldStakingVault (Aave v3)** | [`0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5`](https://basescan.org/address/0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5) | 10,000 bps discount denominator and virtual-share protection |
| **FBA Token / EQX Token** | [`0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263`](https://basescan.org/address/0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263) / [`0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C`](https://basescan.org/address/0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C) | Base registry tokens (`EQX` is transfer-restricted Equilnyxs shares) |

## Quick Start

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure RPC and service variables
3. Start the backend API: `npm run api:dev` (Hono server on port `8788`)
4. Start the frontend: `npm run dev` (Vite proxies `/api/*` → `http://localhost:8788`)

## Verification Commands

- **Type-check & build:** `npm run type-check && npm run build`
- **Unit tests:** `npx vitest run`
- **Solidity contract verification & tests:** `npm run contracts:check`
- **Regenerate whitepaper HTML/Markdown:** `node scripts/build-whitepaper.mjs`

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons
- **Web3:** Wagmi, Viem, RainbowKit
- **Contracts:** Solidity (`0.8.24` / `0.8.28`), Foundry, OpenZeppelin Contracts
- **Backend & Data:** Hono, Vercel serverless/edge routes, Supabase, self-hosted `shaggy-dogg-market-data`
