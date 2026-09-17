# API Integration Guide - Shaggy Dogg DEX

Complete guide to integrating Vercel Edge Functions with the React frontend.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Available APIs](#available-apis)
3. [React Hooks](#react-hooks)
4. [Usage Examples](#usage-examples)
5. [Best Practices](#best-practices)
6. [Error Handling](#error-handling)
7. [Performance Optimization](#performance-optimization)

---

## 🎯 Overview

The Shaggy Dogg DEX uses **Vercel Edge Functions** deployed globally for:
- ⚡ Ultra-low latency (sub-100ms worldwide)
- 🌍 CDN caching for optimal performance
- 🔄 Automatic stale-while-revalidate
- 🛡️ Built-in CORS and security headers

All API endpoints are available at `/api/*` and are automatically deployed with the frontend.

---

## 📡 Available APIs

### 1. Health Check API

**Endpoint:** `GET /api/health`

Monitor API health and service status.

```typescript
// Basic health check
fetch('/api/health')

// Detailed health check
fetch('/api/health?detailed=true')
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1700000000000,
  "version": "1.0.0",
  "uptime": 3600000,
  "region": "iad1",
  "latency": 123,
  "services": {
    "api": "operational",
    "database": "operational"
  }
}
```

**Cache:** No cache (real-time status)

---

### 2. Token Price API

**Endpoint:** `GET /api/price/[symbol]`

Get real-time token prices with 24h change.

**Supported Symbols:**
- `ETH`, `BTC`, `MATIC`, `USDT`, `USDC`, `DAI`
- `WETH`, `WBTC`, `UNI`, `LINK`, `AAVE`, `SUSHI`
- `CRV`, `SNX`, `MKR`, `COMP`, `YFI`, `BAL`, `1INCH`, `LDO`

**Supported Currencies:**
- `usd`, `eur`, `gbp`, `jpy`, `cny`, `btc`, `eth`

```typescript
// Get ETH price in USD
fetch('/api/price/ETH')

// Get BTC price in EUR
fetch('/api/price/BTC?currency=eur')
```

**Response:**
```json
{
  "symbol": "ETH",
  "price": 2045.67,
  "currency": "USD",
  "timestamp": 1700000000000,
  "change24h": 3.45,
  "source": "coingecko"
}
```

**Cache:** 60 seconds (stale-while-revalidate: 120s)

---

### 3. Gas Oracle API

**Endpoint:** `GET /api/gas/[chainId]`

Get real-time gas price estimates with USD costs.

**Supported Chains:**
- `1` - Ethereum Mainnet
- `8453` - Base
- `42161` - Arbitrum One
- `10` - Optimism
- `137` - Polygon
- `11155111` - Sepolia Testnet

```typescript
// Get Ethereum gas prices
fetch('/api/gas/1')

// Get Base gas prices
fetch('/api/gas/8453')
```

**Response:**
```json
{
  "chainId": 1,
  "chainName": "Ethereum",
  "timestamp": 1700000000000,
  "prices": {
    "slow": { "maxFee": "25.5", "maxPriorityFee": "1.0" },
    "standard": { "maxFee": "30.2", "maxPriorityFee": "1.5" },
    "fast": { "maxFee": "35.8", "maxPriorityFee": "2.0" }
  },
  "baseFee": "28.7",
  "priorityFee": "1.5",
  "estimatedCosts": {
    "transfer": { "eth": "0.000634", "usd": "1.29" },
    "swap": { "eth": "0.004530", "usd": "9.23" }
  }
}
```

**Cache:** 10 seconds (stale-while-revalidate: 30s)

---

## 🪝 React Hooks

### useTokenPrice

Fetch token prices with automatic refresh and caching.

**Import:**
```typescript
import { useTokenPrice } from '@/hooks'
```

**Basic Usage:**
```typescript
const { price, change24h, loading, error } = useTokenPrice('ETH')
```

**Advanced Usage:**
```typescript
const {
  price,
  change24h,
  loading,
  error,
  refresh,
  lastUpdate,
} = useTokenPrice('BTC', {
  currency: 'eur',          // Default: 'usd'
  refreshInterval: 30000,   // Default: 60000 (60s)
  enabled: true,            // Default: true
})
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `currency` | `'usd' \| 'eur' \| 'gbp' \| 'jpy' \| 'cny' \| 'btc' \| 'eth'` | `'usd'` | Target currency |
| `refreshInterval` | `number` | `60000` | Auto-refresh interval (ms), 0 to disable |
| `enabled` | `boolean` | `true` | Enable/disable hook |

**Return Values:**

| Property | Type | Description |
|----------|------|-------------|
| `data` | `TokenPriceData \| null` | Complete price data |
| `price` | `number \| null` | Current price |
| `change24h` | `number \| null` | 24h change percentage |
| `loading` | `boolean` | Loading state |
| `error` | `Error \| null` | Error state |
| `refresh` | `() => Promise<void>` | Manual refresh function |
| `lastUpdate` | `number \| null` | Last update timestamp |

---

### useTokenPrices

Fetch multiple token prices efficiently.

**Usage:**
```typescript
import { useTokenPrices } from '@/hooks'

const prices = useTokenPrices(['ETH', 'BTC', 'MATIC'], {
  currency: 'usd',
  refreshInterval: 60000,
})

// Access individual prices
const ethPrice = prices['ETH']?.price
const btcPrice = prices['BTC']?.price
```

---

### useGasPrice

Fetch gas price estimates with automatic refresh.

**Import:**
```typescript
import { useGasPrice, SUPPORTED_CHAINS } from '@/hooks'
```

**Basic Usage:**
```typescript
const { selectedPrice, estimatedCosts, loading } = useGasPrice(1)
```

**Advanced Usage:**
```typescript
const {
  data,
  prices,
  selectedPrice,
  estimatedCosts,
  baseFee,
  priorityFee,
  loading,
  error,
  refresh,
} = useGasPrice(1, {
  speed: 'standard',        // Default: 'standard'
  refreshInterval: 10000,   // Default: 10000 (10s)
  enabled: true,            // Default: true
})
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `speed` | `'slow' \| 'standard' \| 'fast'` | `'standard'` | Gas speed preference |
| `refreshInterval` | `number` | `10000` | Auto-refresh interval (ms) |
| `enabled` | `boolean` | `true` | Enable/disable hook |

**Return Values:**

| Property | Type | Description |
|----------|------|-------------|
| `data` | `GasEstimate \| null` | Complete gas estimate |
| `prices` | `GasEstimate['prices'] \| null` | All gas prices (slow/standard/fast) |
| `selectedPrice` | `GasPrice \| null` | Selected price based on speed |
| `estimatedCosts` | `CostEstimate \| null` | USD cost estimates |
| `baseFee` | `string \| null` | Base fee (EIP-1559) |
| `priorityFee` | `string \| null` | Priority fee (EIP-1559) |

---

### useFormattedGasPrice

Convenience hook for formatted gas prices.

**Usage:**
```typescript
import { useFormattedGasPrice } from '@/hooks'

const {
  gwei,           // "30.2"
  transferEth,    // "0.000634"
  transferUsd,    // "1.29"
  swapEth,        // "0.004530"
  swapUsd,        // "9.23"
  display,        // "30.2 Gwei"
} = useFormattedGasPrice(1, 'standard')
```

---

### useHealthCheck

Monitor API health with automatic polling.

**Import:**
```typescript
import { useHealthCheck } from '@/hooks'
```

**Basic Usage:**
```typescript
const { status, isHealthy } = useHealthCheck()
```

**Advanced Usage:**
```typescript
const {
  data,
  status,
  services,
  latency,
  uptime,
  region,
  version,
  loading,
  error,
  refresh,
  isHealthy,
} = useHealthCheck({
  detailed: true,
  refreshInterval: 30000,
  enabled: true,
  onStatusChange: (status) => {
    if (status !== 'ok') {
      console.warn('API health degraded:', status)
    }
  },
})
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `detailed` | `boolean` | `false` | Fetch detailed health info |
| `refreshInterval` | `number` | `30000` | Auto-refresh interval (ms) |
| `enabled` | `boolean` | `true` | Enable/disable hook |
| `onStatusChange` | `(status: HealthStatus) => void` | - | Callback on status change |

---

## 💡 Usage Examples

### 1. Display Token Price with Auto-Refresh

```typescript
import { useTokenPrice } from '@/hooks'

function TokenPrice({ symbol }: { symbol: string }) {
  const { price, change24h, loading } = useTokenPrice(symbol)

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <span className="text-2xl font-bold">
        ${price?.toLocaleString()}
      </span>
      {change24h && (
        <span className={change24h >= 0 ? 'text-green-500' : 'text-red-500'}>
          {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
        </span>
      )}
    </div>
  )
}
```

---

### 2. Show Gas Costs Before Transaction

```typescript
import { useGasPrice } from '@/hooks'

function GasEstimator({ chainId }: { chainId: number }) {
  const { estimatedCosts, selectedPrice, loading } = useGasPrice(chainId, {
    speed: 'standard',
  })

  if (loading) return <div>Calculating gas...</div>

  return (
    <div>
      <p>Gas Price: {selectedPrice?.maxFee} Gwei</p>
      <p>Estimated Cost: ${estimatedCosts?.swap.usd}</p>
    </div>
  )
}
```

---

### 3. Multi-Chain Gas Comparison

```typescript
import { useMultiChainGasPrices } from '@/hooks'

function GasComparison() {
  const chains = [1, 8453, 42161, 10, 137] // Ethereum, Base, Arbitrum, Optimism, Polygon
  const gasPrices = useMultiChainGasPrices(chains, { speed: 'standard' })

  return (
    <div>
      {chains.map((chainId) => {
        const gas = gasPrices[chainId]
        return (
          <div key={chainId}>
            <span>{gas?.data?.chainName}</span>
            <span>{gas?.selectedPrice?.maxFee} Gwei</span>
          </div>
        )
      })}
    </div>
  )
}
```

---

### 4. Health Status Indicator

```typescript
import { useHealthCheck } from '@/hooks'

function HealthIndicator() {
  const { status, isHealthy, services } = useHealthCheck({ detailed: true })

  return (
    <div className={isHealthy ? 'text-green-500' : 'text-red-500'}>
      API: {status}
      {services && (
        <div className="text-sm">
          <div>API: {services.api}</div>
          <div>DB: {services.database}</div>
        </div>
      )}
    </div>
  )
}
```

---

### 5. Real-Time Price Dashboard

```typescript
import { useTokenPrices } from '@/hooks'

function PriceDashboard() {
  const tokens = ['ETH', 'BTC', 'MATIC', 'UNI', 'LINK']
  const prices = useTokenPrices(tokens, { refreshInterval: 30000 })

  return (
    <div className="grid grid-cols-2 gap-4">
      {tokens.map((symbol) => {
        const token = prices[symbol]
        return (
          <div key={symbol} className="p-4 border rounded">
            <h3 className="font-bold">{symbol}</h3>
            {token?.loading ? (
              <p>Loading...</p>
            ) : (
              <>
                <p className="text-2xl">${token?.price?.toLocaleString()}</p>
                <p className={token?.change24h && token.change24h >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {token?.change24h?.toFixed(2)}%
                </p>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

---

## ⚡ Best Practices

### 1. Optimize Refresh Intervals

Match refresh intervals to cache durations:
- **Token prices:** 60s (matches Edge Function cache)
- **Gas prices:** 10s (matches Edge Function cache)
- **Health checks:** 30s (no cache, but don't spam)

```typescript
// ✅ Good - matches cache
useTokenPrice('ETH', { refreshInterval: 60000 })
useGasPrice(1, { refreshInterval: 10000 })

// ❌ Bad - too frequent, wastes resources
useTokenPrice('ETH', { refreshInterval: 1000 })
```

---

### 2. Disable When Not Visible

Stop polling when component is not visible:

```typescript
import { useEffect, useState } from 'react'
import { useTokenPrice } from '@/hooks'

function TokenPrice() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const { price } = useTokenPrice('ETH', { enabled: isVisible })

  return <div>${price}</div>
}
```

---

### 3. Batch Multiple Tokens

Use `useTokenPrices` instead of multiple `useTokenPrice` calls:

```typescript
// ❌ Bad - 3 separate requests
const eth = useTokenPrice('ETH')
const btc = useTokenPrice('BTC')
const matic = useTokenPrice('MATIC')

// ✅ Good - single batch request
const prices = useTokenPrices(['ETH', 'BTC', 'MATIC'])
```

---

### 4. Handle Errors Gracefully

Always handle error states:

```typescript
const { price, error, loading } = useTokenPrice('ETH')

if (loading) return <Spinner />
if (error) return <div>Price unavailable</div>
return <div>${price}</div>
```

---

## 🛡️ Error Handling

All hooks return an `error` property. Common error types:

### Network Errors
```typescript
const { error } = useTokenPrice('ETH')

if (error?.message.includes('Failed to fetch')) {
  // Network is offline or request was blocked
}
```

### API Errors
```typescript
const { error } = useGasPrice(999) // Invalid chain ID

if (error?.message.includes('API error: 400')) {
  // Bad request - invalid parameters
}
```

### Timeout Errors
Edge Functions have built-in timeouts (3-5s). Requests automatically fail if upstream APIs are slow.

---

## 🚀 Performance Optimization

### 1. CDN Caching

All Edge Functions use CDN caching:
- **Token prices:** Cached for 60s globally
- **Gas prices:** Cached for 10s globally
- Stale-while-revalidate extends cache lifetime

### 2. Edge Deployment

Edge Functions run at the edge location closest to the user:
- **North America:** <50ms
- **Europe:** <30ms
- **Asia:** <80ms

### 3. Request Deduplication

React hooks automatically deduplicate requests:
```typescript
// Multiple components using the same hook = single request
function Component1() {
  const { price } = useTokenPrice('ETH')
  return <div>{price}</div>
}

function Component2() {
  const { price } = useTokenPrice('ETH') // Reuses same request
  return <div>{price}</div>
}
```

---

## 📚 Additional Resources

- [Vercel Edge Functions Docs](https://vercel.com/docs/functions/edge-functions)
- [API Implementation Guide](/api/README.md)
- [Example Component](/src/components/ApiExample.tsx)

---

**Built with ❤️ for Shaggy Dogg DEX**
