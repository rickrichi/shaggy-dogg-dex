import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRICED = '0x1111111111111111111111111111111111111111';
const NO_POOL = '0x2222222222222222222222222222222222222222';
const LIMITED = '0x3333333333333333333333333333333333333333';

type Reply = { status: number; body?: unknown } | 'offline';

/**
 * Fake Market-Data: replies keyed by the last path segment (symbol or address), or 'batch' for the
 * batch token route. Without a 'batch' reply the batch route 404s like an older service.
 */
function stubMarketData(replies: Record<string, Reply>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const key = url.includes('/tokens/base?addresses=') ? 'batch' : url.split('/').pop() ?? '';
    const reply = replies[key] ?? { status: 404, body: { detail: key === 'batch' ? 'Not Found' : 'unknown' } };
    if (reply === 'offline') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function freshApp(): Promise<Hono> {
  vi.resetModules(); // module-level caches start empty in every test
  const { mountPriceRoutes } = await import('./prices.js');
  const app = new Hono();
  mountPriceRoutes(app);
  return app;
}

function scan(app: Hono, chainId: number, addresses: string[]): Promise<Response> {
  return Promise.resolve(
    app.request('/api/prices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chainId, addresses }),
    }),
  );
}

const ETH = { status: 200, body: { symbol: 'ETH', priceUsd: 2400, change24hPercent: -1.5 } };

describe('POST /api/prices', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns 503 instead of an empty success when Market-Data is unreachable', async () => {
    stubMarketData({ ETH: 'offline', [PRICED]: 'offline' });
    const res = await scan(await freshApp(), 8453, [PRICED]);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'market_data_unavailable', chainId: 8453 });
  });

  it('separates priced, unpriceable and failed tokens', async () => {
    stubMarketData({
      ETH,
      [PRICED]: { status: 200, body: { symbol: 'TKN', priceUsd: 0.5, change24hPercent: 2 } },
      [NO_POOL]: { status: 404, body: { detail: 'No Uniswap V2 / Aerodrome pool with at least $25,000 liquidity' } },
      [LIMITED]: { status: 429 },
    });
    const res = await scan(await freshApp(), 8453, [PRICED, NO_POOL, LIMITED]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.prices.map((p: { symbol: string }) => p.symbol).sort()).toEqual(['ETH', 'TKN']);
    expect(body.data.unpriced).toEqual([NO_POOL]);
    expect(body.data.failed).toEqual([LIMITED]);
  });

  it('caches answers and pauses upstream requests after a 429', async () => {
    const fetchMock = stubMarketData({
      ETH,
      [NO_POOL]: { status: 404, body: { detail: 'No Uniswap V2 / Aerodrome pool' } },
      [LIMITED]: { status: 429 },
    });
    const app = await freshApp();
    await scan(app, 8453, [NO_POOL, LIMITED]);
    const callsAfterFirstScan = fetchMock.mock.calls.length;

    const res = await scan(app, 8453, [NO_POOL, LIMITED]);
    const body = await res.json();

    // ETH and NO_POOL come from cache; LIMITED is skipped while the 429 pause lasts.
    expect(fetchMock.mock.calls).toHaveLength(callsAfterFirstScan);
    expect(body.data.unpriced).toEqual([NO_POOL]);
    expect(body.data.failed).toEqual([LIMITED]);
  });

  it('retries a token when Market-Data lacks its own ETH/USDC feed', async () => {
    const fetchMock = stubMarketData({
      ETH,
      [PRICED]: { status: 404, body: { detail: 'No live ETH or USDC exchange price to value pools against' } },
    });
    const app = await freshApp();
    const first = await (await scan(app, 8453, [PRICED])).json();
    await scan(app, 8453, [PRICED]);

    expect(first.data.failed).toEqual([PRICED]);
    expect(first.data.unpriced).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/tokens/base/${PRICED}`))).toHaveLength(2);
  });

  it('prices every token with one batch request when Market-Data supports it', async () => {
    const fetchMock = stubMarketData({
      ETH,
      batch: {
        status: 200,
        body: {
          tokens: { [PRICED]: { symbol: 'TKN', priceUsd: 0.5, change24hPercent: 2 } },
          errors: { [NO_POOL]: { status: 404, detail: 'No Uniswap V2 / Aerodrome pool' } },
        },
      },
    });
    const app = await freshApp();
    const body = await (await scan(app, 8453, [PRICED, NO_POOL, LIMITED])).json();

    expect(body.data.prices.map((p: { symbol: string }) => p.symbol).sort()).toEqual(['ETH', 'TKN']);
    expect(body.data.unpriced).toEqual([NO_POOL]);
    expect(body.data.failed).toEqual([LIMITED]); // absent from the batch answer
    const tokenCalls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/tokens/'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]).toContain('/tokens/base?addresses=');
  });

  it('returns thin-pool prices flagged indicative only when asked, and never serves them to strict callers', async () => {
    const fetchMock = stubMarketData({
      ETH,
      batch: {
        status: 200,
        body: {
          tokens: {
            [NO_POOL]: { symbol: 'AMUTT', priceUsd: 3e-8, change24hPercent: null, indicative: true, pool: { liquidityUsd: 3 } },
          },
          errors: {},
        },
      },
    });
    const app = await freshApp();
    const thinRes = await app.request('/api/prices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chainId: 8453, addresses: [NO_POOL], includeThin: true }),
    });
    const thin = await thinRes.json();

    expect(thin.data.prices).toContainEqual(
      expect.objectContaining({ address: NO_POOL, symbol: 'AMUTT', indicative: true, liquidityUsd: 3 }),
    );
    const batchUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/tokens/base?'));
    expect(batchUrls[0]).toContain('allowThin=true');

    // A strict scan must ask again (without allowThin) rather than reuse the thin answer.
    await scan(app, 8453, [NO_POOL]);
    const strictUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/tokens/base?'));
    expect(strictUrls).toHaveLength(2);
    expect(strictUrls[1]).not.toContain('allowThin');
  });

  it('rejects a non-boolean includeThin', async () => {
    stubMarketData({ ETH });
    const res = await (await freshApp()).request('/api/prices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chainId: 8453, addresses: [], includeThin: 'yes' }),
    });
    expect(res.status).toBe(400);
  });

  it('does not fall back to per-token requests when the batch route is up but failing', async () => {
    const fetchMock = stubMarketData({ ETH, batch: { status: 503, body: { detail: 'No live ETH or USDC' } } });
    const body = await (await scan(await freshApp(), 8453, [PRICED, NO_POOL])).json();

    expect(body.data.failed.sort()).toEqual([PRICED, NO_POOL]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/tokens/base/'))).toHaveLength(0);
  });

  it('does not query token pools for chains Market-Data cannot price', async () => {
    const fetchMock = stubMarketData({ ETH });
    const res = await scan(await freshApp(), 1, [PRICED]);
    const body = await res.json();

    expect(body.data.unpriced).toEqual([PRICED]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([expect.stringMatching(/\/prices\/ETH$/)]);
  });
});
