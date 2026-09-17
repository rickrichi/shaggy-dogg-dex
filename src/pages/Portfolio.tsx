// src/pages/Portfolio.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

import { type AddressHex, normalizeAddress, ZERO_ADDRESS } from "@/types/token";

import type { JSX } from "react";
import type { PriceRow } from "@/types/prices";

// -----------------------------
// Watchlist (ERC20 only — no ZERO_ADDRESS here)
// Use correct Base mainnet WETH address (0x4200...0006)
// -----------------------------
const WATCHLIST: ReadonlyArray<{
  readonly address: AddressHex;
  readonly symbol: string;
  readonly name: string;
}> = [
  {
    address: "0x4200000000000000000000000000000000000006", // WETH on Base
    symbol: "WETH",
    name: "Wrapped Ether",
  },
  // Add more Base ERC20s here, never ZERO_ADDRESS
] as const;

// Derive ERC20 address list (defensively exclude any accidental zero address)
const ERC20_ADDRESSES: readonly AddressHex[] = WATCHLIST.map((t) => t.address).filter(
  (a) => a !== ZERO_ADDRESS
) as readonly AddressHex[];

const ZERO_NORMALIZED = normalizeAddress(ZERO_ADDRESS);

// -----------------------------
// Component
// -----------------------------
export default function Portfolio(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [prices, setPrices] = useState<PriceRow[]>([]);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Native (ETH on Base) via CoinGecko simple price (free tier, no key)
      const nativeUrl =
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true";

      // ERC20s on Base via contract addresses
      const tokenUrl = (() => {
        const url = new URL("https://api.coingecko.com/api/v3/simple/token_price/base");
        url.searchParams.set(
          "contract_addresses",
          ERC20_ADDRESSES.map((a) => a.toLowerCase()).join(",")
        );
        url.searchParams.set("vs_currencies", "usd");
        url.searchParams.set("include_24hr_change", "true");
        return url.toString();
      })();

      const [nativeRes, tokenRes] = await Promise.all([fetch(nativeUrl), fetch(tokenUrl)]);

      if (!nativeRes.ok) throw new Error(`Native price HTTP ${nativeRes.status}`);
      if (!tokenRes.ok) throw new Error(`Token price HTTP ${tokenRes.status}`);

      const nativeJson = (await nativeRes.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;
      const tokenJson = (await tokenRes.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number; symbol?: string }
      >;

      const nextPrices: PriceRow[] = [];

      const ethRow = nativeJson["ethereum"];
      if (ethRow?.usd !== undefined) {
        nextPrices.push({
          address: ZERO_ADDRESS,
          priceUsd: Number(ethRow.usd),
          change24hPercent: Number(ethRow.usd_24h_change ?? 0),
          symbol: "ETH",
        });
      }

      for (const [addr, row] of Object.entries(tokenJson)) {
        if (row?.usd === undefined) continue;
        nextPrices.push({
          address: addr as AddressHex,
          priceUsd: Number(row.usd),
          change24hPercent: Number(row.usd_24h_change ?? 0),
          symbol:
            row.symbol ??
            WATCHLIST.find(
              (w) => normalizeAddress(w.address) === normalizeAddress(addr as AddressHex)
            )?.symbol ??
            "UNKNOWN",
        });
      }

      setPrices(nextPrices);
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Failed to fetch prices");
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Split native vs ERC20 using ZERO_ADDRESS sentinel from the API
  // Must be before early returns to follow rules of hooks
  const { nativePrice, erc20Prices } = useMemo(() => {
    const native = prices.find((p) => normalizeAddress(p.address) === ZERO_NORMALIZED);
    const erc20 = prices.filter((p) => normalizeAddress(p.address) !== ZERO_NORMALIZED);
    return { nativePrice: native, erc20Prices: erc20 };
  }, [prices]) as { nativePrice?: PriceRow; erc20Prices: readonly PriceRow[] };

  // Join ERC20 prices with the watchlist to display names/symbols deterministically
  const rows = useMemo(() => {
    const index = new Map(WATCHLIST.map((w) => [normalizeAddress(w.address), w]));
    return erc20Prices.map((p) => {
      const meta = index.get(normalizeAddress(p.address));
      return {
        key: p.address,
        symbol: meta?.symbol ?? p.symbol ?? "TOKEN",
        name: meta?.name ?? meta?.symbol ?? p.symbol ?? "Token",
        priceUsd: p.priceUsd,
        change24hPercent: p.change24hPercent,
      };
    });
  }, [erc20Prices]);

  useEffect(() => {
    void fetchPrices();
  }, [fetchPrices]);

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading prices…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error.message}</div>;

  return (
    <div className="space-y-6 p-6">
      {/* Native asset (from ZERO_ADDRESS) */}
      {nativePrice && (
        <div className="rounded-lg border border-gray-200 bg-white/80 p-4 text-sm">
          <div className="font-semibold">{nativePrice.symbol ?? "ETH"} (Native)</div>
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
            <div key={r.key} className="rounded-lg border border-gray-200 bg-white/80 p-4 text-sm">
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
