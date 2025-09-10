// src/pages/Portfolio.tsx
// Refactor: strict typing, correct Base addresses, zero-address sentinel handling,
// and separation of native-vs-ERC20 display. No `any`, unions & guards used.
// ---------------------------------------------------------------------------------

import type { JSX } from 'react';
import { useMemo } from 'react';
import { usePrices } from '../hooks/usePrices';

// -----------------------------
// Types & guards
// -----------------------------
type AddressHex = `0x${string}`;

const ZERO_ADDRESS: AddressHex = '0x0000000000000000000000000000000000000000';
const isZeroAddress = (addr: string): addr is AddressHex => /^0x0{40}$/i.test(addr);

// CoinGecko-backed price row returned by your /api/prices
interface PriceRow {
  readonly address: AddressHex;
  readonly priceUsd: number;
  readonly change24hPercent: number;
  readonly symbol?: string;
}

interface PricesFail {
  readonly success: false;
  readonly error: string;
  readonly chainId?: number;
}

// -----------------------------
// Watchlist (ERC20 only — no ZERO_ADDRESS here)
// Use correct Base mainnet WETH address (0x4200...0006)
// -----------------------------
const BASE_CHAIN_ID = 8453 as const;

const WATCHLIST: readonly {
  readonly address: AddressHex;
  readonly symbol: string;
  readonly name: string;
}[] = [
  {
    address: '0x4200000000000000000000000000000000000006', // WETH on Base
    symbol: 'WETH',
    name: 'Wrapped Ether',
  },
  // Add more Base ERC20s here, never ZERO_ADDRESS
] as const;

// Derive ERC20 address list (defensively exclude any accidental zero address)
const ERC20_ADDRESSES: readonly AddressHex[] = WATCHLIST
  .map(t => t.address)
  .filter(a => !isZeroAddress(a)) as readonly AddressHex[];

// -----------------------------
// Component
// -----------------------------
export default function Portfolio(): JSX.Element {
  // Fetch prices for ERC20s; server will ALSO include native token as ZERO_ADDRESS
  const { data, isLoading, error } = usePrices(BASE_CHAIN_ID, ERC20_ADDRESSES);

  if (isLoading) return <div className="p-6 text-sm text-gray-600">Loading prices…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {(error as Error).message}</div>;
  if (!data?.success) {
    const msg = (data as PricesFail | undefined)?.error ?? 'Unknown';
    return <div className="p-6 text-sm text-red-600">Error: {msg}</div>;
  }

  // Split native vs ERC20 using ZERO_ADDRESS sentinel from the API
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { nativePrice, erc20Prices } = useMemo(() => {
    const prices = data.data.prices;
    const native = prices.find(p => p.address.toLowerCase() === ZERO_ADDRESS.toLowerCase());
    const erc20 = prices.filter(p => p.address.toLowerCase() !== ZERO_ADDRESS.toLowerCase());
    return { nativePrice: native, erc20Prices: erc20 };
  }, [data]) as { nativePrice?: PriceRow; erc20Prices: readonly PriceRow[] };

  // Join ERC20 prices with the watchlist to display names/symbols deterministically
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rows = useMemo(() => {
    const index = new Map(WATCHLIST.map(w => [w.address.toLowerCase(), w]));
    return erc20Prices.map(p => {
      const meta = index.get(p.address.toLowerCase());
      return {
        key: p.address,
        symbol: meta?.symbol ?? p.symbol ?? 'TOKEN',
        name: meta?.name ?? meta?.symbol ?? p.symbol ?? 'Token',
        priceUsd: p.priceUsd,
        change24hPercent: p.change24hPercent,
      };
    });
  }, [erc20Prices]);

  return (
    <div className="p-6 space-y-6">
      {/* Native asset (from ZERO_ADDRESS) */}
      {nativePrice && (
        <div className="text-sm rounded-lg border border-gray-200 p-4 bg-white/80">
          <div className="font-semibold">
            {nativePrice.symbol ?? 'ETH'} (Native)
          </div>
          <div>
            ${nativePrice.priceUsd.toFixed(4)} ({nativePrice.change24hPercent.toFixed(2)}%)
          </div>
        </div>
      )}

      {/* ERC20s from watchlist */}
      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="text-sm text-gray-600">No ERC20 tokens configured.</div>
        ) : (
          rows.map((r) => (
            <div key={r.key} className="text-sm rounded-lg border border-gray-200 p-4 bg-white/80">
              <div className="font-semibold">{r.symbol}</div>
              <div className="text-gray-600">{r.name}</div>
              <div className="mt-1">
                ${r.priceUsd.toFixed(4)} ({r.change24hPercent.toFixed(2)}%)
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
