// src/pages/Swap.tsx - Refactored to Production Standards
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  Activity,
  ArrowRight,
  ExternalLink,
  Fuel,
  QrCode,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { formatGwei } from "viem";
import { useAccount, useBlockNumber, useGasPrice, useSwitchChain } from "wagmi";

import { MarketScanner } from "@/components/swap/MarketScanner";
import { PriceChart } from "@/components/swap/PriceChart";
import { SwapCard } from "@/components/swap/SwapCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUniswapV2Router, isSwapChain } from "@/config/contracts";
import { getSwapDropdownTokens, type Token } from "@/config/tokens";
import { useSwap } from "@/hooks/useSwap";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

// Swap and Limit open on ETH -> USDC (never a project token); a URL ?output= still picks another.
const DEFAULT_BUY_SYMBOL = "USDC";

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Pure, no side effects)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get initial token from URL param or fall back to a symbol (or list position when the chain lacks it)
 */
function getInitialToken(
  param: string | null,
  fallbackIndex: number,
  chainId?: number,
  fallbackSymbol?: string
): Token {
  const chainTokens = getSwapDropdownTokens(chainId);
  const fallback =
    (fallbackSymbol ? chainTokens.find((t) => t.symbol === fallbackSymbol) : undefined) ??
    chainTokens[fallbackIndex] ??
    chainTokens[0];
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
    }),
    [searchParams]
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Local State
  // ────────────────────────────────────────────────────────────────────────────

  const [showSettings, setShowSettings] = useState(false);
  // Sync mode with URL on navigation
  // ────────────────────────────────────────────────────────────────────────────
  // Token Selection Logic
  // ────────────────────────────────────────────────────────────────────────────

  const chainTokens = useMemo(() => getSwapDropdownTokens(chain?.id ?? 8453), [chain?.id]);

  const baseTokens = useMemo(() => {
    const initialSell = getInitialToken(urlParams.input, 0, chain?.id ?? 8453);
    const requestedBuy = getInitialToken(
      urlParams.output,
      1,
      chain?.id ?? 8453,
      DEFAULT_BUY_SYMBOL
    );
    const initialBuy =
      requestedBuy.address.toLowerCase() !== initialSell.address.toLowerCase()
        ? requestedBuy
        : (chainTokens.find(
            (token) => token.address.toLowerCase() !== initialSell.address.toLowerCase()
          ) ?? requestedBuy);
    return { initialSell, initialBuy };
  }, [urlParams.input, urlParams.output, chain?.id, chainTokens]);

  // ────────────────────────────────────────────────────────────────────────────
  // Swap Hook Instances
  // ────────────────────────────────────────────────────────────────────────────
  // NOTE: We MUST call all 4 hooks unconditionally due to React's Rules of Hooks.
  // This is not a bug - React requires hooks to be called in the same order on
  // every render. We cannot conditionally call hooks based on `mode`.
  // Performance impact is minimal as hooks are lightweight until actively used.
  // ────────────────────────────────────────────────────────────────────────────

  const activeSwap = useSwap(baseTokens.initialSell, baseTokens.initialBuy);
  const { sellToken, buyToken } = activeSwap.state;

  const mrwdToken = useMemo(
    () => chainTokens.find((t) => t.symbol.toUpperCase() === "MRWD"),
    [chainTokens]
  );
  const nativeEthToken = useMemo(() => chainTokens.find((t) => t.kind === "native"), [chainTokens]);
  const isBuyingMrwd = buyToken.symbol.toUpperCase() === "MRWD";

  const handleSelectBuyMrwd = useCallback(() => {
    if (!mrwdToken) return;
    if (nativeEthToken && sellToken.symbol.toUpperCase() === "MRWD") {
      activeSwap.actions?.setSellToken(nativeEthToken);
    }
    activeSwap.actions?.setBuyToken(mrwdToken);
  }, [activeSwap.actions, mrwdToken, nativeEthToken, sellToken.symbol]);

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
    const newParams = params.toString();
    const currentParams = searchParams.toString();

    // Only update if params actually changed
    if (newParams !== currentParams) {
      setSearchParams(params, { replace: true });
    }
  }, [sellToken.address, buyToken.address, searchParams, setSearchParams]);

  useEffect(() => {
    updateURL();
  }, [updateURL]);

  // ────────────────────────────────────────────────────────────────────────────
  // Chart Configuration
  // ────────────────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────────────────
  // Tab Configuration (DRY - eliminates repetitive TabsContent)
  // ────────────────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ────────────────────────────────────────────────────────────────────────────

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

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs md:text-sm">
          {mrwdToken && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 font-sans text-xs font-semibold text-emerald-900 shadow-sm">
              <Sparkles className="size-3.5 text-emerald-600" />
              <span>Mutt Rewards ($MRWD): 1B unlocks Equilnyxs Pro · Q1 LP rewards live</span>
              {!isBuyingMrwd ? (
                <button
                  type="button"
                  onClick={handleSelectBuyMrwd}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                >
                  Buy $MRWD <ArrowRight className="size-3" />
                </button>
              ) : (
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                  ETH → MRWD active
                </span>
              )}
              <Link
                to="/stake"
                className="text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
              >
                Stake
              </Link>
            </div>
          )}
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
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-5 lg:gap-8">
        {/* Swap comes first in both reading order and mobile layout. */}
        <div className="order-1 min-w-0 lg:col-span-2">
          <div className="relative space-y-3">
            <Tabs value="swap">
              <TabsList className="mb-3 grid w-full grid-cols-2">
                <TabsTrigger value="swap">Swap</TabsTrigger>
                <TabsTrigger value="limit" disabled aria-label="Limit orders coming soon">
                  Limit · Soon
                </TabsTrigger>
              </TabsList>
              <TabsContent value="swap" className="mt-0">
                <SwapCard
                  swap={activeSwap}
                  tokens={chainTokens}
                  isCorrectNetwork={
                    !isConnected ||
                    (isSwapChain(chain?.id) && chain?.id === activeSwap.state.sellToken.chainId)
                  }
                  isSwitchingNetwork={isSwitchingChain}
                  onSwitchNetwork={() =>
                    switchChain({ chainId: activeSwap.state.sellToken.chainId })
                  }
                  showSettings={showSettings}
                  onSettingsChange={setShowSettings}
                />
              </TabsContent>
            </Tabs>

            <aside
              aria-label="Trade safety and contract information"
              className="rounded-xl border border-emerald-200 bg-white/90 p-3 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <ShieldCheck className="size-4" /> Base · Non-custodial
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Trades and approvals are signed in your wallet. Contracts have not received an
                independent third-party audit.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <a
                  className="inline-flex items-center gap-1 text-purple-700 underline-offset-2 hover:underline"
                  href={`https://basescan.org/address/${getUniswapV2Router(8453)}#code`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Configured router <ExternalLink className="size-3" />
                </a>
                <a
                  className="inline-flex items-center gap-1 text-purple-700 underline-offset-2 hover:underline"
                  href="https://revoke.cash/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Review/revoke approvals <ExternalLink className="size-3" />
                </a>
              </div>
            </aside>

            {!isConnected && (
              <div className="mt-1 space-y-2.5 rounded-lg border border-amber-100 bg-amber-50/50 p-4 text-center text-sm text-amber-800">
                <p>Connect wallet to execute trades. Viewing mode active.</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("shaggy:open-wallet-connect", { detail: { view: "qr" } })
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-purple-700 hover:to-pink-700"
                  >
                    <QrCode className="size-3.5" />
                    <span>MetaMask Mobile QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("shaggy:open-wallet-connect", { detail: { view: "list" } })
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 transition hover:bg-purple-50"
                  >
                    <Wallet className="size-3.5" />
                    <span>All Wallets</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Trade comparison and market tools */}
        <div className="order-2 min-w-0 lg:col-span-3">
          <PriceChart swap={activeSwap} />

          <MarketScanner />
        </div>
      </div>
    </div>
  );
}
