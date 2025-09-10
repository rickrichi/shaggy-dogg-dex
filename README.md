# Shaggy Mutt DEX 🐕

A production-grade, multi-chain token DEX with MetaMask integration and gradient design.

## Quick Start

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your API keys
3. Run development server: `npm run dev`

## Environment Setup

Required environment variables:
- `VITE_ALCHEMY_*_URL` - RPC endpoints for each chain
- `VITE_ZEROX_API_KEY` - 0x Protocol API key
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

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

✅ MetaMask SDK integration with wallet connection
✅ Multi-chain support (Ethereum, Base, Arbitrum, Optimism, Polygon, Sepolia)
✅ Responsive UI with gradient design theme
✅ Swap interface with token selection
✅ Portfolio dashboard with balance display
✅ Activity/transaction history page
✅ Admin configuration panel
✅ Environment variable validation
✅ TypeScript + Viem for Web3 interactions

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