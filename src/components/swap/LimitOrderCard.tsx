// src/components/swap/LimitOrderCard.tsx
import { memo, useMemo, useState } from "react";

import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ExternalLink,
  Settings,
} from "lucide-react";
import { formatUnits } from "viem";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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

import type { Token } from "@/config/tokens";
import type { UseSwapReturn } from "@/hooks/useSwap";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

type ExpiryOption = "1h" | "24h" | "7d" | "30d" | "custom";

interface ExpiryConfig {
  readonly label: string;
  readonly seconds: number;
}

interface LimitOrderCardProps {
  swap: UseSwapReturn;
  tokens: readonly Token[];
  approveHash?: `0x${string}`;
  swapHash?: `0x${string}`;
  showSettings: boolean;
  onSettingsChange: (open: boolean) => void;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const EXPIRY_OPTIONS: Record<ExpiryOption, ExpiryConfig> = {
  "1h": { label: "1 Hour", seconds: 3600 },
  "24h": { label: "24 Hours", seconds: 86400 },
  "7d": { label: "7 Days", seconds: 604800 },
  "30d": { label: "30 Days", seconds: 2592000 },
  custom: { label: "Custom", seconds: 0 },
} as const;

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export const LimitOrderCard = memo<LimitOrderCardProps>(
  ({ swap, tokens, approveHash, swapHash, showSettings, onSettingsChange }) => {
    const { state, balances, actions } = swap;

    // ────────────────────────────────────────────────────────────────────────────
    // Limit Order Specific State
    // ────────────────────────────────────────────────────────────────────────────

    const [limitPrice, setLimitPrice] = useState<string>("");
    const [expiry, setExpiry] = useState<ExpiryOption>("24h");
    const [customExpiryHours, setCustomExpiryHours] = useState<string>("");

    // ────────────────────────────────────────────────────────────────────────────
    // Computed Values
    // ────────────────────────────────────────────────────────────────────────────

    const formatBalance = (balance: typeof balances.sell) => {
      if (!balance) return "0.0000";
      return parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4);
    };

    const expiryTimestamp = useMemo(() => {
      if (expiry === "custom") {
        const hours = parseFloat(customExpiryHours) || 0;
        return Date.now() + hours * 3600 * 1000;
      }
      return Date.now() + EXPIRY_OPTIONS[expiry].seconds * 1000;
    }, [expiry, customExpiryHours]);

    const expiryDate = useMemo(() => {
      return new Date(expiryTimestamp).toLocaleString();
    }, [expiryTimestamp]);

    const calculatedReceiveAmount = useMemo(() => {
      if (!state.sellAmount || !limitPrice) return "0.0";
      const sellAmt = parseFloat(state.sellAmount);
      const price = parseFloat(limitPrice);
      return (sellAmt * price).toFixed(6);
    }, [state.sellAmount, limitPrice]);

    const currentMarketPrice = useMemo(() => {
      if (!state.sellAmount || !state.buyAmount) return null;
      const sellAmt = parseFloat(state.sellAmount);
      const buyAmt = parseFloat(state.buyAmount);
      if (sellAmt === 0) return null;
      return buyAmt / sellAmt;
    }, [state.sellAmount, state.buyAmount]);

    const priceDiscrepancy = useMemo(() => {
      if (!currentMarketPrice || !limitPrice) return null;
      const limit = parseFloat(limitPrice);
      const market = currentMarketPrice;
      const diff = ((limit - market) / market) * 100;
      return {
        percentage: diff,
        isBetter: diff > 0,
      };
    }, [currentMarketPrice, limitPrice]);

    // ────────────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ────────────────────────────────────────────────────────────────────────────

    const handleUseMarketPrice = () => {
      if (currentMarketPrice) {
        setLimitPrice(currentMarketPrice.toFixed(6));
      }
    };

    // ────────────────────────────────────────────────────────────────────────────
    // Render
    // ────────────────────────────────────────────────────────────────────────────

    return (
      <Card className="border-2 border-blue-200 bg-white/95 shadow-xl backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Clock className="size-5 text-blue-600" />
              Limit Order Preview
            </CardTitle>
            <Dialog open={showSettings} onOpenChange={onSettingsChange}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Limit order settings"
                  className="hover:bg-blue-50"
                >
                  <Settings className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Limit Order Settings</DialogTitle>
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
          {/* Important Disclaimer */}
          <Alert className="border-amber-200 bg-amber-50">
            <AlertCircle className="size-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-800">
              <strong>Preview only:</strong> this build has no limit-order contract, keeper, or
              escrow. It cannot create, approve, or execute a limit order.
            </AlertDescription>
          </Alert>

          {/* Sell Token Input */}
          <div className="space-y-2">
            <Label htmlFor="sell-amount" className="text-sm font-medium text-gray-700">
              You pay
            </Label>
            <div className="flex space-x-2">
              <div className="flex-1">
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
                <SelectTrigger className="w-36" aria-label="Select token to sell">
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
                  className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700"
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
              className="rounded-full border-2 border-gray-200 transition-all hover:border-blue-300 hover:bg-blue-50"
              aria-label="Reverse token order"
            >
              <ArrowUpDown className="size-4" />
            </Button>
          </div>

          {/* Buy Token Selection */}
          <div className="space-y-2">
            <Label htmlFor="buy-token" className="text-sm font-medium text-gray-700">
              You receive
            </Label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <Input
                  id="calculated-receive"
                  type="text"
                  value={calculatedReceiveAmount}
                  className="bg-gray-50 text-lg font-medium"
                  readOnly
                  aria-label="Calculated receive amount"
                />
              </div>
              <Select
                value={state.buyToken.symbol}
                onValueChange={(symbol) => {
                  const token = tokens.find((t) => t.symbol === symbol);
                  if (token) actions.setBuyToken(token);
                }}
              >
                <SelectTrigger className="w-36" aria-label="Select token to receive">
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

          {/* Limit Price Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="limit-price" className="text-sm font-medium text-gray-700">
                Limit Price
              </Label>
              {currentMarketPrice && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700"
                  onClick={handleUseMarketPrice}
                >
                  Use market price
                </Button>
              )}
            </div>
            <div className="relative">
              <Input
                id="limit-price"
                type="number"
                placeholder="0.0"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="pr-20 text-lg font-medium"
                min="0"
                step="any"
                aria-label="Limit price"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                {state.buyToken.symbol}/{state.sellToken.symbol}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              {currentMarketPrice && (
                <span className="text-gray-500">
                  Market: {currentMarketPrice.toFixed(6)} {state.buyToken.symbol}/
                  {state.sellToken.symbol}
                </span>
              )}
              {priceDiscrepancy && (
                <span className={priceDiscrepancy.isBetter ? "text-green-600" : "text-red-600"}>
                  {priceDiscrepancy.isBetter ? "+" : ""}
                  {priceDiscrepancy.percentage.toFixed(2)}%
                </span>
              )}
            </div>
          </div>

          {/* Expiry Settings */}
          <div className="space-y-2">
            <Label htmlFor="expiry" className="text-sm font-medium text-gray-700">
              Expiry
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(EXPIRY_OPTIONS) as ExpiryOption[]).map((option) => (
                <Button
                  key={option}
                  variant={expiry === option ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExpiry(option)}
                  className="text-xs"
                >
                  {EXPIRY_OPTIONS[option].label}
                </Button>
              ))}
            </div>
            {expiry === "custom" && (
              <Input
                type="number"
                placeholder="Hours"
                value={customExpiryHours}
                onChange={(e) => setCustomExpiryHours(e.target.value)}
                className="mt-2"
                min="0.1"
                step="0.1"
                aria-label="Custom expiry in hours"
              />
            )}
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="size-3" />
              Expires: {expiryDate}
            </div>
          </div>

          {/* Order Summary */}
          {limitPrice && state.sellAmount && (
            <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardContent className="space-y-2 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Order Type</span>
                  <span className="font-medium">Limit Order Preview</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Limit Price</span>
                  <span className="font-medium">
                    {parseFloat(limitPrice).toFixed(6)} {state.buyToken.symbol}/
                    {state.sellToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">You will receive</span>
                  <span className="font-medium">
                    ≈ {calculatedReceiveAmount} {state.buyToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Slippage Tolerance</span>
                  <span className="font-medium">{state.slippage}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button className="w-full bg-slate-400 py-3 font-medium text-white" disabled>
              Limit orders are not available in this build
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
                  <span>Order: </span>
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

LimitOrderCard.displayName = "LimitOrderCard";
