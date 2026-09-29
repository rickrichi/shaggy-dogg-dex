// server/src/routes/cedefi.ts
import { LUMIORO_TOKEN, USDC_TOKEN } from '../config/lumioro-token.js';

import type { Hono } from 'hono';

export interface CeDeFiChainInfo {
  chainId: number;
  name: string;
  symbol: string;
}

export interface CeDeFiStatusResponse {
  ok: boolean;
  service: string;
  role: string;
  version: string;
  chains: CeDeFiChainInfo[];
  tokens: {
    lumioro: {
      symbol: string;
      /** Chain 1. The deployed, independently reviewed LUMIORO token. */
      ethereumMainnet: string;
      /**
       * Chain 8453. Always null — LUMIORO is not deployed on Base Mainnet.
       * Consumers must refuse rather than substitute another chain's address.
       */
      baseMainnet: string | null;
      /** Chain 84532. */
      baseSepolia: string;
      decimals: number;
    };
    usdc: {
      symbol: string;
      baseMainnet: string;
      decimals: number;
    };
  };
  settlementAsset: string;
  timestamp: number;
}

export function mountCeDeFiRoutes(app: Hono): void {
  // GET /api/cedefi/status - Health & configuration for CeDeFi bridges (e.g. Lumioro Desk & decentralized observers)
  app.get('/api/cedefi/status', (c) => {
    const response: CeDeFiStatusResponse = {
      ok: true,
      service: 'shaggy-dogg-dex',
      role: 'CeDeFi Bridge Endpoint',
      version: '1.0.0',
      chains: [
        { chainId: 8453, name: 'Base Mainnet', symbol: 'ETH' },
        { chainId: 84532, name: 'Base Sepolia', symbol: 'ETH' },
        { chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH' },
      ],
      tokens: {
        lumioro: {
          symbol: LUMIORO_TOKEN.symbol,
          ethereumMainnet: LUMIORO_TOKEN.ethereumMainnet,
          baseMainnet: LUMIORO_TOKEN.baseMainnet,
          baseSepolia: LUMIORO_TOKEN.baseSepolia,
          decimals: LUMIORO_TOKEN.decimals,
        },
        usdc: {
          symbol: USDC_TOKEN.symbol,
          baseMainnet: USDC_TOKEN.baseMainnet,
          decimals: USDC_TOKEN.decimals,
        },
      },
      settlementAsset: 'USDC',
      timestamp: Date.now(),
    };
    return c.json(response);
  });

  // GET /api/cedefi/quote?symbol=ETH&amountUsd=1000&side=buy
  app.get('/api/cedefi/quote', async (c) => {
    const rawSymbol = (c.req.query('symbol') || '').trim().toUpperCase();
    const cleanSymbol = rawSymbol.replace(/\/USD$/, '').replace(/-USD$/, '');
    const side = (c.req.query('side') || 'buy').trim().toLowerCase();
    const amountUsd = parseFloat(c.req.query('amountUsd') || '100');

    if (!cleanSymbol) {
      return c.json({ ok: false, error: 'symbol is required' }, 400);
    }

    if (isNaN(amountUsd) || amountUsd <= 0) {
      return c.json({ ok: false, error: 'valid amountUsd is required' }, 400);
    }

    const noObservedPrice = (detail: string) =>
      c.json(
        {
          ok: false,
          symbol: cleanSymbol,
          error: 'No observed market price is available for this symbol',
          reason: 'NO_OBSERVED_PRICE',
          detail,
        },
        409
      );

    // LUMIORO is deliberately not quoted here. It has no configured, verified
    // market pool on Ethereum Mainnet and is not deployed on Base Mainnet. Its
    // pro-rata redemption reserve is not a DEX market price, so neither a
    // reserve read nor a fixed "NAV peg" is an acceptable substitute. A future
    // listing must provide verified, chain-qualified pool evidence and use an
    // executable pool or aggregator quote before this symbol becomes available.
    if (cleanSymbol === LUMIORO_TOKEN.symbol || cleanSymbol === 'LUMI') {
      return noObservedPrice(
        'LUMIORO has no configured, verified market pool on this endpoint. ' +
          'The endpoint will not substitute a redemption value or a fixed price.'
      );
    }

    // Use an observed reference price only. This bridge never substitutes a
    // heuristic value when its price source does not have one.
    let priceUsd = 0;
    let change24h = 0;

    // Query the internal observed-price endpoint.
    try {
      const priceRes = await app.request(`/api/prices?symbol=${cleanSymbol}`);
      if (priceRes.ok) {
        const data = (await priceRes.json()) as { priceUsd?: number; change24hPercent?: number };
        priceUsd = data.priceUsd ?? 0;
        change24h = data.change24hPercent ?? 0;
      }
    } catch {
      // graceful degradation
    }

    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      return noObservedPrice(
        'The configured price source did not return a positive observed price. ' +
          'The endpoint will not synthesize a fallback value.'
      );
    }

    // DEX AMM simulation: 0.3% pool fee + 0.1% estimated slippage for $1000
    const poolFeeRate = 0.003;
    const slippageRate = Math.min(0.01, (amountUsd / 100_000) * 0.001);
    const estimatedGasUsd = 0.08; // Base L2 gas fee in USD equivalent

    const effectivePrice = side === 'buy'
      ? priceUsd * (1 + poolFeeRate + slippageRate)
      : priceUsd * (1 - poolFeeRate - slippageRate);

    const estimatedUnits = amountUsd / effectivePrice;

    return c.json({
      ok: true,
      symbol: cleanSymbol,
      side,
      amountUsd,
      spotPriceUsd: priceUsd,
      effectiveDexPriceUsd: effectivePrice,
      estimatedUnits,
      change24hPercent: change24h,
      feeBreakdown: {
        poolFeeUsd: amountUsd * poolFeeRate,
        estimatedSlippageUsd: amountUsd * slippageRate,
        networkGasUsd: estimatedGasUsd,
        totalFrictionUsd: (amountUsd * (poolFeeRate + slippageRate)) + estimatedGasUsd,
      },
      chainId: 8453,
      dexVenue: 'ShaggyDogg UniswapV3 / 0x Aggregator on Base',
      timestamp: Date.now(),
    });
  });
}
