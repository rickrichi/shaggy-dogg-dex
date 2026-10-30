import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUniswapV3Deployment } from "@/config/contracts";
import { BASE_EXTRA_VENUES, type SmartRouteVenue } from "@/lib/amm/smart-routing";
import { formatSwapAmount } from "@/lib/format-swap-amount";

import type { UseSwapReturn } from "@/hooks/useSwap";

/** Shares the swap card's quote snapshot, rather than making a unit-size trade. */
export function PriceChart({ swap }: { swap: UseSwapReturn }) {
  const { state, quote, actions } = swap;
  const venues: Array<{ name: SmartRouteVenue; amount: string | undefined }> = [
    ...(getUniswapV3Deployment(state.sellToken.chainId)
      ? [{ name: "Uniswap V3" as const, amount: quote.uniswapV3AmountOut }]
      : []),
    { name: "Uniswap V2", amount: quote.uniswapAmountOut },
    ...(state.sellToken.chainId === 8453
      ? [
          { name: "Aerodrome" as const, amount: quote.aerodromeAmountOut },
          ...BASE_EXTRA_VENUES.map((name) => ({
            name,
            amount: quote.extraVenueQuotes?.find((extra) => extra.name === name)?.amount,
          })),
        ]
      : []),
  ];
  // A picked venue with no route still shows the other venues' live quotes.
  const showQuotes =
    quote.status === "SUCCESS" || (quote.status === "NO_ROUTE" && !!quote.bestVenue);
  return (
    <Card className="rounded-2xl border-purple-100 bg-white/90 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Quotes for your trade</CardTitle>
          <div className="flex items-center gap-2">
            {quote.preferredVenue && (
              <Button variant="ghost" size="sm" onClick={() => actions.setPreferredVenue(null)}>
                Use best price
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={quote.refresh}
              disabled={quote.isRefreshing || quote.status === "IDLE"}
            >
              {quote.isRefreshing ? "Updating…" : "Refresh"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          {quote.status === "IDLE"
            ? `Enter an amount to compare ${state.sellToken.symbol} → ${state.buyToken.symbol}.`
            : `${formatSwapAmount(state.sellAmount)} ${state.sellToken.symbol} → ${state.buyToken.symbol}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {venues.map(({ name, amount }) => {
            const isBest = showQuotes && quote.bestVenue === name;
            const isPicked = quote.preferredVenue === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={isPicked}
                disabled={showQuotes && !amount && !isPicked}
                onClick={() => actions.setPreferredVenue(isPicked ? null : name)}
                className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60 ${isPicked ? "border-purple-600 bg-purple-50 ring-1 ring-purple-600" : isBest ? "border-purple-300 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-purple-200"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{name}</p>
                  <div className="flex flex-wrap gap-1">
                    {isPicked && (
                      <span className="rounded-full border border-purple-700 bg-white px-2 py-1 text-xs font-semibold text-purple-800">
                        Your route
                      </span>
                    )}
                    {isBest && (
                      <span className="rounded-full bg-purple-700 px-2 py-1 text-xs font-semibold text-white">
                        Best quoted output
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1 break-words text-sm" title={amount}>
                  {quote.status === "IDLE"
                    ? "Enter an amount"
                    : quote.status === "LOADING"
                      ? "Checking…"
                      : quote.status === "ERROR"
                        ? "Quote unavailable"
                        : !showQuotes
                          ? "No current quote"
                          : amount
                            ? `${formatSwapAmount(amount)} ${state.buyToken.symbol}`
                            : "No liquidity route"}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-gray-500">
          Same pair and amount as your swap. Highest output among checked routes; pool fees
          included, network fees separate. Pick a venue to route through it, or leave it on best
          price. A best quote can still have high price impact.
        </p>
      </CardContent>
    </Card>
  );
}
