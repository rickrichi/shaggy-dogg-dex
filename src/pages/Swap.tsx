// src/pages/Swap.tsx - Refactored to Production Standards
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Activity, Fuel } from "lucide-react";
import { formatGwei } from "viem";
import { useAccount, useBlockNumber, useGasPrice, useSwitchChain } from "wagmi";

import { LimitOrderCard } from "@/components/swap/LimitOrderCard";
import { MarketScanner } from "@/components/swap/MarketScanner";
import { PriceChart } from "@/components/swap/PriceChart";
import { SwapCard } from "@/components/swap/SwapCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isSwapChain } from "@/config/contracts";
import { getSwapDropdownTokens, getTokensForChain, type Token } from "@/config/tokens";
import { useSwap } from "@/hooks/useSwap";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

type TradeMode = "swap" | "buy" | "limit" | "sell";

type StableSymbol = "USDC" | "USDT" | "DAI";

interface SwapModeConfig {
  readonly mode: TradeMode;
  readonly label: string;
  readonly sellToken: Token;
  readonly buyToken: Token;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const STABLE_SYMBOLS: ReadonlySet<StableSymbol> = new Set(["USDC", "USDT", "DAI"]);

const TRADE_MODES: readonly TradeMode[] = ["swap", "buy", "limit", "sell"] as const;

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Pure, no side effects)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Type guard to check if a symbol is a known stablecoin
 */
function isStableSymbol(symbol: string): symbol is StableSymbol {
  return STABLE_SYMBOLS.has(symbol as StableSymbol);
}

/**
 * Safely parse and validate trade mode from URL parameter
 */
function parseTradeMode(param: string | null): TradeMode {
  if (param && TRADE_MODES.includes(param as TradeMode)) {
    return param as TradeMode;
  }
  return "swap";
}

/**
 * Get initial token from URL param or fallback to index
 */
function getInitialToken(param: string | null, fallbackIndex: number, chainId?: number): Token {
  const chainTokens = getSwapDropdownTokens(chainId);
  const fallback = chainTokens[fallbackIndex] ?? chainTokens[0];
  if (!fallback) {
    throw new Error("Tokens list must include at least one token");
  }

  if (!param) return fallback;

  if (param.toLowerCase() === "native" || param.toUpperCase() === "ETH") {
    const nativeToken = chainTokens.find((t) => t.kind === "native");
    return nativeToken ?? fallback;
  }

  const normalized = param.toLowerCase();
  const aliasedSymbol =
    {
      btc: "cbbtc",
      sol: "usol",
      xrp: "cbxrp",
      ada: "cbada",
      avax: "uavax",
      near: "unear",
      atom: "uatom",
      xtz: "wxtz",
      zec: "uzec",
      loop: "lrc",
    }[normalized] ?? normalized;
  const found =
    chainTokens.find(
      (t) => t.address.toLowerCase() === normalized || t.symbol.toLowerCase() === normalized
    ) ?? chainTokens.find((t) => t.symbol.toLowerCase() === aliasedSymbol);
  return found ?? fallback;
}

/**
 * Find first stablecoin in token list (type-safe, no `as any`)
 */
function getFirstStable(fallback: Token, chainId?: number): Token {
  const chainTokens = getTokensForChain(chainId);
  const stable = chainTokens.find((t) => isStableSymbol(t.symbol));
  return stable ?? fallback;
}

/**
 * Find first non-stablecoin in token list (type-safe, no `as any`)
 */
function getFirstNonStable(fallback: Token, chainId?: number): Token {
  const chainTokens = getTokensForChain(chainId);
  const nonStable = chainTokens.find((t) => !isStableSymbol(t.symbol));
  return nonStable ?? fallback;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function Swap() {
  // ────────────────────────────────────────────────────────────────────────────
  // Hooks (must be called unconditionally at top level)
  // ────────────────────────────────────────────────────────────────────────────

  const { chain, isConnected } = useAccount();
  const { data: blockNumber } = useBlockNumber({ chainId: chain?.id ?? 8453, watch: true });
  const { data: gasPrice } = useGasPrice({ chainId: chain?.id ?? 8453 });
  const { isPending: isSwitchingChain, switchChain } = useSwitchChain();
  const [searchParams, setSearchParams] = useSearchParams();

  // ────────────────────────────────────────────────────────────────────────────
  // URL State Management
  // ────────────────────────────────────────────────────────────────────────────

  const urlParams = useMemo(
    () => ({
      input: searchParams.get("input"),
      output: searchParams.get("output"),
      mode: parseTradeMode(searchParams.get("mode")),
    }),
    [searchParams]
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Local State
  // ────────────────────────────────────────────────────────────────────────────

  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<TradeMode>(urlParams.mode);

  // Sync mode with URL on navigation
  useEffect(() => {
    if (urlParams.mode !== mode) {
      setMode(urlParams.mode);
    }
  }, [urlParams.mode]); // Intentionally excluding `mode` to avoid infinite loop

  // ────────────────────────────────────────────────────────────────────────────
  // Token Selection Logic
  // ────────────────────────────────────────────────────────────────────────────

  const chainTokens = useMemo(() => getSwapDropdownTokens(chain?.id ?? 8453), [chain?.id]);

  const baseTokens = useMemo(
    () => ({
      initialSell: getInitialToken(urlParams.input, 0, chain?.id ?? 8453),
      initialBuy: getInitialToken(urlParams.output, 1, chain?.id ?? 8453),
    }),
    [urlParams.input, urlParams.output, chain?.id]
  );

  const specialTokens = useMemo(
    () => ({
      stable: getFirstStable(baseTokens.initialSell, chain?.id ?? 8453),
      nonStable: getFirstNonStable(baseTokens.initialBuy, chain?.id ?? 8453),
    }),
    [baseTokens.initialSell, baseTokens.initialBuy, chain?.id]
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Swap Hook Instances
  // ────────────────────────────────────────────────────────────────────────────
  // NOTE: We MUST call all 4 hooks unconditionally due to React's Rules of Hooks.
  // This is not a bug - React requires hooks to be called in the same order on
  // every render. We cannot conditionally call hooks based on `mode`.
  // Performance impact is minimal as hooks are lightweight until actively used.
  // ────────────────────────────────────────────────────────────────────────────

  const swapInstances = {
    swap: useSwap(baseTokens.initialSell, baseTokens.initialBuy),
    buy: useSwap(specialTokens.stable, specialTokens.nonStable),
    limit: useSwap(baseTokens.initialSell, baseTokens.initialBuy),
    sell: useSwap(specialTokens.nonStable, specialTokens.stable),
  } as const;

  // Select active swap based on mode
  const activeSwap = swapInstances[mode];
  const { sellToken, buyToken } = activeSwap.state;

  // ────────────────────────────────────────────────────────────────────────────
  // URL Synchronization
  // ────────────────────────────────────────────────────────────────────────────

  const updateURL = useCallback(() => {
    const params = new URLSearchParams();

    // Only add params if they differ from defaults
    if (sellToken.address !== "native") {
      params.set("input", sellToken.address);
    }
    if (buyToken.address !== "native") {
      params.set("output", buyToken.address);
    }
    if (mode !== "swap") {
      params.set("mode", mode);
    }

    const newParams = params.toString();
    const currentParams = searchParams.toString();

    // Only update if params actually changed
    if (newParams !== currentParams) {
      setSearchParams(params, { replace: true });
    }
  }, [sellToken.address, buyToken.address, mode, searchParams, setSearchParams]);

  useEffect(() => {
    updateURL();
  }, [updateURL]);

  // ────────────────────────────────────────────────────────────────────────────
  // Chart Configuration
  // ────────────────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────────────────
  // Tab Configuration (DRY - eliminates repetitive TabsContent)
  // ────────────────────────────────────────────────────────────────────────────

  const tabConfigs: readonly SwapModeConfig[] = useMemo(
    () => [
      { mode: "swap", label: "Swap", ...swapInstances.swap.state },
      { mode: "buy", label: "Buy", ...swapInstances.buy.state },
      { mode: "limit", label: "Limit", ...swapInstances.limit.state },
      { mode: "sell", label: "Sell", ...swapInstances.sell.state },
    ],
    [
      swapInstances.swap.state,
      swapInstances.buy.state,
      swapInstances.limit.state,
      swapInstances.sell.state,
    ]
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ────────────────────────────────────────────────────────────────────────────

  const handleModeChange = useCallback((newMode: string) => {
    setMode(newMode as TradeMode);
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Top Bar: Market Stats */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
            Shaggy DEX
          </h1>
          <p className="text-sm text-slate-500">Advanced Swaps &amp; Liquidity</p>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs md:text-sm">
          {gasPrice && (
            <div className="flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1.5 text-amber-700">
              <Fuel className="size-4" />
              <span>{formatGwei(gasPrice)} Gwei</span>
            </div>
          )}
          {blockNumber && (
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
              <Activity className="size-4" />
              <span>#{blockNumber.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Swap comes first in both reading order and mobile layout. */}
        <div className="order-1 min-w-0 lg:col-span-1">
          <div className="relative space-y-3">
            <Tabs value={mode} onValueChange={handleModeChange}>
              <TabsList className="mb-3 grid w-full grid-cols-4">
                {tabConfigs.map(({ mode: tabMode, label }) => (
                  <TabsTrigger key={tabMode} value={tabMode}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* DRY: Map over config instead of duplicating TabsContent */}
              {tabConfigs.map(({ mode: tabMode }) => (
                <TabsContent key={tabMode} value={tabMode} className="mt-0">
                  {tabMode === "limit" ? (
                    <LimitOrderCard
                      swap={swapInstances[tabMode]}
                      tokens={chainTokens}
                      showSettings={showSettings}
                      onSettingsChange={setShowSettings}
                    />
                  ) : (
                    <SwapCard
                      swap={swapInstances[tabMode]}
                      tokens={chainTokens}
                      isCorrectNetwork={
                        !isConnected ||
                        (isSwapChain(chain?.id) &&
                          chain?.id === swapInstances[tabMode].state.sellToken.chainId)
                      }
                      isSwitchingNetwork={isSwitchingChain}
                      onSwitchNetwork={() =>
                        switchChain({ chainId: swapInstances[tabMode].state.sellToken.chainId })
                      }
                      showSettings={showSettings}
                      onSettingsChange={setShowSettings}
                    />
                  )}
                </TabsContent>
              ))}
            </Tabs>

            {!isConnected && (
              <div className="mt-1 rounded-lg border border-amber-100 bg-amber-50/50 p-4 text-center text-sm text-amber-800">
                Connect wallet to execute trades. Viewing mode active.
              </div>
            )}
          </div>
        </div>
        {/* Trade comparison and market tools */}
        <div className="order-2 min-w-0 lg:col-span-2">
          <PriceChart swap={activeSwap} />

          <MarketScanner />
        </div>
      </div>
    </div>
  );
}
