// src/test/mockData.ts - Mock data for tests
import type { Address } from "viem";
import type { Token } from "@/config/tokens";

// ══════════════════════════════════════════════════════════════════════════════
// MOCK TOKENS
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_ETH: Token = {
  kind: "native",
  address: "native",
  symbol: "ETH",
  name: "Ethereum",
  decimals: 18,
  chainId: 1,
  logoURI: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
} as const;

export const MOCK_USDC: Token = {
  kind: "erc20",
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  chainId: 1,
  logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
} as const;

export const MOCK_USDT: Token = {
  kind: "erc20",
  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
  symbol: "USDT",
  name: "Tether USD",
  decimals: 6,
  chainId: 1,
  logoURI: "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png",
} as const;

export const MOCK_DAI: Token = {
  kind: "erc20",
  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
  symbol: "DAI",
  name: "Dai Stablecoin",
  decimals: 18,
  chainId: 1,
  logoURI: "https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png",
} as const;

export const MOCK_WBTC: Token = {
  kind: "erc20",
  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
  symbol: "WBTC",
  name: "Wrapped BTC",
  decimals: 8,
  chainId: 1,
  logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
} as const;

export const MOCK_TOKENS = [MOCK_ETH, MOCK_USDC, MOCK_USDT, MOCK_DAI, MOCK_WBTC] as const;

// ══════════════════════════════════════════════════════════════════════════════
// MOCK ADDRESSES
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_USER_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;
export const MOCK_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address;
export const MOCK_PAIR_ADDRESS = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc" as Address;

// ══════════════════════════════════════════════════════════════════════════════
// MOCK BALANCES
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_ETH_BALANCE = {
  value: BigInt("5000000000000000000"), // 5 ETH
  decimals: 18,
  formatted: "5.0",
  symbol: "ETH",
};

export const MOCK_USDC_BALANCE = {
  value: BigInt("10000000000"), // 10,000 USDC (6 decimals)
  decimals: 6,
  formatted: "10000.0",
  symbol: "USDC",
};

// ══════════════════════════════════════════════════════════════════════════════
// MOCK QUOTES
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_QUOTE_RESPONSE = {
  success: true,
  data: {
    amountsOut: [
      BigInt("1000000000000000000"), // 1 ETH in
      BigInt("2650000000"), // 2650 USDC out
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MOCK POOL DATA
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_POOL_RESERVES = [
  BigInt("50000000000000000000000"), // 50,000 ETH
  BigInt("132500000000000"), // 132,500,000 USDC
  1234567890, // timestamp
] as const;

export const MOCK_LP_BALANCE = BigInt("1000000000000000000"); // 1 LP token

export const MOCK_TOTAL_SUPPLY = BigInt("100000000000000000000000"); // 100,000 LP tokens

// ══════════════════════════════════════════════════════════════════════════════
// MOCK TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_TX_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;

export const MOCK_TX_RECEIPT = {
  transactionHash: MOCK_TX_HASH,
  blockNumber: BigInt(12345678),
  status: "success" as const,
  gasUsed: BigInt(150000),
};

// ══════════════════════════════════════════════════════════════════════════════
// MOCK PRICE DATA
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_PRICE_DATA = {
  success: true,
  data: {
    prices: [
      {
        address: MOCK_ETH.address,
        priceUsd: 2650.5,
        change24hPercent: 2.5,
        symbol: "ETH",
      },
      {
        address: MOCK_USDC.address,
        priceUsd: 1.0,
        change24hPercent: 0.01,
        symbol: "USDC",
      },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MOCK ANALYTICS EVENTS
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_SWAP_EVENT = {
  event: "swap_completed",
  properties: {
    from_token: "ETH",
    to_token: "USDC",
    from_amount: "1.0",
    to_amount: "2650.50",
    chain_id: 1,
    tx_hash: MOCK_TX_HASH,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MOCK ERROR RESPONSES
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_ERROR_RESPONSE = {
  success: false,
  error: "Insufficient liquidity",
  chainId: 1,
};

export const MOCK_NETWORK_ERROR = new Error("Network request failed");

// ══════════════════════════════════════════════════════════════════════════════
// MOCK FORM VALUES
// ══════════════════════════════════════════════════════════════════════════════

export const MOCK_SWAP_FORM = {
  sellAmount: "1.0",
  buyAmount: "2650.50",
  sellToken: MOCK_ETH,
  buyToken: MOCK_USDC,
  slippage: 0.5,
};

export const MOCK_LIQUIDITY_FORM = {
  amountA: "1.0",
  amountB: "2650.50",
  tokenA: MOCK_ETH,
  tokenB: MOCK_USDC,
};

export const MOCK_LIMIT_ORDER_FORM = {
  sellAmount: "1.0",
  limitPrice: "2700.00",
  expiry: "24h" as const,
  sellToken: MOCK_ETH,
  buyToken: MOCK_USDC,
};
