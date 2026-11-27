import { CheckCircle2, Layers, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getUniswapV3Deployment } from "@/config/contracts";
import { BASE_EXTRA_VENUES, type SmartRouteVenue } from "@/lib/amm/smart-routing";
import { formatSwapAmount } from "@/lib/format-swap-amount";

import type { UseSwapReturn } from "@/hooks/useSwap";

/** Shares the swap card's quote snapshot, rather than making a unit-size trade. */
export function PriceChart({ swap }: { swap: UseSwapReturn }) {
  const { state, quote, actions } = swap;
  const rawVenues: Array<{ name: SmartRouteVenue; amount: string | undefined }> = [
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

  const numericAmounts = rawVenues
    .filter((v) => !quote.excludedVenues?.includes(v.name))
    .map((v) => (v.amount ? parseFloat(v.amount) : 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const maxNumericAmount = numericAmounts.length > 0 ? Math.max(...numericAmounts) : 0;
  const minNumericAmount = numericAmounts.length > 0 ? Math.min(...numericAmounts) : 0;

  // Smart sort when quotes are active: Best quoted first, then valid quotes descending, then unquoted, then excluded outliers
  const venues = showQuotes
    ? [...rawVenues].sort((a, b) => {
        const aExcluded = quote.excludedVenues?.includes(a.name) ?? false;
        const bExcluded = quote.excludedVenues?.includes(b.name) ?? false;
        if (aExcluded !== bExcluded) return aExcluded ? 1 : -1;

        const aBest = quote.bestVenue === a.name;
        const bBest = quote.bestVenue === b.name;
        if (aBest !== bBest) return aBest ? -1 : 1;

        const aVal = a.amount ? parseFloat(a.amount) : -1;
        const bVal = b.amount ? parseFloat(b.amount) : -1;
        return bVal - aVal;
      })
    : rawVenues;

  const routedCount = rawVenues.filter(
    (v) => Boolean(v.amount) && !quote.excludedVenues?.includes(v.name)
  ).length;
  const excludedCount = quote.excludedVenues?.length ?? 0;

  return (
    <Card className="overflow-hidden rounded-3xl border border-purple-200/80 bg-white/95 shadow-lg ring-1 ring-purple-500/5 backdrop-blur-xl">
      <CardHeader className="border-b border-slate-100/90 bg-gradient-to-r from-purple-50/40 via-white to-pink-50/40 px-4 pb-3.5 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Layers className="size-4" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-none tracking-tight text-slate-900">
                  Quotes for your trade
                </h2>
                {showQuotes && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-200/80 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-purple-700 shadow-sm">
                    {routedCount} routed
                    {excludedCount > 0 ? ` · ${excludedCount} guarded` : ""}
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-xs font-medium text-slate-600">
                {quote.status === "IDLE"
                  ? `Enter an amount to compare ${state.sellToken.symbol} → ${state.buyToken.symbol}.`
                  : `${formatSwapAmount(state.sellAmount)} ${state.sellToken.symbol} → ${state.buyToken.symbol}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {quote.preferredVenue && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => actions.setPreferredVenue(null)}
                className="rounded-xl border border-purple-200 bg-purple-50/80 text-xs font-semibold text-purple-800 hover:bg-purple-100"
              >
                Use best price
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={quote.refresh}
              disabled={quote.isRefreshing || quote.status === "IDLE"}
              className="gap-1.5 rounded-xl border-slate-200/90 text-xs font-semibold"
            >
              <RefreshCw className={`size-3.5 ${quote.isRefreshing ? "animate-spin" : ""}`} />
              {quote.isRefreshing ? "Updating…" : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5 px-4 pb-4 pt-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {venues.map(({ name, amount }, index) => {
            const isBest = showQuotes && quote.bestVenue === name;
            const isPicked = quote.preferredVenue === name;
            const isExcluded = quote.excludedVenues?.includes(name) ?? false;
            const numericVal = amount ? parseFloat(amount) : 0;

            const deltaPct =
              showQuotes &&
              !isExcluded &&
              !isBest &&
              maxNumericAmount > 0 &&
              numericVal > 0 &&
              numericVal < maxNumericAmount
                ? ((numericVal - maxNumericAmount) / maxNumericAmount) * 100
                : null;

            // Normalize relative depth bar across the spread so differences like -16% are visually obvious
            const spread = maxNumericAmount - minNumericAmount;
            const relativePct =
              showQuotes && !isExcluded && maxNumericAmount > 0 && numericVal > 0
                ? isBest
                  ? 100
                  : spread > 0
                    ? Math.round(28 + ((numericVal - minNumericAmount) / spread) * 66)
                    : 95
                : 0;

            return (
              <button
                key={name}
                type="button"
                aria-pressed={isPicked}
                disabled={showQuotes && (!amount || isExcluded) && !isPicked}
                onClick={() => actions.setPreferredVenue(isPicked ? null : name)}
                className={`group relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed ${
                  isExcluded
                    ? "border-amber-200/90 bg-amber-50/80 text-amber-950"
                    : "disabled:opacity-60"
                } ${
                  isPicked
                    ? "border-purple-600 bg-gradient-to-br from-purple-50/90 via-white to-pink-50/70 shadow-md ring-1 ring-purple-600"
                    : isBest
                      ? "border-purple-300 bg-gradient-to-br from-purple-50/70 via-white to-emerald-50/40 shadow-sm"
                      : !isExcluded
                        ? "border-slate-200/80 bg-slate-50/60 hover:border-purple-300 hover:bg-white hover:shadow-sm"
                        : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {showQuotes && !isExcluded && numericVal > 0 && (
                      <span
                        className={`inline-flex size-5 items-center justify-center rounded-md font-mono text-[10px] font-semibold ${
                          isBest
                            ? "bg-purple-700 text-white"
                            : "bg-slate-200/80 text-slate-600"
                        }`}
                      >
                        #{index + 1}
                      </span>
                    )}
                    <p className="font-bold text-slate-900">{name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {isPicked && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-purple-700 bg-white px-2 py-0.5 text-[11px] font-bold text-purple-800 shadow-sm">
                        <CheckCircle2 className="size-3 text-purple-600" />
                        Your route
                      </span>
                    )}
                    {isBest && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-700 to-pink-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                        <Sparkles className="size-3" />
                        Best quoted output
                      </span>
                    )}
                    {deltaPct !== null && (
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                          Math.abs(deltaPct) >= 1
                            ? "border border-orange-200 bg-orange-50 text-orange-700"
                            : "border border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {deltaPct.toFixed(2)}%
                      </span>
                    )}
                    {isExcluded && (
                      <span className="rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                        35% guard
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <p
                    className={`break-words font-mono text-sm font-semibold tabular-nums ${
                      isExcluded
                        ? "font-sans text-xs font-semibold text-amber-900"
                        : amount && showQuotes
                          ? "text-slate-900"
                          : "font-sans text-xs font-normal text-slate-500"
                    }`}
                    title={amount}
                  >
                    {isExcluded
                      ? "Excluded · unsafe quote deviation"
                      : quote.status === "IDLE"
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

                  {/* Relative Liquidity Depth Progress Bar */}
                  {relativePct > 0 && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isBest
                            ? "bg-gradient-to-r from-purple-600 via-fuchsia-600 to-emerald-500"
                            : isPicked
                              ? "bg-purple-600"
                              : deltaPct !== null && Math.abs(deltaPct) >= 5
                                ? "bg-orange-400"
                                : "bg-purple-400"
                        }`}
                        style={{ width: `${relativePct}%` }}
                      />
                    </div>
                  )}

                  {isExcluded && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-800">
                      <ShieldAlert className="size-3 shrink-0 text-amber-600" />
                      <span>Outside the 35% cross-venue safety range.</span>
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="rounded-xl bg-slate-50/90 px-3 py-2 text-xs leading-relaxed text-slate-500">
          Same pair and amount as your swap. Highest output among checked routes; pool fees
          included, network fees separate. Pick a venue to route through it, or leave it on best
          price. A best quote can still have high price impact.
        </p>
      </CardContent>
    </Card>
  );
}
