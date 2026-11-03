// src/components/IndicativeBadge.tsx
import { formatUsdPrice } from "@/lib/format-price";

/** Marks a price taken from a pool below the market-data liquidity floor. */
export function IndicativeBadge({ liquidityUsd }: { readonly liquidityUsd: number | undefined }) {
  return (
    <span
      className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
      title="Priced from a pool too small to trust: a small trade can move this price a lot."
    >
      indicative
      {liquidityUsd !== undefined ? ` · ${formatUsdPrice(liquidityUsd)} pool` : ""}
    </span>
  );
}
