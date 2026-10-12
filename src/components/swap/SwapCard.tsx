// src/components/swap/SwapCard.tsx
import { memo } from "react";

import { ArrowUpDown, CheckCircle2, ExternalLink, Loader2, Settings } from "lucide-react";
import { formatUnits } from "viem";

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

    const formatBalance = (balance: typeof balances.sell) => {
      if (!balance) return "0.0000";
      return parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4);
    };

    const swapButtonLabel = (() => {
      if (!isCorrectNetwork) return isSwitchingNetwork ? "Switching network..." : "Switch to Base";
      if (swapActions.isSwapping) return "Swapping...";
      if (!state.sellAmount) return "Enter amount";
      if (quote.status === "LOADING") return "Fetching best price...";
      if (quote.status === "NO_ROUTE" || quote.status === "ERROR") return "Route unavailable";
      if (approval.needed) return "Approve token first";
      if (!swapActions.canSwap) return "Insufficient balance";
      return "Swap";
    })();

    const handlePrimaryAction = () => {
      if (!isCorrectNetwork) {
        onSwitchNetwork?.();
        return;
      }
      void swapActions.execute();
    };

    return (
      <Card className="border-2 border-purple-200 bg-white/95 shadow-xl backdrop-blur-sm">
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
                <SelectTrigger className="w-32" aria-label="Select token to sell">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{token.symbol}</span>
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
              <div className="flex-1">
                <Input
                  id="buy-amount"
                  type="number"
                  placeholder="0.0"
                  value={state.buyAmount}
                  className="bg-gray-50 text-lg font-medium"
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
                <SelectTrigger className="w-32" aria-label="Select token to receive">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{token.symbol}</span>
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

          {/* Quote Information */}
          {quote.comparisonText && (
            <p className="text-sm text-purple-800">{quote.comparisonText}</p>
          )}
          {quote.bestVenue && (
            <div className="text-xs text-slate-600">
              <p>
                Uniswap V3: {quote.uniswapV3AmountOut ?? "No route"} · Uniswap V2:{" "}
                {quote.uniswapAmountOut ?? "No route"} · Aerodrome:{" "}
                {quote.aerodromeAmountOut ?? "No route"} {state.buyToken.symbol}
              </p>
              <p>
                Pool fees are included. Network fees are separate. Submission uses your wallet’s
                RPC; private routing is unverified.
              </p>
            </div>
          )}
          {quote.rate !== null && state.sellAmount && state.buyAmount && (
            <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <CardContent className="space-y-2 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Rate</span>
                  <span className="font-medium">
                    1 {state.sellToken.symbol} = {quote.rate.toFixed(4)} {state.buyToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Slippage</span>
                  <span className="font-medium">{state.slippage}%</span>
                </div>
                {quote.minimumReceived !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Minimum received</span>
                    <span className="font-medium">
                      {quote.minimumReceived.toFixed(6)} {state.buyToken.symbol}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
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
