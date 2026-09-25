import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { mountCeDeFiRoutes } from './cedefi.js';

function appWithPrice(priceUsd?: number): Hono {
  const app = new Hono();
  app.get('/api/prices', (c) => {
    if (priceUsd === undefined) {
      return c.json({ error: 'upstream_error' }, 502);
    }
    return c.json({ symbol: 'ETH', priceUsd, change24hPercent: 1.5 });
  });
  mountCeDeFiRoutes(app);
  return app;
}

describe('CeDeFi quote route', () => {
  it.each(['LUMIORO', 'LUMI'])('refuses %s without synthesising a price', async (symbol) => {
    const response = await appWithPrice(2690.97).request(`/api/cedefi/quote?symbol=${symbol}`);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      symbol,
      reason: 'NO_OBSERVED_PRICE',
    });
  });

  it('refuses an unobserved symbol rather than assigning a fallback dollar value', async () => {
    const response = await appWithPrice().request('/api/cedefi/quote?symbol=UNKNOWN');

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      symbol: 'UNKNOWN',
      reason: 'NO_OBSERVED_PRICE',
    });
  });

  it('keeps an observed ETH price without using the historical fallback', async () => {
    const response = await appWithPrice(2690.97).request('/api/cedefi/quote?symbol=ETH&amountUsd=1000');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      symbol: 'ETH',
      spotPriceUsd: 2690.97,
    });
  });
});
