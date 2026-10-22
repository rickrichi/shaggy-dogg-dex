---
description: Repository Information Overview
alwaysApply: true
---

# Shaggy Dogg DEX Information

## Summary
A production-grade, multi-chain token DEX with MetaMask integration and gradient design. The application provides token swapping, portfolio management, transaction history, and admin configuration capabilities across multiple blockchain networks.

## Structure
- **src/**: Frontend React application with TypeScript
- **server/**: Backend API server using Hono and Node.js
- **api/**: Serverless API endpoints for Vercel deployment
- **public/**: Static assets for the frontend
- **documentation/**: Project documentation and Solidity contracts
- **scripts/**: Utility scripts for development and deployment

## Language & Runtime
**Language**: TypeScript
**Version**: ES2022 target
**Build System**: Vite 7.x
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- React 18.3.x with React Router 6.26.x
- Viem 2.37.x and Wagmi 2.16.x for blockchain interactions
- RainbowKit 2.2.x for wallet connection
- Hono 4.9.x for backend API
- TanStack Query 5.85.x for data fetching
- Tailwind CSS 3.4.x with Radix UI components
- Supabase for backend services

**Development Dependencies**:
- TypeScript 5.5.x
- ESLint 9.9.x
- Vite plugins for development

## Build & Installation
```bash
# Frontend
npm install
npm run dev    # Development server
npm run build  # Production build

# Backend server
cd server
npm install
npm run dev    # Development server
npm run build  # Production build
npm run start  # Run production server
```

## Frontend
**Entry Point**: src/main.tsx
**Routing**: React Router with BrowserRouter
**State Management**: TanStack Query and React context
**Web3 Integration**: Wagmi, Viem, and RainbowKit
**UI Framework**: Tailwind CSS with Radix UI components

## Backend
**Framework**: Hono with Node.js
**API Routes**: 
- /api/prices - Token price information
- /api/health - Server health check
- Supabase webhooks integration

**Server Configuration**:
- Rate limiting middleware
- CORS and security headers
- Environment variable validation

## Deployment
**Platform**: Vercel
**Configuration**: vercel.json for deployment settings
**Environment Variables**:
- VITE_ALCHEMY_*_URL - RPC endpoints
- VITE_ZEROX_API_KEY - 0x Protocol API key
- VITE_SUPABASE_URL - Supabase project URL
- VITE_SUPABASE_ANON_KEY - Supabase anonymous key

## Blockchain Integration
**Supported Chains**: Ethereum, Base, Arbitrum, Optimism, Polygon, Sepolia
**Smart Contracts**: 
- ShaggyDoggToken - ERC20 token implementation
- FeeDiscountStaking - Staking contract for fee discounts
**Web3 Libraries**: Viem for blockchain interactions, Wagmi for React hooks

## Core Rules & Architecture Invariants
- **On-Chain Portfolio Flow**: `usePortfolio` and `Portfolio.tsx` must ALWAYS query token balances directly on-chain via Wagmi/Viem multicall and RPC. Portfolio rendering MUST NEVER block on or fail due to external price API cold-starts or timeouts. Pricing is non-blocking with local fallbacks.
- **Ecosystem Watchlist Tokens**: The Base mainnet watchlist in `src/lib/tokens.ts` permanently tracks Shaggy Dogg (SD), Alpha Mutt (AMUTT), FBA Token (FBA), Wrapped Ether (WETH), and USD Coin (USDC).