# 🚀 Shaggy Dogg DEX - API Documentation

Production-ready **Vercel Edge Functions** for fast, globally-distributed API access.

## 📁 Structure

```
/api
├── index.ts              # API documentation page (GET /api)
├── health.ts             # Health check endpoint
├── price/
│   └── [symbol].ts       # Token price lookup (dynamic route)
└── gas/
    └── [chainId].ts      # Gas price oracle (dynamic route)
```

---

## 🔗 Endpoints

### 1. **Health Check**

#### `GET /api/health`
Basic health status for monitoring and uptime checks.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1700000000000,
  "version": "1.0.0"
}
```

#### `GET /api/health?detailed=true`
Detailed health information including service status.

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

**Status Codes:**
- `200` - All systems operational
- `503` - Service degraded or down

---

### 2. **Token Price API**

#### `GET /api/price/[symbol]`
Get real-time token price with 60-second CDN caching.

**Supported Symbols:**
- `ETH`, `BTC`, `MATIC`, `USDT`, `USDC`, `DAI`, `WETH`, `WBTC`
- `UNI`, `LINK`, `AAVE`, `SUSHI`, `CRV`, `SNX`, `MKR`, `COMP`
- `YFI`, `BAL`, `1INCH`, `LDO`

**Parameters:**
- `currency` (optional) - Target currency: `usd`, `eur`, `gbp`, `jpy`, `cny`, `btc`, `eth`
  - Default: `usd`

**Examples:**
```bash
# Get ETH price in USD
GET /api/price/ETH

# Get BTC price in EUR
GET /api/price/BTC?currency=eur

# Get MATIC price in GBP
GET /api/price/MATIC?currency=gbp
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

**Features:**
- ✅ Global edge deployment (low latency)
- ✅ Automatic CDN caching (60s, stale-while-revalidate 120s)
- ✅ Fallback to backup data sources
- ✅ 24h price change percentage
- ✅ CORS enabled

**Status Codes:**
- `200` - Success
- `400` - Invalid symbol or currency
- `500` - Price fetch failed

---

### 3. **Gas Oracle API**

#### `GET /api/gas/[chainId]`
Real-time gas price estimates with USD cost calculations.

**Supported Chains:**
| Chain ID | Network | Explorer API |
|----------|---------|--------------|
| `1` | Ethereum Mainnet | ✅ Etherscan |
| `8453` | Base | ✅ Basescan |
| `42161` | Arbitrum One | ✅ Arbiscan |
| `10` | Optimism | ✅ Optimistic Etherscan |
| `137` | Polygon | ✅ Polygonscan |
| `11155111` | Sepolia Testnet | ⚠️ RPC Fallback |

**Examples:**
```bash
# Get Ethereum gas prices
GET /api/gas/1

# Get Base gas prices
GET /api/gas/8453

# Get Arbitrum gas prices
GET /api/gas/42161
```

**Response:**
```json
{
  "chainId": 1,
  "chainName": "Ethereum",
  "timestamp": 1700000000000,
  "blockNumber": 18500000,
  "prices": {
    "slow": {
      "maxFee": "25.5",
      "maxPriorityFee": "1.0"
    },
    "standard": {
      "maxFee": "30.2",
      "maxPriorityFee": "1.5"
    },
    "fast": {
      "maxFee": "35.8",
      "maxPriorityFee": "2.0"
    }
  },
  "baseFee": "28.7",
  "priorityFee": "1.5",
  "estimatedCosts": {
    "transfer": {
      "eth": "0.000634",
      "usd": "1.29"
    },
    "swap": {
      "eth": "0.004530",
      "usd": "9.23"
    }
  }
}
```

**Features:**
- ✅ EIP-1559 support (baseFee + priorityFee)
- ✅ Legacy gas price fallback
- ✅ USD cost estimates for common operations
- ✅ Multiple data sources (Explorer API → RPC fallback)
- ✅ 10-second caching with stale-while-revalidate
- ✅ CORS enabled

**Cost Estimates:**
- **Transfer**: Simple ETH transfer (21,000 gas)
- **Swap**: Typical DEX swap (150,000 gas)

**Status Codes:**
- `200` - Success
- `400` - Invalid chain ID
- `500` - Gas price fetch failed

---

## 🛠️ Local Development

### Prerequisites
- Node.js 20+
- Vercel CLI (optional for local testing)

### Install Vercel CLI
```bash
npm install -g vercel
```

### Run Locally
```bash
# From project root
vercel dev
```

This starts a local development server at `http://localhost:5173` for the Vite app.

**Test Endpoints:**
```bash
# Health check
curl http://localhost:5173/api/health

# Get ETH price
curl http://localhost:5173/api/price/ETH

# Get Ethereum gas prices
curl http://localhost:5173/api/gas/1
```

---

## 🌍 Deployment

### Automatic Deployment (Vercel)

1. **Connect Repository**
   ```bash
   vercel link
   ```

2. **Set Environment Variables**

   In Vercel Dashboard → Settings → Environment Variables:
   ```
   COINGECKO_API_KEY=your_coingecko_api_key
   VITE_API_URL=https://your-backend-url.com
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

### Manual Deployment
```bash
# Deploy to production
vercel --prod

# Deploy to preview
vercel
```

---

## 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COINGECKO_API_KEY` | Recommended | CoinGecko Pro API key for higher rate limits |
| `VITE_COINGECKO_API_KEY` | Fallback | Alternative CoinGecko key |
| `VITE_API_URL` | Optional | Backend API URL for health checks |
| `API_URL` | Optional | Alternative backend URL |

**Note:** Without API keys, endpoints fall back to public APIs with lower rate limits.

---

## 📊 Performance

### Caching Strategy

| Endpoint | Cache Duration | Stale-While-Revalidate |
|----------|----------------|------------------------|
| `/api/health` | No cache | - |
| `/api/price/*` | 60 seconds | 120 seconds |
| `/api/gas/*` | 10 seconds | 30 seconds |

### Global Distribution
- ✅ Deployed to **Vercel Edge Network** (70+ regions)
- ✅ Automatic CDN caching
- ✅ Sub-100ms latency worldwide

---

## 🔒 Security

### CORS Configuration
All endpoints have CORS enabled:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Rate Limiting
- Inherits Vercel's built-in rate limiting
- CoinGecko API: 10-50 calls/minute (depending on plan)
- Explorer APIs: Varies by provider

### Best Practices
- ✅ API keys stored as environment variables
- ✅ No sensitive data in responses
- ✅ Timeout protection (3-5s)
- ✅ Error handling with safe fallbacks

---

## 🐛 Error Handling

All endpoints return consistent error format:

```json
{
  "error": "Bad Request",
  "message": "Invalid symbol: XYZ",
  "timestamp": 1700000000000,
  "chainId": 1  // Only for gas oracle
}
```

**Common Error Codes:**
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (invalid route)
- `500` - Internal Server Error (upstream failure)
- `503` - Service Unavailable (health check failure)

---

## 📝 Usage Examples

### React/TypeScript Integration

```typescript
// Fetch ETH price
const getEthPrice = async () => {
  const response = await fetch('/api/price/ETH')
  const data = await response.json()
  return data.price
}

// Fetch gas prices for Ethereum
const getGasPrices = async (chainId: number) => {
  const response = await fetch(`/api/gas/${chainId}`)
  const data = await response.json()
  return data.prices.standard.maxFee
}

// Health check
const checkHealth = async () => {
  const response = await fetch('/api/health?detailed=true')
  const data = await response.json()
  return data.status === 'ok'
}
```

### Frontend Hook Example

```typescript
import { useEffect, useState } from 'react'

export function useGasPrice(chainId: number) {
  const [gasPrice, setGasPrice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/gas/${chainId}`)
      .then(res => res.json())
      .then(data => {
        setGasPrice(data.prices.standard.maxFee)
        setLoading(false)
      })
      .catch(err => {
        console.error('Gas price fetch failed:', err)
        setLoading(false)
      })
  }, [chainId])

  return { gasPrice, loading }
}
```

---

## 🧪 Testing

```bash
# Test all endpoints
curl https://your-domain.vercel.app/api/health
curl https://your-domain.vercel.app/api/price/ETH
curl https://your-domain.vercel.app/api/gas/1

# Test with parameters
curl "https://your-domain.vercel.app/api/price/BTC?currency=eur"
curl "https://your-domain.vercel.app/api/health?detailed=true"
```

---

## 🎯 Roadmap

Future enhancements:
- [ ] WebSocket support for real-time price updates
- [ ] Historical price data endpoints
- [ ] Token metadata cache endpoint
- [ ] Multi-token batch price fetching
- [ ] Analytics event collector
- [ ] CORS proxy for restricted APIs

---

## 📚 Additional Resources

- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [CoinGecko API Docs](https://www.coingecko.com/en/api)
- [Etherscan Gas Tracker API](https://docs.etherscan.io/api-endpoints/gas-tracker)

---

## 🤝 Contributing

Improvements welcome! Please:
1. Test locally with `vercel dev`
2. Ensure TypeScript types are correct
3. Add error handling
4. Update this README

---

**Built with ❤️ for Shaggy Dogg DEX**
