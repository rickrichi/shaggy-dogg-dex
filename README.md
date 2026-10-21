# Shaggy Mutt DEX 🐕

A multi-chain DEX application under active development. Market swaps and Uniswap V2 liquidity
flows are implemented; limit orders remain preview-only and must not be presented as executable.

The [technical whitepaper](docs/WHITEPAPER.md) describes implementation scope, AMUTT economics,
administrative permissions, and recorded deployments. Its public page is generated at
`public/whitepaper.html` (served as `/whitepaper` with Vercel clean URLs). After editing the
Markdown source, run `node scripts/build-whitepaper.mjs` to update the page and downloadable copy.

Base Mainnet also supports Uniswap V3 single-pool swaps, full-range NFT minting, and fee
collection through canonical Uniswap contracts. V3 swaps use deadline-protected SwapRouter02
multicalls; minting uses atomic initialization with 0.5% minimum consumption protection on
both selected deposit amounts. Existing pools require deposits matching their current ratio.
V2 withdrawal and V3 deposit remain separate transactions.

See the [V3 compatibility audit](audit/UNISWAP-V3-COMPATIBILITY.md) for fixes, verified scope,
test results, and remaining limitations. Run `npm run contracts:test:v3-fork` for the pinned
Base fork checks. Compatibility does not certify the separate staking, lending, or arbitrage contracts.

## Verified status

As of 2026-09-16, the frontend production build, frontend/backend TypeScript checks, ESLint,
Vitest suite (44 passing, 1 todo), contract source verification, and three Foundry tests pass.
Foundry still reports security warnings for unchecked ERC-20 return values and reentrancy/event
ordering. Resolve those warnings and complete a security review before treating the contracts as
production-ready.

## Live Base Mainnet Deployments (Chain ID 8453)

As of 2026-09-30, the Shaggy Dogg DEX ecosystem is deployed live in production on **Base Mainnet**:

| Contract | Address | BaseScan | Blockscout |
| :--- | :--- | :--- | :--- |
| **GovernanceToken (`SD`)** | `0x051c758521971f5c5a84edaf18eea12854375469` | [BaseScan](https://basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469) | [Blockscout](https://base.blockscout.com/address/0x051c758521971f5c5a84edaf18eea12854375469) |
| **FeeDiscountStaking** | `0x42134ccc6c41149cf71c7b4994e33ee66758af20` | [BaseScan](https://basescan.org/address/0x42134ccc6c41149cf71c7b4994e33ee66758af20) | [Blockscout](https://base.blockscout.com/address/0x42134ccc6c41149cf71c7b4994e33ee66758af20) |
| **AaveFlashBorrower** | `0xa5b50037a8d2fda22805f750252268adaeb36480` | [BaseScan](https://basescan.org/address/0xa5b50037a8d2fda22805f750252268adaeb36480) | [Blockscout](https://base.blockscout.com/address/0xa5b50037a8d2fda22805f750252268adaeb36480) |
| **YieldStakingVault** | `0x8531807ef36560cd7db230c95db85791aa586dda` | [BaseScan](https://basescan.org/address/0x8531807ef36560cd7db230c95db85791aa586dda) | [Blockscout](https://base.blockscout.com/address/0x8531807ef36560cd7db230c95db85791aa586dda) |
| **CompoundYieldVault** | `0x38cccafb4ae96a8ef187f07fb17d18eb63e43782` | [BaseScan](https://basescan.org/address/0x38cccafb4ae96a8ef187f07fb17d18eb63e43782) | [Blockscout](https://base.blockscout.com/address/0x38cccafb4ae96a8ef187f07fb17d18eb63e43782) |

- **Root Admin & Token Holder**: `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (holds 1,000,000 SD)
- **Full Mainnet Report**: See [docs/current-session-2026-09-30-base-mainnet-live.md](docs/current-session-2026-09-30-base-mainnet-live.md)

## Live Base Sepolia Deployments (Chain ID 84532)

As of 2026-09-29, the Shaggy Dogg DEX ecosystem is deployed live on **Base Sepolia** with active Uniswap V2 liquidity:

| Contract | Address | BaseScan |
| :--- | :--- | :--- |
| **GovernanceToken (`SD`)** | `0x051c758521971f5c5a84edaf18eea12854375469` | [BaseScan](https://sepolia.basescan.org/address/0x051c758521971f5c5a84edaf18eea12854375469) |
| **FeeDiscountStaking** | `0x42134ccc6c41149cf71c7b4994e33ee66758af20` | [BaseScan](https://sepolia.basescan.org/address/0x42134ccc6c41149cf71c7b4994e33ee66758af20) |
| **AaveFlashBorrower** | `0xa5b50037a8d2fda22805f750252268adaeb36480` | [BaseScan](https://sepolia.basescan.org/address/0xa5b50037a8d2fda22805f750252268adaeb36480) |
| **YieldStakingVault** | `0x8531807ef36560cd7db230c95db85791aa586dda` | [BaseScan](https://sepolia.basescan.org/address/0x8531807ef36560cd7db230c95db85791aa586dda) |
| **CompoundYieldVault** | `0x38cccafb4ae96a8ef187f07fb17d18eb63e43782` | [BaseScan](https://sepolia.basescan.org/address/0x38cccafb4ae96a8ef187f07fb17d18eb63e43782) |
| **Uniswap V2 SD/WETH Pair** | `0x63D504336d01BcCa615B23AD393E5812Dc646BF8` | [BaseScan](https://sepolia.basescan.org/address/0x63D504336d01BcCa615B23AD393E5812Dc646BF8) |

- **Active Pool Reserves**: `800,000 SD` / `0.001 WETH`
- **Full Report**: See [docs/current-session-2026-09-29-base-sepolia-live.md](docs/current-session-2026-09-29-base-sepolia-live.md)

## Quick Start

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your API keys
3. Run backend API (canonical): `npm run api:dev` (starts Hono server on port 8788)
4. Run front-end: `npm run dev` (Vite proxies `/api/*` → `http://localhost:8788`)

## Environment Setup

Required environment variables (front-end):
- `VITE_ALCHEMY_*_URL` - RPC endpoints for each chain
- `VITE_ZEROX_API_KEY` - 0x Protocol API key
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

Required environment variables (API in `server/`):
- `PORT` (default 8788)
- `ORIGIN` - front-end origin for CORS (default `http://localhost:5173`)
- `AGGREGATOR_URL` (default `https://api.0x.org`)
- `AGGREGATOR_API_KEY` (optional)
- `MARKET_DATA_URL` (default `http://localhost:8010`) - Shaggy Dogg Crypto Market-Data, the price source
- `SUPABASE_WEBHOOK_SECRET` (optional, for DB webhooks)

Canonical API choice:
- The `server/` Hono backend is the single source of truth. Public endpoints use the `/api/*`
  namespace, including `/api/health`, `/api/prices`, `/api/quote`, and
  `/api/webhooks/supabase-db`.
- Vite forwards `/api/*` unchanged to `http://localhost:8788` in development.
- Vercel Edge shims proxy browser-facing API calls to the deployed Hono service. Set Vercel's
  server-side `API_URL` to that service's public origin; do not put backend credentials in a
  `VITE_*` variable.

## CeDeFi Bridge Integration (AlpacaOrderDesk)

The ShaggyDogg DEX server serves as the decentralized liquidity and execution target for **AlpacaOrderDesk**:

- **CeDeFi Status Endpoint**: `GET /api/cedefi/status` reports network health, supported chains (Base `8453`, Base Sepolia `84532`, Ethereum `1`), canonical token contracts (`LUMIORO` at `0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E`), and settlement asset designation (`USDC`).
- **CeDeFi Quote Endpoint**: `GET /api/cedefi/quote` provides real-time effective DEX swap pricing, AMM pool friction, estimated slippage, and L2 gas fee calculation for cross-venue arbitrage against Alpaca centralized books.

### How to Run:
1. **Start the ShaggyDogg DEX Server**:
   ```powershell
   cd C:\Users\fbada\source\repos\shaggy-dogg-dex\server
   npm run start
   ```
   *(Listens on `http://localhost:8788`)*

2. **Launch AlpacaOrderDesk**:
   ```powershell
   cd C:\Users\fbada\source\repos\AlpacaOrderDesk\src\AlpacaOrderDesk
   dotnet run
   ```
   - Click on the new **CeDeFi Bridge** tab.
   - Click **🔄 Refresh Bridge Spreads** to stream live cross-venue spreads and identify arbitrage opportunities between Alpaca and Base!

## Minimal Acceptance Checklist

- [ ] App builds and runs without errors
- [ ] MetaMask connection works (connect/disconnect)
- [ ] Wallet status displays (address, chain, balance)
- [ ] Navigation between pages works
- [ ] Swap interface displays with token inputs
- [ ] Portfolio shows connected wallet info
- [ ] Activity page displays transaction history UI
- [ ] Admin panel shows configuration options
- [ ] Responsive design with gradient theme
- [ ] Environment variables are properly configured

## Features Implemented

✅ RainbowKit/Wagmi wallet integration
✅ Configured multi-chain wallet support
✅ Responsive UI with gradient design theme
✅ Swap interface with token selection
✅ Portfolio dashboard with balance display
✅ Activity/transaction history page
✅ Admin configuration panel
✅ Environment variable validation
✅ TypeScript + Viem for Web3 interactions

Not yet complete:

- Executable limit orders (the current UI is explicitly preview-only)
- Verified multi-hop best-price execution
- Reserve-derived price-impact guarantees for every route
- Domain-specific Supabase webhook side effects

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Radix UI components
- **Web3**: MetaMask SDK + Viem
- **State**: TanStack Query
- **Routing**: React Router DOM

## Deployment

1. Build: `npm run build`
2. Deploy to Vercel/Netlify
3. Set environment variables in deployment platform
