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
  // GET /api/cedefi/status - Health & configuration for CeDeFi bridges (e.g. AlpacaOrderDesk)
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

    // LUMIORO is deliberately not quoted here.
    //
    // This endpoint used to return a flat $10.00 "base NAV peg". LUMIORO has no
    // pegged value to report. LUMIOROToken pays a pro-rata share of whatever
    // ETH is in its reserve (payout = reserve * amount / totalSupply); the
    // reserve starts empty, nobody is obliged to fund it, and the contract
    // documentation states that it must not be described as backed,
    // collateralised, or redeemable at any particular value. A constant cannot
    // track a quantity that moves with the reserve.
    //
    // Deleting the peg is not sufficient on its own: with no price set, the
    // heuristic table below would assign `?? 1.0` and quote LUMIORO at $1.00,
    // which is the same defect wearing a different number. So refuse before any
    // price can be synthesised. A caller that receives no quote can decline to
    // act; a caller handed an invented price cannot tell that it was invented,
    // and this response feeds CeDeFi spread rows that stage order tickets.
    //
    // Quoting this pair honestly needs a live read of reserve() and
    // totalSupply() on chain 1, which this endpoint does not perform. The
    // mainnet release is BLOCKED with execution DISABLED regardless; see
    // src/config/amm/lumioro-mainnet-release.ts.
    if (cleanSymbol === LUMIORO_TOKEN.symbol || cleanSymbol === 'LUMI') {
      return c.json(
        {
          ok: false,
          symbol: cleanSymbol,
          error: 'LUMIORO has no quotable price on this endpoint',
          reason: 'NO_OBSERVED_PRICE',
          detail:
            'LUMIORO redeems for a pro-rata share of its ETH reserve, which is not ' +
            'a pegged or fixed value. This endpoint does not read that reserve on ' +
            'chain 1, so it has no price to report and will not synthesise one.',
        },
        409
      );
    }

    // Default reference prices / rates for Base DEX settlement
    let priceUsd = 0;
    let change24h = 0;

    // Query internal price endpoint or fallback
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

    if (priceUsd <= 0) {
      // Fallback heuristics for common symbols if pricing API is offline
      const fallbacks: Record<string, number> = {
        BTC: 65000,
        ETH: 3450,
        SOL: 150,
        AVAX: 30,
        LINK: 14,
        UNI: 8,
        USDC: 1.0,
      };
      priceUsd = fallbacks[cleanSymbol] ?? 1.0;
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
