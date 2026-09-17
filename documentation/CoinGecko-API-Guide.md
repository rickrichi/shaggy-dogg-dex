# CoinGecko API Integration Guide

Complete guide to fetching token prices using CoinGecko's API (Free & Pro tiers).

---

## 📋 Table of Contents

1. [API Overview](#api-overview)
2. [Authentication](#authentication)
3. [Contract Price API](#contract-price-api)
4. [Simple Price API](#simple-price-api)
5. [Implementation](#implementation)
6. [Rate Limits](#rate-limits)
7. [Best Practices](#best-practices)
8. [Error Handling](#error-handling)

---

## 🎯 API Overview

CoinGecko provides two main pricing endpoints:

| Endpoint | Use Case | Input | Example |
|----------|----------|-------|---------|
| **Simple Price** | Native tokens by ID | Token ID (e.g., `ethereum`) | ETH, BTC, MATIC prices |
| **Contract Price** | ERC20 tokens by address | Contract address | USDC, WETH, DAI prices |

---

## 🔐 Authentication

### Free Tier (No API Key)
```typescript
const response = await fetch(
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
)
```

**Limits:**
- 10-50 calls/minute (varies)
- No guarantee of uptime
- Rate limited per IP

### Pro Tier (API Key Required)
```typescript
const headers = {
  'x-cg-pro-api-key': 'YOUR_API_KEY_HERE',
  'Accept': 'application/json',
}

const response = await fetch(
  'https://pro-api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
  { headers }
)
```

**Limits:**
- 500-10,000 calls/minute (depending on plan)
- 99.9% uptime SLA
- Priority support

**Get an API Key:** https://www.coingecko.com/en/api/pricing

---

## 🪙 Contract Price API

Fetch ERC20 token prices by contract address.

### Endpoint

```
GET /simple/token_price/{platform}
```

### Supported Platforms

| Chain ID | Platform Name | CoinGecko ID |
|----------|---------------|--------------|
| 1 | Ethereum | `ethereum` |
| 8453 | Base | `base` |
| 42161 | Arbitrum | `arbitrum-one` |
| 10 | Optimism | `optimistic-ethereum` |
| 137 | Polygon | `polygon-pos` |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contract_addresses` | string | ✅ Yes | Comma-separated contract addresses (max 100) |
| `vs_currencies` | string | ✅ Yes | Target currency (e.g., `usd`, `eur`, `btc`) |
| `include_24hr_change` | boolean | ❌ No | Include 24h price change |
| `include_market_cap` | boolean | ❌ No | Include market cap |
| `include_24hr_vol` | boolean | ❌ No | Include 24h volume |

### Example Request

```bash
# Single token (WETH on Base)
curl "https://api.coingecko.com/api/v3/simple/token_price/base?\
contract_addresses=0x4200000000000000000000000000000000000006&\
vs_currencies=usd&\
include_24hr_change=true"
```

**Response:**
```json
{
  "0x4200000000000000000000000000000000000006": {
    "usd": 2045.67,
    "usd_24h_change": 3.45
  }
}
```

### Multiple Tokens

```bash
# Multiple tokens (WETH + USDC on Base)
curl "https://api.coingecko.com/api/v3/simple/token_price/base?\
contract_addresses=0x4200000000000000000000000000000000000006,0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&\
vs_currencies=usd&\
include_24hr_change=true"
```

**Response:**
```json
{
  "0x4200000000000000000000000000000000000006": {
    "usd": 2045.67,
    "usd_24h_change": 3.45
  },
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
    "usd": 1.00,
    "usd_24h_change": 0.02
  }
}
```

### TypeScript Implementation

```typescript
interface CoinGeckoTokenPrice {
  usd?: number
  usd_24h_change?: number
  usd_market_cap?: number
  usd_24h_vol?: number
}

async function fetchTokenPrice(
  platform: string,
  contractAddress: string
): Promise<CoinGeckoTokenPrice | null> {
  const url = new URL(
    `https://api.coingecko.com/api/v3/simple/token_price/${platform}`
  )

  url.searchParams.set('contract_addresses', contractAddress.toLowerCase())
  url.searchParams.set('vs_currencies', 'usd')
  url.searchParams.set('include_24hr_change', 'true')

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }

  // Add API key if available (Pro tier)
  const apiKey = process.env.COINGECKO_API_KEY
  if (apiKey) {
    headers['x-cg-pro-api-key'] = apiKey
  }

  try {
    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!response.ok) {
      console.error(`CoinGecko error: ${response.status}`)
      return null
    }

    const data = await response.json() as Record<string, CoinGeckoTokenPrice>

    return data[contractAddress.toLowerCase()] || null
  } catch (error) {
    console.error('Failed to fetch token price:', error)
    return null
  }
}

// Usage
const wethPrice = await fetchTokenPrice(
  'base',
  '0x4200000000000000000000000000000000000006'
)

console.log(`WETH: $${wethPrice?.usd}`)
console.log(`24h Change: ${wethPrice?.usd_24h_change}%`)
```

---

## 📊 Simple Price API

Fetch native token prices by CoinGecko ID.

### Endpoint

```
GET /simple/price
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | string | ✅ Yes | Comma-separated token IDs |
| `vs_currencies` | string | ✅ Yes | Target currency |
| `include_24hr_change` | boolean | ❌ No | Include 24h price change |

### Common Token IDs

| Token | CoinGecko ID |
|-------|--------------|
| Ethereum | `ethereum` |
| Bitcoin | `bitcoin` |
| Polygon | `matic-network` |
| BNB | `binancecoin` |
| Solana | `solana` |

### Example Request

```bash
curl "https://api.coingecko.com/api/v3/simple/price?\
ids=ethereum,bitcoin&\
vs_currencies=usd,eur&\
include_24hr_change=true"
```

**Response:**
```json
{
  "ethereum": {
    "usd": 2045.67,
    "eur": 1890.23,
    "usd_24h_change": 3.45,
    "eur_24h_change": 3.12
  },
  "bitcoin": {
    "usd": 43200.50,
    "eur": 39800.10,
    "usd_24h_change": 1.23,
    "eur_24h_change": 1.15
  }
}
```

---

## 💻 Implementation

### Full Implementation (server/src/routes/prices.ts)

The implementation in `server/src/routes/prices.ts` includes:

**Features:**
- ✅ Batch processing (up to 50 addresses per request)
- ✅ Pro API key support
- ✅ 5-second timeout protection
- ✅ Graceful error handling
- ✅ Lowercase address normalization
- ✅ Type-safe response parsing

**Key Functions:**

1. **`fetchErc20Prices(platform, addresses)`**
   - Main entry point for fetching multiple ERC20 prices
   - Automatically batches addresses (50 per request)
   - Returns array of `PriceRow` objects

2. **`fetchErc20PriceBatch(platform, addresses)`**
   - Fetches a single batch from CoinGecko
   - Handles API errors gracefully
   - Normalizes addresses to lowercase

**Example Usage:**

```typescript
// Fetch multiple tokens on Base
const addresses = [
  '0x4200000000000000000000000000000000000006', // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
]

const prices = await fetchErc20Prices('base', addresses)

prices.forEach(price => {
  console.log(`${price.address}: $${price.priceUsd} (${price.change24hPercent}%)`)
})
```

---

## ⏱️ Rate Limits

### Free Tier

| Plan | Calls/Minute | Daily Limit |
|------|--------------|-------------|
| Free | 10-50 | ~14,000 |

**Tips:**
- Cache responses (15-60 seconds)
- Use batch requests (max 100 addresses)
- Implement exponential backoff

### Pro Tier

| Plan | Calls/Minute | Daily Limit | Price |
|------|--------------|-------------|-------|
| Analyst | 500 | 720,000 | $129/mo |
| Lite | 1,000 | 1,440,000 | $249/mo |
| Pro | 10,000 | 14,400,000 | $999/mo |

---

## ✅ Best Practices

### 1. Use Batch Requests

```typescript
// ❌ Bad - Multiple requests
for (const address of addresses) {
  await fetchTokenPrice('base', address)
}

// ✅ Good - Single batch request
const prices = await fetchErc20Prices('base', addresses)
```

### 2. Implement Caching

```typescript
const cache = new Map<string, { price: number; timestamp: number }>()
const CACHE_TTL = 60_000 // 60 seconds

function getCachedPrice(address: string): number | null {
  const cached = cache.get(address)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price
  }
  return null
}

function setCachedPrice(address: string, price: number): void {
  cache.set(address, { price, timestamp: Date.now() })
}
```

### 3. Handle Rate Limits

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options)

    if (response.status === 429) {
      // Rate limited - wait and retry
      const delay = Math.pow(2, i) * 1000 // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }

    return response
  }

  throw new Error('Max retries exceeded')
}
```

### 4. Normalize Addresses

```typescript
// Always lowercase addresses for CoinGecko
const normalizedAddress = address.toLowerCase()
```

### 5. Use Timeouts

```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(5000), // 5s timeout
})
```

---

## 🛡️ Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `404` | Invalid contract address | Verify address exists on chain |
| `429` | Rate limit exceeded | Implement caching + backoff |
| `500` | CoinGecko server error | Retry with exponential backoff |
| `503` | Service unavailable | Use fallback data source |

### Implementation

```typescript
try {
  const response = await fetch(url, { headers, signal })

  if (!response.ok) {
    if (response.status === 429) {
      // Rate limited
      console.warn('Rate limited by CoinGecko')
      return [] // Return empty array (graceful degradation)
    }

    if (response.status === 404) {
      // Token not found
      console.error('Token not found on CoinGecko')
      return []
    }

    // Other errors
    console.error(`CoinGecko error: ${response.status}`)
    return []
  }

  const data = await response.json()
  return parsePriceData(data)
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    console.error('Request timeout')
  } else {
    console.error('Fetch failed:', error)
  }
  return [] // Graceful degradation
}
```

---

## 📚 Additional Resources

- [CoinGecko API Docs](https://www.coingecko.com/en/api/documentation)
- [Contract Price API](https://www.coingecko.com/en/api/documentation#operation/simple_token_price__id_)
- [Simple Price API](https://www.coingecko.com/en/api/documentation#operation/simple_price)
- [API Pricing](https://www.coingecko.com/en/api/pricing)
- [Rate Limits](https://support.coingecko.com/hc/en-us/articles/21880397454233-User-s-API-Key-Rate-Limits)

---

## 🧪 Testing

### Test with cURL

```bash
# Test contract price API
curl "https://api.coingecko.com/api/v3/simple/token_price/base?\
contract_addresses=0x4200000000000000000000000000000000000006&\
vs_currencies=usd&\
include_24hr_change=true"

# Test simple price API
curl "https://api.coingecko.com/api/v3/simple/price?\
ids=ethereum&\
vs_currencies=usd&\
include_24hr_change=true"
```

### Test with TypeScript

```typescript
// Test the implementation
import { fetchErc20Prices } from './server/src/routes/prices'

const addresses = [
  '0x4200000000000000000000000000000000000006', // WETH on Base
]

const prices = await fetchErc20Prices('base', addresses)
console.log('Prices:', prices)
```

---

**Built with ❤️ for Shaggy Dogg DEX**
