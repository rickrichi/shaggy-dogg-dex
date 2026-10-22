import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUniswapV3Deployment } from "@/config/contracts";
import { formatSwapAmount } from "@/lib/format-swap-amount";

import type { UseSwapReturn } from "@/hooks/useSwap";

/** Shares the swap card's quote snapshot, rather than making a unit-size trade. */
export function PriceChart({ swap }: { swap: UseSwapReturn }) {
  const { state, quote } = swap;
  const venues = [
    ...(getUniswapV3Deployment(state.sellToken.chainId)
      ? [{ name: "Uniswap V3", amount: quote.uniswapV3AmountOut }]
      : []),
    { name: "Uniswap V2", amount: quote.uniswapAmountOut },
    ...(state.sellToken.chainId === 8453
      ? [{ name: "Aerodrome", amount: quote.aerodromeAmountOut }]
      : []),
  ];
  return (
    <Card className="rounded-2xl border-purple-100 bg-white/90 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Quotes for your trade</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={quote.refresh}
            disabled={quote.isRefreshing || quote.status === "IDLE"}
          >
            {quote.isRefreshing ? "Updating…" : "Refresh"}
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          {quote.status === "IDLE"
            ? `Enter an amount to compare ${state.sellToken.symbol} → ${state.buyToken.symbol}.`
            : `${formatSwapAmount(state.sellAmount)} ${state.sellToken.symbol} → ${state.buyToken.symbol}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {venues.map(({ name, amount }) => (
          <div
            key={name}
            className={`rounded-xl border p-4 ${quote.status === "SUCCESS" && quote.bestVenue === name ? "border-purple-300 bg-purple-50" : "border-gray-100 bg-gray-50"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{name}</p>
              {quote.status === "SUCCESS" && quote.bestVenue === name && (
                <span className="rounded-full bg-purple-700 px-2 py-1 text-xs font-semibold text-white">
                  Best quoted output
                </span>
              )}
            </div>
            <p className="mt-1 break-words text-sm" title={amount}>
              {quote.status === "IDLE"
                ? "Enter an amount"
                : quote.status === "LOADING"
                  ? "Checking…"
                  : quote.status === "ERROR"
                    ? "Quote unavailable"
                    : quote.status === "NO_ROUTE"
                      ? "No current quote"
                      : amount
                        ? `${formatSwapAmount(amount)} ${state.buyToken.symbol}`
                        : "No liquidity route"}
            </p>
          </div>
        ))}
        <p className="text-xs leading-relaxed text-gray-500">
          Same pair and amount as your swap. Highest output among checked routes; pool fees
          included, network fees separate. A best quote can still have high price impact.
        </p>
      </CardContent>
    </Card>
  );
}
