// src/components/swap/SwapCard.tsx
import { memo, useState } from "react";

import { ArrowUpDown, CheckCircle2, ExternalLink, Loader2, Settings } from "lucide-react";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUniswapV3Deployment } from "@/config/contracts";
import { HIGH_PRICE_IMPACT, SEVERE_PRICE_IMPACT } from "@/lib/amm/price-impact";
import { routeVenuesForChain, type SmartRouteVenue } from "@/lib/amm/smart-routing";
import { formatSwapAmount } from "@/lib/format-swap-amount";

import type { Token } from "@/config/tokens";
import type { UseSwapReturn } from "@/hooks/useSwap";

interface SwapCardProps {
  swap: UseSwapReturn;
  tokens: readonly Token[];
  approveHash?: `0x${string}`;
  swapHash?: `0x${string}`;
  isCorrectNetwork?: boolean;
  isSwitchingNetwork?: boolean;
  onSwitchNetwork?: () => void;
  showSettings: boolean;
  onSettingsChange: (open: boolean) => void;
}

const BEST_PRICE = "best-price";

export const SwapCard = memo<SwapCardProps>(
  ({
    swap,
    tokens,
    approveHash,
    swapHash,
    isCorrectNetwork = true,
    isSwitchingNetwork = false,
    onSwitchNetwork,
    showSettings,
    onSettingsChange,
  }) => {
    const { state, balances, approval, swap: swapActions, actions, quote } = swap;
    const [reviewId, setReviewId] = useState<string | null>(null);
    const highImpact = quote.priceImpact !== null && quote.priceImpact >= HIGH_PRICE_IMPACT;
    const severeImpact = quote.priceImpact !== null && quote.priceImpact >= SEVERE_PRICE_IMPACT;
    const reviewIsCurrent = reviewId === quote.id && quote.status === "SUCCESS";

    const formatBalance = (balance: typeof balances.sell) => {
      if (!balance) return "0.0000";
      return parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4);
    };

    const swapButtonLabel = (() => {
      if (!isCorrectNetwork) {
        return isSwitchingNetwork
          ? "Switching network..."
          : state.sellToken.chainId === 1
            ? "Switch to Ethereum"
            : "Switch to Base";
      }
      if (swapActions.isSwapping) return "Swapping...";
      if (!state.sellAmount) return "Enter amount";
      if (quote.status === "LOADING") return "Fetching best price...";
      if (quote.status === "NO_ROUTE" && quote.preferredVenue)
        return `No route on ${quote.preferredVenue}`;
      if (quote.status === "NO_ROUTE" || quote.status === "ERROR") return "Route unavailable";
      if (quote.status === "SUCCESS" && quote.priceImpact === null) return "Impact unavailable";
      if (approval.needed) return "Approve token first";
      if (!swapActions.canSwap) return "Insufficient balance";
      if (highImpact) return "Review high-impact swap";
      return quote.preferredVenue ? `Swap on ${quote.preferredVenue}` : "Swap";
    })();

    const handlePrimaryAction = () => {
      if (!isCorrectNetwork) {
        onSwitchNetwork?.();
        return;
      }
      if (highImpact && quote.id) {
        setReviewId(quote.id);
      } else {
        void swapActions.execute();
      }
    };

    return (
      <Card className="border-2 border-purple-200 bg-white/95 shadow-xl backdrop-blur-sm">
        <Dialog
          open={reviewId !== null}
          onOpenChange={(open) => {
            if (!open) setReviewId(null);
          }}
        >
          <DialogContent className="max-w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm high price impact</DialogTitle>
              <DialogDescription>
                This trade receives fewer tokens than the pool's pre-trade price suggests. Slippage
                tolerance does not protect against this impact.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className={severeImpact ? "font-bold text-red-700" : "font-bold text-orange-700"}>
                Estimated price impact: {quote.priceImpact?.toFixed(2) ?? "Unavailable"}% (including
                pool fees)
              </p>
              <p>
                Pay {formatSwapAmount(state.sellAmount)} {state.sellToken.symbol} to receive
                approximately {formatSwapAmount(state.buyAmount)} {state.buyToken.symbol}.
              </p>
              <p>
                Minimum received: {formatSwapAmount(quote.minimumReceived)} {state.buyToken.symbol}.{" "}
                Slippage tolerance: {state.slippage}%.
              </p>
              <p>Consider a smaller trade or a pool with more liquidity.</p>
              {!reviewIsCurrent && (
                <p role="alert" className="font-medium text-red-700">
                  The quote changed or expired. Close this dialog and review the latest quote.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => setReviewId(null)}>
                Go back
              </Button>
              <Button
                className="bg-red-700 text-white hover:bg-red-800"
                disabled={!reviewIsCurrent || !swapActions.canSwap || swapActions.isSwapping}
                onClick={() => {
                  if (!reviewIsCurrent || !reviewId) return;
                  const confirmed = reviewId;
                  setReviewId(null);
                  void swapActions.execute(confirmed);
                }}
              >
                I understand — continue to wallet
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold">Swap</CardTitle>
            <Dialog open={showSettings} onOpenChange={onSettingsChange}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Swap settings"
                  className="hover:bg-purple-50"
                >
                  <Settings className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Swap Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="slippage" className="text-sm font-medium">
                      Slippage Tolerance (%)
                    </Label>
                    <div className="mt-2 flex gap-2">
                      {[0.1, 0.5, 1.0].map((value) => (
                        <Button
                          key={value}
                          variant={state.slippage === value ? "default" : "outline"}
                          size="sm"
                          onClick={() => actions.setSlippage(value)}
                          aria-pressed={state.slippage === value}
                        >
                          {value}%
                        </Button>
                      ))}
                      <Input
                        id="slippage"
                        type="number"
                        value={state.slippage}
                        onChange={(e) => actions.setSlippage(parseFloat(e.target.value))}
                        className="w-20"
                        placeholder="Custom"
                        min="0.01"
                        max="50"
                        step="0.1"
                        aria-label="Custom slippage"
                      />
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Sell Token Input */}
          <div className="space-y-2">
            <Label htmlFor="sell-amount" className="text-sm font-medium text-gray-700">
              You pay
            </Label>
            <div className="flex space-x-2">
              <div className="min-w-0 flex-1">
                <Input
                  id="sell-amount"
                  type="number"
                  placeholder="0.0"
                  value={state.sellAmount}
                  onChange={(e) => actions.setSellAmount(e.target.value)}
                  className="text-lg font-medium"
                  min="0"
                  step="any"
                  aria-label="Amount to sell"
                />
              </div>
              <Select
                value={state.sellToken.symbol}
                onValueChange={(symbol) => {
                  const token = tokens.find((t) => t.symbol === symbol);
                  if (token) actions.setSellToken(token);
                }}
              >
                <SelectTrigger className="w-32 sm:w-40" aria-label="Select token to sell">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-64">
                  {tokens.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{token.symbol}</span>
                        <span className="truncate text-xs text-slate-500">{token.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Balance: {formatBalance(balances.sell)} {state.sellToken.symbol}
              </span>
              {balances.sell && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-purple-600 hover:text-purple-700"
                  onClick={actions.setMaxSellAmount}
                  aria-label="Use maximum balance"
                >
                  MAX
                </Button>
              )}
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.reverseTokens}
              className="rounded-full border-2 border-gray-200 transition-all hover:border-purple-300 hover:bg-purple-50"
              aria-label="Reverse token order"
            >
              <ArrowUpDown className="size-4" />
            </Button>
          </div>

          {/* Buy Token Input */}
          <div className="space-y-2">
            <Label htmlFor="buy-amount" className="text-sm font-medium text-gray-700">
              You receive
            </Label>
            <div className="flex space-x-2">
              <div className="min-w-0 flex-1">
                <Input
                  id="buy-amount"
                  type="text"
                  placeholder="0.0"
                  value={state.buyAmount ? formatSwapAmount(state.buyAmount) : ""}
                  title={state.buyAmount}
                  className="bg-gray-50 text-base font-medium tabular-nums sm:text-lg"
                  readOnly
                  aria-label="Amount to receive"
                />
              </div>
              <Select
                value={state.buyToken.symbol}
                onValueChange={(symbol) => {
                  const token = tokens.find((t) => t.symbol === symbol);
                  if (token) actions.setBuyToken(token);
                }}
              >
                <SelectTrigger className="w-32 sm:w-40" aria-label="Select token to receive">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-64">
                  {tokens.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{token.symbol}</span>
                        <span className="truncate text-xs text-slate-500">{token.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-gray-500">
              Balance: {formatBalance(balances.buy)} {state.buyToken.symbol}
            </div>
          </div>

          {/* Route Choice */}
          <div className="space-y-2">
            <Label htmlFor="swap-route" className="text-sm font-medium text-gray-700">
              Route
            </Label>
            <Select
              value={quote.preferredVenue ?? BEST_PRICE}
              onValueChange={(value) =>
                actions.setPreferredVenue(value === BEST_PRICE ? null : (value as SmartRouteVenue))
              }
            >
              <SelectTrigger id="swap-route" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BEST_PRICE}>Best price (automatic)</SelectItem>
                {routeVenuesForChain(state.sellToken.chainId).map((venue) => {
                  const unavailable = !!quote.routedVenues && !quote.routedVenues.includes(venue);
                  return (
                    <SelectItem key={venue} value={venue} disabled={unavailable}>
                      {venue}
                      {unavailable ? " (no route)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {quote.status === "NO_ROUTE" && quote.preferredVenue && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => actions.setPreferredVenue(null)}
              >
                Switch to best price
              </Button>
            )}
          </div>

          {/* Quote Information */}
          {quote.comparisonText && (
            <p
              className={`text-sm ${(quote.venueShortfallPercent ?? 0) >= 1 ? "font-medium text-orange-700" : "text-purple-800"}`}
            >
              {quote.comparisonText}
            </p>
          )}
          {quote.bestVenue && (
            <div className="text-xs text-slate-600">
              <p>
                {getUniswapV3Deployment(state.sellToken.chainId) && (
                  <>
                    Uniswap V3:{" "}
                    {quote.uniswapV3AmountOut
                      ? formatSwapAmount(quote.uniswapV3AmountOut)
                      : "No route"}{" "}
                    ·{" "}
                  </>
                )}
                Uniswap V2:{" "}
                {quote.uniswapAmountOut ? formatSwapAmount(quote.uniswapAmountOut) : "No route"}
                {state.sellToken.chainId === 8453 && (
                  <>
                    {" "}
                    · Aerodrome:{" "}
                    {quote.aerodromeAmountOut
                      ? formatSwapAmount(quote.aerodromeAmountOut)
                      : "No route"}
                  </>
                )}{" "}
                {state.buyToken.symbol}
              </p>
              {!!quote.extraVenueQuotes?.length && (
                <dl className="my-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {quote.extraVenueQuotes.map(({ name, amount }) => (
                    <div key={name} className="flex min-w-0 justify-between gap-2">
                      <dt className="shrink-0">{name}</dt>
                      <dd className="truncate" title={amount}>
                        {formatSwapAmount(amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p>
                Pool fees are included. Network fees are separate. Submission uses your wallet’s
                RPC; private routing is unverified.
              </p>
            </div>
          )}
          {quote.rate !== null && state.sellAmount && state.buyAmount && (
            <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <CardContent className="space-y-2 p-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-600">Average execution rate</span>
                  <span className="min-w-0 text-right font-medium">
                    1 {state.sellToken.symbol} = {formatSwapAmount(quote.rate)}{" "}
                    {state.buyToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Slippage</span>
                  <span className="font-medium">{state.slippage}%</span>
                </div>
                {quote.minimumReceived !== null && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-600">Minimum received</span>
                    <span className="min-w-0 text-right font-medium">
                      {formatSwapAmount(quote.minimumReceived)} {state.buyToken.symbol}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-600">Price impact (incl. fees)</span>
                  <span
                    className={`text-right font-semibold ${severeImpact ? "text-red-700" : highImpact ? "text-orange-700" : "text-gray-900"}`}
                  >
                    {quote.priceImpact === null
                      ? "Unavailable"
                      : `${quote.priceImpact.toFixed(2)}%`}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
          {highImpact && (
            <div
              role="alert"
              className={`rounded-lg border p-3 text-sm ${severeImpact ? "border-red-200 bg-red-50 text-red-800" : "border-orange-200 bg-orange-50 text-orange-800"}`}
            >
              <p className="font-semibold">
                {severeImpact ? "Very high" : "High"} price impact: {quote.priceImpact!.toFixed(2)}%
              </p>
              <p className="mt-1">
                Your trade is large relative to the available liquidity. Consider a smaller amount.
                You must confirm this impact before continuing to your wallet.
              </p>
              <p className="mt-1 text-xs">
                Compared with this route's pre-trade pool price; includes pool fees. Slippage is
                separate.
              </p>
            </div>
          )}
          {quote.status === "SUCCESS" && quote.priceImpact === null && (
            <div
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Price impact could not be verified. Refresh the quote before swapping.
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={quote.refresh}
                disabled={quote.isRefreshing}
              >
                Refresh quote
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {approval.needed && (
              <Button
                className="w-full bg-blue-600 py-3 font-medium text-white transition-all hover:bg-blue-700"
                onClick={approval.approve}
                disabled={approval.isApproving || !state.sellAmount}
                aria-busy={approval.isApproving}
              >
                {approval.isApproving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Approving...
                  </>
                ) : (
                  `Approve ${state.sellToken.symbol}`
                )}
              </Button>
            )}

            <Button
              className="w-full transform bg-gradient-to-r from-purple-600 to-pink-600 py-3 font-medium text-white transition-all hover:scale-[1.02] hover:from-purple-700 hover:to-pink-700"
              onClick={handlePrimaryAction}
              disabled={
                isSwitchingNetwork ||
                (isCorrectNetwork &&
                  (!swapActions.canSwap ||
                    swapActions.isSwapping ||
                    approval.needed ||
                    quote.status === "LOADING" ||
                    quote.status === "NO_ROUTE" ||
                    quote.status === "ERROR"))
              }
              aria-busy={swapActions.isSwapping || isSwitchingNetwork}
            >
              {swapActions.isSwapping || isSwitchingNetwork ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  {swapButtonLabel}
                </>
              ) : (
                swapButtonLabel
              )}
            </Button>
          </div>

          {/* Transaction Status */}
          {(approveHash || swapHash) && (
            <div className="space-y-2" role="status" aria-live="polite">
              {approveHash && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckCircle2 className="size-3 text-green-500" aria-hidden="true" />
                  <span>Approval: </span>
                  <a
                    href={`https://etherscan.io/tx/${approveHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    View on Etherscan
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </div>
              )}
              {swapHash && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckCircle2 className="size-3 text-green-500" aria-hidden="true" />
                  <span>Swap: </span>
                  <a
                    href={`https://etherscan.io/tx/${swapHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    View on Etherscan
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

SwapCard.displayName = "SwapCard";
