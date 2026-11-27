// src/components/swap/SwapCard.tsx
import { memo, useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
const QUICK_TOKEN_SYMBOLS = ["ETH", "USDC", "SD", "MRWD", "cbBTC", "AERO"] as const;

function TokenAvatar({
  token,
  size = "md",
}: {
  readonly token: Token;
  readonly size?: "sm" | "md";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [token.logoURI]);

  const sizeClass = size === "sm" ? "size-5 text-[9px]" : "size-6 text-[10px]";

  if (token.logoURI && !imgFailed) {
    return (
      <img
        src={token.logoURI}
        alt=""
        aria-hidden="true"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full bg-white object-cover shadow-sm ring-1 ring-slate-200/80`}
      />
    );
  }

  const initials = token.symbol.slice(0, 3).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-600 font-mono font-semibold text-white shadow-sm ring-1 ring-white/80`}
    >
      {initials}
    </span>
  );
}

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
    const [invertRate, setInvertRate] = useState(false);
    const [sellQuery, setSellQuery] = useState("");
    const [buyQuery, setBuyQuery] = useState("");
    const [clock, setClock] = useState(Date.now);
    useEffect(() => {
      const timer = window.setInterval(() => setClock(Date.now()), 1_000);
      return () => window.clearInterval(timer);
    }, []);
    const highImpact = quote.priceImpact !== null && quote.priceImpact >= HIGH_PRICE_IMPACT;
    const severeImpact = quote.priceImpact !== null && quote.priceImpact >= SEVERE_PRICE_IMPACT;
    const reviewIsCurrent = reviewId === quote.id && quote.status === "SUCCESS";

    const quickTokens = useMemo(
      () =>
        QUICK_TOKEN_SYMBOLS.map((sym) =>
          tokens.find((t) => t.symbol.toUpperCase() === sym.toUpperCase())
        ).filter((t): t is Token => t !== undefined),
      [tokens]
    );

    const filterTokens = (query: string, currentSymbol: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return tokens;
      return tokens.filter(
        (t) =>
          t.symbol === currentSymbol ||
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
      );
    };

    const filteredSellTokens = useMemo(
      () => filterTokens(sellQuery, state.sellToken.symbol),
      [tokens, sellQuery, state.sellToken.symbol]
    );

    const filteredBuyTokens = useMemo(
      () => filterTokens(buyQuery, state.buyToken.symbol),
      [tokens, buyQuery, state.buyToken.symbol]
    );

    const formatBalance = (balance: typeof balances.sell) => {
      if (!balance) return "0.0000";
      return parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4);
    };

    const handlePercentageFill = (pct: number) => {
      if (!balances.sell) return;
      if (pct >= 100) {
        actions.setMaxSellAmount();
        return;
      }
      const scaled = (balances.sell.value * BigInt(pct)) / 100n;
      const formatted = formatUnits(scaled, balances.sell.decimals);
      actions.setSellAmount(formatted);
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

    const isPrimaryDisabled =
      isSwitchingNetwork ||
      (isCorrectNetwork &&
        (!swapActions.canSwap ||
          swapActions.isSwapping ||
          approval.needed ||
          quote.status === "LOADING" ||
          quote.status === "NO_ROUTE" ||
          quote.status === "ERROR"));

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

    const quoteAgeSeconds = quote.observedAt
      ? Math.max(0, Math.floor((clock - quote.observedAt) / 1_000))
      : 0;
    const quoteExpiresIn = Math.max(0, 30 - quoteAgeSeconds);
    const freshnessPercent = Math.min(100, Math.max(0, (quoteExpiresIn / 30) * 100));

    return (
      <Card className="overflow-hidden rounded-3xl border border-purple-200/80 bg-white/95 shadow-xl ring-1 ring-purple-500/10 backdrop-blur-xl">
        <Dialog
          open={reviewId !== null}
          onOpenChange={(open) => {
            if (!open) setReviewId(null);
          }}
        >
          <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
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

        <CardHeader className="border-b border-slate-100/90 bg-gradient-to-r from-purple-50/40 via-white to-pink-50/40 px-4 pb-3 pt-3.5 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold leading-none tracking-tight text-slate-900">
                Swap
              </h2>
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-purple-200/80 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-purple-700 shadow-sm">
                <Sparkles className="size-3 shrink-0 text-purple-600" />
                {state.slippage}% slippage
              </span>
            </div>

            <div className="flex items-center gap-1">
              {quote.status === "SUCCESS" && (
                <button
                  type="button"
                  onClick={quote.refresh}
                  disabled={quote.isRefreshing}
                  title="Refresh live quote"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1 font-mono text-[11px] font-medium text-slate-600 transition hover:border-purple-300 hover:text-purple-700 disabled:opacity-50"
                >
                  <RefreshCw className={`size-3 ${quote.isRefreshing ? "animate-spin" : ""}`} />
                  <span>{quoteExpiresIn}s</span>
                </button>
              )}

              <Dialog open={showSettings} onOpenChange={onSettingsChange}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Swap settings"
                    className="rounded-xl border border-transparent hover:border-purple-200 hover:bg-purple-50/80"
                  >
                    <Settings className="size-4 text-slate-700" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Swap Settings</DialogTitle>
                    <DialogDescription>
                      Choose how much price movement you will accept before this swap reverts.
                    </DialogDescription>
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
                            className={
                              state.slippage === value
                                ? "border-purple-600 bg-purple-600 text-white hover:bg-purple-700"
                                : "border-slate-200 hover:border-purple-300 hover:bg-purple-50"
                            }
                          >
                            {value}%
                          </Button>
                        ))}
                        <Input
                          id="slippage"
                          type="number"
                          value={state.slippage}
                          onChange={(e) => actions.setSlippage(parseFloat(e.target.value))}
                          className="w-20 font-mono"
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
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pb-4 pt-3.5 sm:px-5">
          {/* Recessed Dual-Well Swap Architecture */}
          <div className="relative space-y-1.5">
            {/* Sell Token Recessed Well */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-3 transition-all focus-within:border-purple-400 focus-within:bg-white focus-within:shadow-md focus-within:ring-2 focus-within:ring-purple-500/10">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="sell-amount"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  You pay
                </Label>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-slate-500">
                  <span>
                    Balance: {formatBalance(balances.sell)} {state.sellToken.symbol}
                  </span>
                  {balances.sell && (
                    <div className="inline-flex items-center gap-1 pl-0.5">
                      {[25, 50, 75].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handlePercentageFill(pct)}
                          className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                        >
                          {pct}%
                        </button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-700 hover:bg-purple-100 hover:text-purple-800"
                        onClick={actions.setMaxSellAmount}
                        aria-label="Use maximum balance"
                      >
                        MAX
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    id="sell-amount"
                    type="number"
                    placeholder="0.0"
                    value={state.sellAmount}
                    onChange={(e) => actions.setSellAmount(e.target.value)}
                    className="h-10 border-0 bg-transparent px-0 py-0 font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-900 shadow-none [appearance:textfield] placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-[26px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    min="0"
                    step="any"
                    aria-label="Amount to sell"
                  />
                </div>
                <Select
                  value={state.sellToken.symbol}
                  onOpenChange={(open) => {
                    if (!open) setSellQuery("");
                  }}
                  onValueChange={(symbol) => {
                    const token = tokens.find((t) => t.symbol === symbol);
                    if (token) actions.setSellToken(token);
                  }}
                >
                  <SelectTrigger
                    className="h-10 w-auto shrink-0 gap-2 rounded-full border-slate-200/90 bg-white pl-2 pr-3 font-semibold text-slate-900 shadow-sm transition hover:border-purple-300 hover:bg-purple-50/40"
                    aria-label="Select token to sell"
                  >
                    <div className="flex items-center gap-2">
                      <TokenAvatar token={state.sellToken} />
                      <SelectValue>{state.sellToken.symbol}</SelectValue>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-96 min-w-72 rounded-2xl border-purple-200/80 p-1">
                    {/* Sticky Search & Quick Chips Header inside Token Selector */}
                    <div
                      className="sticky top-0 z-10 space-y-2 border-b border-slate-100 bg-white/95 p-2 backdrop-blur-md"
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={sellQuery}
                          onChange={(e) => setSellQuery(e.target.value)}
                          placeholder="Search symbol or name..."
                          aria-label="Filter tokens to sell"
                          className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-800 outline-none focus:border-purple-400 focus:bg-white"
                        />
                        {sellQuery && (
                          <button
                            type="button"
                            onClick={() => setSellQuery("")}
                            className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                      {quickTokens.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {quickTokens.map((qt) => (
                            <button
                              key={qt.symbol}
                              type="button"
                              onClick={() => actions.setSellToken(qt)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                                qt.symbol === state.sellToken.symbol
                                  ? "border-purple-600 bg-purple-600 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-purple-300"
                              }`}
                            >
                              <TokenAvatar token={qt} size="sm" />
                              <span>{qt.symbol}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {filteredSellTokens.map((token) => (
                      <SelectItem
                        key={token.symbol}
                        value={token.symbol}
                        className="rounded-xl py-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <TokenAvatar token={token} size="sm" />
                          <span className="font-semibold text-slate-900">{token.symbol}</span>
                          <span className="truncate text-xs text-slate-500">{token.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Floating Flip Button Bridge */}
            <div className="relative z-10 -my-3 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={actions.reverseTokens}
                className="group size-8 rounded-xl border-2 border-purple-200/90 bg-white p-0 text-slate-700 shadow-sm transition-all duration-200 hover:scale-105 hover:border-purple-500 hover:bg-purple-50 hover:text-purple-700"
                aria-label="Reverse token order"
              >
                <ArrowUpDown className="size-3.5 transition-transform duration-300 group-hover:rotate-180" />
              </Button>
            </div>

            {/* Buy Token Recessed Well */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-3 transition-all focus-within:border-purple-400 focus-within:bg-white">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="buy-amount"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  You receive
                </Label>
                <div className="font-mono text-xs text-slate-500">
                  Balance: {formatBalance(balances.buy)} {state.buyToken.symbol}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    id="buy-amount"
                    type="text"
                    placeholder="0.0"
                    value={state.buyAmount ? formatSwapAmount(state.buyAmount) : ""}
                    title={state.buyAmount}
                    className="h-10 border-0 bg-transparent px-0 py-0 font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-900 shadow-none placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-[26px]"
                    readOnly
                    aria-label="Amount to receive"
                  />
                </div>
                <Select
                  value={state.buyToken.symbol}
                  onOpenChange={(open) => {
                    if (!open) setBuyQuery("");
                  }}
                  onValueChange={(symbol) => {
                    const token = tokens.find((t) => t.symbol === symbol);
                    if (token) actions.setBuyToken(token);
                  }}
                >
                  <SelectTrigger
                    className="h-10 w-auto shrink-0 gap-2 rounded-full border-slate-200/90 bg-white pl-2 pr-3 font-semibold text-slate-900 shadow-sm transition hover:border-purple-300 hover:bg-purple-50/40"
                    aria-label="Select token to receive"
                  >
                    <div className="flex items-center gap-2">
                      <TokenAvatar token={state.buyToken} />
                      <SelectValue>{state.buyToken.symbol}</SelectValue>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-96 min-w-72 rounded-2xl border-purple-200/80 p-1">
                    {/* Sticky Search & Quick Chips Header inside Token Selector */}
                    <div
                      className="sticky top-0 z-10 space-y-2 border-b border-slate-100 bg-white/95 p-2 backdrop-blur-md"
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={buyQuery}
                          onChange={(e) => setBuyQuery(e.target.value)}
                          placeholder="Search symbol or name..."
                          aria-label="Filter tokens to receive"
                          className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-800 outline-none focus:border-purple-400 focus:bg-white"
                        />
                        {buyQuery && (
                          <button
                            type="button"
                            onClick={() => setBuyQuery("")}
                            className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                      {quickTokens.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {quickTokens.map((qt) => (
                            <button
                              key={qt.symbol}
                              type="button"
                              disabled={qt.symbol === state.sellToken.symbol}
                              onClick={() => actions.setBuyToken(qt)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                                qt.symbol === state.buyToken.symbol
                                  ? "border-purple-600 bg-purple-600 text-white"
                                  : qt.symbol === state.sellToken.symbol
                                    ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-purple-300"
                              }`}
                            >
                              <TokenAvatar token={qt} size="sm" />
                              <span>{qt.symbol}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {filteredBuyTokens.map((token) => (
                      <SelectItem
                        key={token.symbol}
                        value={token.symbol}
                        className="rounded-xl py-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <TokenAvatar token={token} size="sm" />
                          <span className="font-semibold text-slate-900">{token.symbol}</span>
                          <span className="truncate text-xs text-slate-500">{token.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Route Choice Selector */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <Label
                htmlFor="swap-route"
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                <GitBranch className="size-3.5 text-purple-600" />
                Route
              </Label>
              {quote.bestVenue && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700">
                  Best: {quote.bestVenue}
                </span>
              )}
            </div>
            <Select
              value={quote.preferredVenue ?? BEST_PRICE}
              onValueChange={(value) =>
                actions.setPreferredVenue(value === BEST_PRICE ? null : (value as SmartRouteVenue))
              }
            >
              <SelectTrigger
                id="swap-route"
                className="h-9 w-full rounded-xl border-slate-200/90 bg-slate-50/70 text-xs font-medium sm:text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value={BEST_PRICE}>Best price (automatic)</SelectItem>
                {routeVenuesForChain(state.sellToken.chainId).map((venue) => {
                  const unavailable = !!quote.routedVenues && !quote.routedVenues.includes(venue);
                  const unsafe = quote.excludedVenues?.includes(venue);
                  return (
                    <SelectItem key={venue} value={venue} disabled={unavailable}>
                      {venue}
                      {unsafe ? " (excluded: unsafe deviation)" : unavailable ? " (no route)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {quote.status === "NO_ROUTE" && quote.preferredVenue && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full rounded-xl border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={() => actions.setPreferredVenue(null)}
              >
                Switch to best price
              </Button>
            )}
          </div>

          {/* Quote Information & Safety Telemetry */}
          {quote.comparisonText && (
            <p
              className={`rounded-xl border px-3 py-2 text-xs ${
                (quote.venueShortfallPercent ?? 0) >= 1
                  ? "border-orange-200 bg-orange-50/80 font-medium text-orange-700"
                  : "border-purple-200/70 bg-purple-50/60 text-purple-800"
              }`}
            >
              {quote.comparisonText}
            </p>
          )}

          {!!quote.excludedVenues?.length && (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 shadow-sm"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="size-4 text-amber-600" />
                <p>Route health: outlier quote excluded</p>
              </div>
              <p className="mt-1 leading-relaxed">
                {quote.excludedVenues.join(", ")} deviated more than 35% from the cross-venue median
                and cannot be selected or executed.
              </p>
            </div>
          )}

          {quote.bestVenue && (
            <p className="text-xs leading-relaxed text-slate-600">
              Eligible quotes are compared in the venue panel. Pool fees are included; network fees
              are separate. Private routing is unverified.
            </p>
          )}

          {quote.rate !== null && state.sellAmount && state.buyAmount && (
            <Card className="overflow-hidden rounded-2xl border-purple-200/80 bg-gradient-to-br from-purple-50/80 via-white to-pink-50/80 shadow-sm">
              {/* Visual Smart-Route Pipeline Header */}
              <div className="border-b border-purple-100/90 bg-white/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="inline-flex flex-wrap items-center gap-1 font-mono font-semibold text-slate-800">
                    <span className="whitespace-nowrap rounded-md bg-purple-100 px-1.5 py-0.5 text-[11px] text-purple-800">
                      {state.sellToken.symbol}
                    </span>
                    <ArrowRight className="size-3 shrink-0 text-slate-400" />
                    <span className="whitespace-nowrap rounded-md border border-purple-200 bg-white px-2 py-0.5 font-sans text-[11px] font-semibold text-purple-700">
                      {quote.preferredVenue ?? quote.bestVenue ?? "Smart Router"}
                    </span>
                    <ArrowRight className="size-3 shrink-0 text-slate-400" />
                    <span className="whitespace-nowrap rounded-md bg-pink-100 px-1.5 py-0.5 text-[11px] text-pink-800">
                      {state.buyToken.symbol}
                    </span>
                  </div>
                </div>
                {/* Freshness countdown progress bar */}
                {quote.observedAt && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                      style={{ width: `${freshnessPercent}%` }}
                    />
                  </div>
                )}
              </div>

              <CardContent className="space-y-1.5 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-slate-600">Execution rate</span>
                  <button
                    type="button"
                    onClick={() => setInvertRate((v) => !v)}
                    className="min-w-0 truncate text-right font-mono font-semibold text-slate-900 underline-offset-2 hover:text-purple-700 hover:underline"
                    title="Click to invert rate display"
                  >
                    {!invertRate || quote.rate === 0
                      ? `1 ${state.sellToken.symbol} = ${formatSwapAmount(quote.rate)} ${state.buyToken.symbol}`
                      : `1 ${state.buyToken.symbol} = ${formatSwapAmount(1 / quote.rate)} ${state.sellToken.symbol}`}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-slate-600">Route</span>
                  <span className="text-right font-medium text-slate-800">
                    {quote.routeDescription ?? "Pending"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex shrink-0 items-center gap-1 text-slate-600">
                    <Clock className="size-3 text-slate-400" /> Quote freshness
                  </span>
                  <span className="text-right font-mono font-medium text-slate-800">
                    {quote.observedAt
                      ? `${quoteAgeSeconds}s old · expires in ${quoteExpiresIn}s`
                      : "Pending"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-slate-600">Quoted block</span>
                  <span className="text-right font-mono font-medium text-slate-800">
                    {quote.blockNumber ? `#${quote.blockNumber.toLocaleString()}` : "Pending"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-slate-600">Estimated network fee</span>
                  <span className="text-right font-medium text-slate-800">
                    {quote.estimatedNetworkFee ?? "Available in wallet"}
                  </span>
                </div>

                <p className="rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500">
                  Net value is not calculated because a reliable fee estimate is not available
                  before wallet simulation.
                </p>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-600">Slippage</span>
                  <span className="font-mono font-medium text-slate-800">{state.slippage}%</span>
                </div>

                {quote.minimumReceived !== null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="shrink-0 text-slate-600">Minimum received</span>
                    <span className="min-w-0 truncate text-right font-mono font-semibold text-slate-900">
                      {formatSwapAmount(quote.minimumReceived)} {state.buyToken.symbol}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-slate-600">Price impact (incl. fees)</span>
                  <span
                    className={`text-right font-mono font-semibold ${
                      severeImpact
                        ? "text-red-700"
                        : highImpact
                          ? "text-orange-700"
                          : "text-emerald-700"
                    }`}
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
              className={`rounded-2xl border p-3.5 text-sm shadow-sm ${
                severeImpact
                  ? "border-red-200 bg-red-50/95 text-red-900"
                  : "border-orange-200 bg-orange-50/95 text-orange-900"
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="size-4 shrink-0" />
                <p>
                  {severeImpact ? "Very high" : "High"} price impact:{" "}
                  {quote.priceImpact!.toFixed(2)}%
                </p>
              </div>
              <p className="mt-1 text-xs leading-relaxed">
                Your trade is large relative to the available liquidity. Consider a smaller amount.
                You must confirm this impact before continuing to your wallet.
              </p>
              <p className="mt-1 text-[11px] opacity-85">
                Compared with this route's pre-trade pool price; includes pool fees. Slippage is
                separate.
              </p>
            </div>
          )}

          {quote.status === "SUCCESS" && quote.priceImpact === null && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900"
            >
              <p>Price impact could not be verified. Refresh the quote before swapping.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 rounded-xl"
                onClick={quote.refresh}
                disabled={quote.isRefreshing}
              >
                Refresh quote
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {approval.needed && (
              <Button
                className="h-11 w-full rounded-2xl bg-slate-900 font-bold text-white shadow-sm transition-all hover:bg-purple-800"
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
              className={`h-12 w-full rounded-2xl text-base font-bold transition-all ${
                isPrimaryDisabled
                  ? "border border-slate-200 bg-slate-100 text-slate-500 shadow-none disabled:opacity-100"
                  : "transform bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white shadow-lg shadow-purple-500/20 hover:scale-[1.01] hover:from-purple-700 hover:via-fuchsia-700 hover:to-pink-700"
              }`}
              onClick={handlePrimaryAction}
              disabled={isPrimaryDisabled}
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
            <div
              className="space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3"
              role="status"
              aria-live="polite"
            >
              {approveHash && (
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
                  <span className="font-semibold">Approval: </span>
                  <a
                    href={`https://etherscan.io/tx/${approveHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-medium text-purple-700 hover:underline"
                  >
                    View on Etherscan
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </div>
              )}
              {swapHash && (
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
                  <span className="font-semibold">Swap: </span>
                  <a
                    href={`https://etherscan.io/tx/${swapHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-medium text-purple-700 hover:underline"
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
