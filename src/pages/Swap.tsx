// src/pages/Swap.tsx - 2026 DeFi Flagship Standards
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  Activity,
  ArrowRight,
  Cpu,
  ExternalLink,
  Fuel,
  Layers,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { type Address, erc20Abi, formatGwei, getAddress } from "viem";
import { useAccount, useBlockNumber, useGasPrice, usePublicClient, useSwitchChain } from "wagmi";

import { MarketScanner } from "@/components/swap/MarketScanner";
import { PriceChart } from "@/components/swap/PriceChart";
import { SwapCard } from "@/components/swap/SwapCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUniswapV2Router, isSwapChain } from "@/config/contracts";
import {
  type Erc20Token,
  getSwapDropdownTokens,
  isErc20Token,
  type Token,
} from "@/config/tokens";
import { useSwap } from "@/hooks/useSwap";
import { routeVenuesForChain } from "@/lib/amm/smart-routing";
import { fetchPrices } from "@/lib/api/prices";

import type { AddressHex } from "@/types/token";

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

// Swap and Limit open on ETH -> USDC (never a project token); a URL ?output= still picks another.
const DEFAULT_BUY_SYMBOL = "USDC";
const CUSTOM_TOKENS_STORAGE_KEY = "shaggy:custom-swap-tokens:v1";
const NATIVE_PRICE_ADDRESS = "0x0000000000000000000000000000000000000000";

const QUICK_PAIRS: ReadonlyArray<{
  readonly label: string;
  readonly sellSymbol: string;
  readonly buySymbol: string;
  readonly badge?: string;
}> = [
  { label: "ETH / USDC", sellSymbol: "ETH", buySymbol: "USDC", badge: "Core" },
  { label: "ETH / SD", sellSymbol: "ETH", buySymbol: "SD", badge: "Mutt" },
  { label: "ETH / MRWD", sellSymbol: "ETH", buySymbol: "MRWD", badge: "Rewards" },
  { label: "USDC / cbBTC", sellSymbol: "USDC", buySymbol: "cbBTC" },
  { label: "ETH / AERO", sellSymbol: "ETH", buySymbol: "AERO" },
];

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Pure, no side effects)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get initial token from URL param or fall back to a symbol (or list position when the chain lacks it)
 */
function getInitialToken(
  param: string | null,
  fallbackIndex: number,
  chainTokens: readonly Token[],
  fallbackSymbol?: string
): Token {
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

function formatCompactGwei(gasPrice: bigint): string {
  const raw = Number(formatGwei(gasPrice));
  if (!Number.isFinite(raw)) return formatGwei(gasPrice);
  if (raw >= 10) return raw.toFixed(1);
  if (raw >= 1) return raw.toFixed(2);
  return raw.toFixed(4);
}

function loadSessionCustomTokens(): Erc20Token[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(CUSTOM_TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Erc20Token =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as Erc20Token).kind === "erc20" &&
        typeof (item as Erc20Token).address === "string" &&
        typeof (item as Erc20Token).symbol === "string" &&
        typeof (item as Erc20Token).decimals === "number" &&
        typeof (item as Erc20Token).chainId === "number"
    );
  } catch {
    return [];
  }
}

export default function Swap() {
  // ────────────────────────────────────────────────────────────────────────────
  // Hooks (must be called unconditionally at top level)
  // ────────────────────────────────────────────────────────────────────────────

  const { chain, isConnected } = useAccount();
  const walletChainId = chain?.id ?? 8453;
  const { isPending: isSwitchingChain, switchChain } = useSwitchChain();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);
  const [customTokens, setCustomTokens] = useState<Erc20Token[]>(loadSessionCustomTokens);

  // Track query strings written by our own URL sync so internal token switches never trigger
  // an external-URL reset that wipes `sellAmount` or overwrites `ETH` buyToken back to `USDC`.
  const lastSyncedSearchRef = useRef<string | null>(null);
  const [externalUrlSeed, setExternalUrlSeed] = useState(() => ({
    input: searchParams.get("input"),
    output: searchParams.get("output"),
  }));

  useEffect(() => {
    const current = searchParams.toString();
    if (lastSyncedSearchRef.current !== null && current === lastSyncedSearchRef.current) {
      return;
    }
    lastSyncedSearchRef.current = current;
    setExternalUrlSeed({
      input: searchParams.get("input"),
      output: searchParams.get("output"),
    });
  }, [searchParams]);

  // ────────────────────────────────────────────────────────────────────────────
  // Token Selection Logic
  // ────────────────────────────────────────────────────────────────────────────

  const baseDropdownTokens = useMemo(() => {
    const builtins = getSwapDropdownTokens(walletChainId);
    if (customTokens.length === 0) return builtins;
    const existing = new Set(builtins.map((t) => `${t.chainId}:${t.address.toLowerCase()}`));
    const extras = customTokens.filter(
      (t) => !existing.has(`${t.chainId}:${t.address.toLowerCase()}`)
    );
    return [...builtins, ...extras];
  }, [walletChainId, customTokens]);

  const baseTokens = useMemo(() => {
    const initialSell = getInitialToken(externalUrlSeed.input, 0, baseDropdownTokens);
    const requestedBuy = getInitialToken(
      externalUrlSeed.output,
      1,
      baseDropdownTokens,
      DEFAULT_BUY_SYMBOL
    );
    const initialBuy =
      requestedBuy.address.toLowerCase() !== initialSell.address.toLowerCase()
        ? requestedBuy
        : (baseDropdownTokens.find(
            (token) => token.address.toLowerCase() !== initialSell.address.toLowerCase()
          ) ?? requestedBuy);
    return { initialSell, initialBuy };
  }, [externalUrlSeed.input, externalUrlSeed.output, baseDropdownTokens]);

  // ────────────────────────────────────────────────────────────────────────────
  // Swap Hook Instance
  // ────────────────────────────────────────────────────────────────────────────

  const activeSwap = useSwap(baseTokens.initialSell, baseTokens.initialBuy);
  const { sellToken, buyToken } = activeSwap.state;

  // Reflect the selected token pair's network when disconnected so L1 vs Base L2 badges & venues stay accurate.
  const displayChainId = isConnected && chain?.id ? chain.id : (sellToken?.chainId ?? walletChainId);
  const publicClient = usePublicClient({ chainId: displayChainId });
  const { data: blockNumber } = useBlockNumber({ chainId: displayChainId, watch: true });
  const { data: gasPrice } = useGasPrice({ chainId: displayChainId });

  const chainTokens = useMemo(() => {
    const builtins = getSwapDropdownTokens(displayChainId);
    if (customTokens.length === 0) return builtins;
    const existing = new Set(builtins.map((t) => `${t.chainId}:${t.address.toLowerCase()}`));
    const extras = customTokens.filter(
      (t) => !existing.has(`${t.chainId}:${t.address.toLowerCase()}`)
    );
    return [...builtins, ...extras];
  }, [displayChainId, customTokens]);

  const venueCount = useMemo(
    () => routeVenuesForChain(displayChainId).length,
    [displayChainId]
  );

  // Live USD valuations for the active pair (with instant ETH/USDC rate derivation)
  const [fetchedUsdPrices, setFetchedUsdPrices] = useState<ReadonlyMap<string, number>>(
    () => new Map()
  );

  useEffect(() => {
    if (!sellToken || !buyToken) return;
    const ctrl = new AbortController();
    const erc20Addrs = [sellToken, buyToken]
      .filter(isErc20Token)
      .map((t) => t.address as AddressHex);
    void fetchPrices({
      chainId: sellToken.chainId,
      addresses: erc20Addrs,
      includeThin: true,
      signal: ctrl.signal,
      timeoutMs: 6_000,
    })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const map = new Map<string, number>();
        for (const p of res.data.prices) {
          const addr = p.address.toLowerCase();
          if (addr === NATIVE_PRICE_ADDRESS) map.set("native", p.priceUsd);
          else map.set(addr, p.priceUsd);
        }
        setFetchedUsdPrices(map);
      })
      .catch(() => {
        // Non-blocking: live quotes still provide instant stablecoin valuation below
      });
    return () => ctrl.abort();
  }, [sellToken, buyToken]);

  const usdPrices = useMemo(() => {
    const map = new Map(fetchedUsdPrices);
    const stables = new Set(["USDC", "USDT", "DAI", "USDbC"]);
    if (sellToken && stables.has(sellToken.symbol) && !map.has(sellToken.address.toLowerCase())) {
      map.set(sellToken.address.toLowerCase(), 1);
    }
    if (buyToken && stables.has(buyToken.symbol) && !map.has(buyToken.address.toLowerCase())) {
      map.set(buyToken.address.toLowerCase(), 1);
    }
    const rate = activeSwap.quote?.rate;
    if (rate && rate > 0 && sellToken && buyToken) {
      const sellKey = sellToken.address === "native" ? "native" : sellToken.address.toLowerCase();
      const buyKey = buyToken.address === "native" ? "native" : buyToken.address.toLowerCase();
      if (stables.has(buyToken.symbol) && !map.has(sellKey)) {
        map.set(sellKey, rate);
      } else if (stables.has(sellToken.symbol) && !map.has(buyKey)) {
        map.set(buyKey, 1 / rate);
      }
    }
    return map;
  }, [fetchedUsdPrices, sellToken, buyToken, activeSwap.quote?.rate]);

  const handleImportCustomToken = useCallback(
    async (rawAddress: Address, side: "sell" | "buy"): Promise<Token | null> => {
      if (!publicClient || typeof publicClient.multicall !== "function") return null;
      const checksummed = getAddress(rawAddress);
      const [symRes, nameRes, decRes] = await publicClient.multicall({
        allowFailure: true,
        contracts: [
          { address: checksummed, abi: erc20Abi, functionName: "symbol" },
          { address: checksummed, abi: erc20Abi, functionName: "name" },
          { address: checksummed, abi: erc20Abi, functionName: "decimals" },
        ],
      });
      if (symRes.status !== "success" || decRes.status !== "success") return null;
      const symbol = String(symRes.result).trim().slice(0, 16);
      const decimals = Number(decRes.result);
      if (!symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
      const name =
        nameRes.status === "success" && String(nameRes.result).trim()
          ? `${String(nameRes.result).trim()} (Custom)`
          : `${symbol} (Custom)`;
      const token: Erc20Token = {
        kind: "erc20",
        address: checksummed,
        symbol,
        name,
        decimals,
        chainId: displayChainId,
      };
      setCustomTokens((prev) => {
        const filtered = prev.filter(
          (t) =>
            !(t.chainId === token.chainId && t.address.toLowerCase() === token.address.toLowerCase())
        );
        const next = [...filtered, token];
        try {
          window.sessionStorage.setItem(CUSTOM_TOKENS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota issues
        }
        return next;
      });
      if (side === "sell") activeSwap.actions?.setSellToken(token);
      else activeSwap.actions?.setBuyToken(token);
      return token;
    },
    [publicClient, displayChainId, activeSwap.actions]
  );

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

  const handleQuickPairSelect = useCallback(
    (sellSym: string, buySym: string) => {
      const nextSell = chainTokens.find((t) => t.symbol.toUpperCase() === sellSym.toUpperCase());
      const nextBuy = chainTokens.find((t) => t.symbol.toUpperCase() === buySym.toUpperCase());
      if (nextSell && nextSell.symbol !== sellToken.symbol) {
        activeSwap.actions?.setSellToken(nextSell);
      }
      if (nextBuy) {
        activeSwap.actions?.setBuyToken(nextBuy);
      }
    },
    [activeSwap.actions, chainTokens, sellToken.symbol]
  );

  const handleScannerSelectToken = useCallback(
    (token: Token) => {
      if (token.address.toLowerCase() === sellToken.address.toLowerCase()) {
        const usdc = chainTokens.find((t) => t.symbol === "USDC");
        if (usdc && usdc.address.toLowerCase() !== token.address.toLowerCase()) {
          activeSwap.actions?.setBuyToken(usdc);
        }
        return;
      }
      activeSwap.actions?.setBuyToken(token);
    },
    [activeSwap.actions, chainTokens, sellToken.address]
  );

  const openWalletConnect = useCallback((view: "qr" | "list" = "list") => {
    window.dispatchEvent(new CustomEvent("shaggy:open-wallet-connect", { detail: { view } }));
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // URL Synchronization (Non-Destructive: Preserves ETH buyToken & sellAmount)
  // ────────────────────────────────────────────────────────────────────────────

  const updateURL = useCallback(() => {
    const params = new URLSearchParams();
    const isDefaultPair =
      sellToken.address === "native" && buyToken.symbol.toUpperCase() === DEFAULT_BUY_SYMBOL;

    if (!isDefaultPair) {
      if (sellToken.address !== "native") {
        params.set("input", sellToken.address);
      }
      if (buyToken.address === "native") {
        params.set("output", "ETH");
      } else if (buyToken.symbol.toUpperCase() !== DEFAULT_BUY_SYMBOL) {
        params.set("output", buyToken.address);
      }
    }

    const newParams = params.toString();
    const currentParams = searchParams.toString();

    if (newParams !== currentParams) {
      lastSyncedSearchRef.current = newParams;
      setSearchParams(params, { replace: true });
    }
  }, [sellToken.address, buyToken.address, buyToken.symbol, searchParams, setSearchParams]);

  useEffect(() => {
    updateURL();
  }, [updateURL]);

  const explorerBaseUrl =
    displayChainId === 1 ? "https://etherscan.io" : "https://basescan.org";
  const activeRouterAddress =
    activeSwap.quote?.routerAddress ?? getUniswapV2Router(displayChainId);

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden px-3 py-3 duration-500 animate-in fade-in sm:px-4 sm:py-5 md:p-8">
      {/* Subtle 2026 Ambient Mesh & Grid Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-96 max-w-6xl rounded-full bg-gradient-to-tr from-purple-500/15 via-fuchsia-400/10 to-pink-500/15 blur-3xl"
      />

      <div className="mx-auto max-w-7xl space-y-3 sm:space-y-5">
        {/* Compact Top Bar: Brand Identity, Promo & Live Telemetry */}
        <header className="flex flex-col justify-between gap-2.5 rounded-2xl border border-purple-200/70 bg-white/85 px-3.5 py-2.5 shadow-sm ring-1 ring-purple-500/5 backdrop-blur-xl xl:flex-row xl:items-center xl:px-5 xl:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h1 className="whitespace-nowrap bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 bg-clip-text text-xl font-bold tracking-tight text-transparent md:text-2xl">
                Shaggy DEX
              </h1>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-purple-200/80 bg-purple-50/90 px-2 py-0.5 font-mono text-[11px] font-semibold text-purple-800">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span>{displayChainId === 1 ? "Ethereum L1" : "Base L2"}</span>
                <span className="hidden sm:inline">· Smart Router v2.7</span>
              </span>
            </div>

            {/* Compact mobile/tablet telemetry badges */}
            <div className="flex items-center gap-1.5 font-mono text-[11px] xl:hidden">
              {gasPrice && (
                <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200/80 bg-amber-50/90 px-2 py-0.5 font-medium tabular-nums text-amber-800">
                  <Fuel className="size-3 shrink-0 text-amber-600" />
                  <span>{formatCompactGwei(gasPrice)} Gwei</span>
                </div>
              )}
              {blockNumber && (
                <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-200/80 bg-slate-100/90 px-2 py-0.5 font-medium tabular-nums text-slate-700">
                  <Activity className="size-3 shrink-0 text-emerald-600" />
                  <span>#{blockNumber.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs xl:justify-end">
            {mrwdToken && (
              <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/95 via-teal-50/90 to-emerald-50/95 px-2.5 py-1.5 font-sans text-xs font-semibold text-emerald-950 shadow-sm sm:w-auto sm:justify-start md:rounded-full md:px-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 shrink-0 text-emerald-600" />
                  <span className="text-[11px] leading-tight sm:text-xs">
                    <span className="hidden 2xl:inline">Mutt Rewards (</span>$MRWD
                    <span className="hidden 2xl:inline">)</span>: 1B unlocks Equilnyxs Pro · Q1 LP
                    rewards live
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isBuyingMrwd ? (
                    <button
                      type="button"
                      onClick={handleSelectBuyMrwd}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      Buy $MRWD <ArrowRight className="size-3" />
                    </button>
                  ) : (
                    <span className="whitespace-nowrap rounded-full bg-emerald-200/80 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                      {sellToken.symbol} → MRWD active
                    </span>
                  )}
                  <Link
                    to="/stake"
                    className="text-[11px] text-emerald-700 underline underline-offset-2 hover:text-emerald-900 sm:text-xs"
                  >
                    Stake
                  </Link>
                </div>
              </div>
            )}

            {gasPrice && (
              <div className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 font-mono text-xs font-medium tabular-nums text-amber-800 shadow-sm xl:flex">
                <Fuel className="size-3.5 shrink-0 text-amber-600" />
                <span>{formatCompactGwei(gasPrice)} Gwei</span>
              </div>
            )}

            {blockNumber && (
              <div className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200/80 bg-slate-100/90 px-3 py-1 font-mono text-xs font-medium tabular-nums text-slate-700 shadow-sm xl:flex">
                <Activity className="size-3.5 shrink-0 text-emerald-600" />
                <span>#{blockNumber.toLocaleString()}</span>
              </div>
            )}
          </div>
        </header>

        {/* Quick Pair Switcher Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/70 bg-white/75 px-3 py-2 text-xs shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 inline-flex shrink-0 items-center gap-1 font-semibold uppercase tracking-wider text-slate-400">
              <Zap className="size-3 text-purple-600" />
              <span className="hidden sm:inline">Quick</span> Pairs
            </span>
            {QUICK_PAIRS.map((pair) => {
              const hasBoth =
                chainTokens.some(
                  (t) => t.symbol.toUpperCase() === pair.sellSymbol.toUpperCase()
                ) &&
                chainTokens.some((t) => t.symbol.toUpperCase() === pair.buySymbol.toUpperCase());
              if (!hasBoth) return null;
              const isActive =
                sellToken.symbol.toUpperCase() === pair.sellSymbol.toUpperCase() &&
                buyToken.symbol.toUpperCase() === pair.buySymbol.toUpperCase();
              return (
                <button
                  key={pair.label}
                  type="button"
                  onClick={() => handleQuickPairSelect(pair.sellSymbol, pair.buySymbol)}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 font-mono text-xs font-medium transition-all ${
                    isActive
                      ? "border-purple-600 bg-purple-600 text-white shadow-sm"
                      : "border-slate-200/80 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50/60"
                  }`}
                >
                  <span>{pair.label}</span>
                  {pair.badge && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-purple-100/80 text-purple-700"
                      }`}
                    >
                      {pair.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden shrink-0 items-center gap-3 font-mono text-[11px] text-slate-500 md:flex">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5 text-purple-600" /> {venueCount} Liquidity Venues
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1">
              <Cpu className="size-3.5 text-emerald-600" /> On-chain QuoterV2 · 35% Outlier Guard
            </span>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Swap Terminal comes first in both reading order and mobile layout */}
          <div className="order-1 min-w-0 lg:col-span-5">
            <div className="relative space-y-3">
              {/* Soft glow halo behind primary swap terminal */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 -z-10 rounded-3xl bg-gradient-to-b from-purple-500/15 via-fuchsia-500/10 to-pink-500/10 blur-xl"
              />

              <Tabs value="swap">
                <TabsList className="mb-2.5 grid h-10 w-full grid-cols-2 rounded-xl border border-purple-200/70 bg-white/90 p-1 shadow-sm backdrop-blur-md">
                  <TabsTrigger
                    value="swap"
                    className="rounded-lg text-xs font-bold tracking-wide data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                  >
                    Swap
                  </TabsTrigger>
                  <TabsTrigger
                    value="limit"
                    disabled
                    aria-label="Limit orders coming soon"
                    className="rounded-lg text-xs font-semibold text-slate-400"
                  >
                    Limit · Soon
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="swap" className="mt-0">
                  <SwapCard
                    swap={activeSwap}
                    tokens={chainTokens}
                    approveHash={activeSwap.hashes?.approve}
                    swapHash={activeSwap.hashes?.swap}
                    isConnected={isConnected}
                    onConnectWallet={() => openWalletConnect("list")}
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
                    usdPrices={usdPrices}
                    onImportCustomToken={handleImportCustomToken}
                  />
                </TabsContent>
              </Tabs>

              {!isConnected && (
                <div className="space-y-2 rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/80 via-white to-pink-50/70 p-3.5 text-center text-sm text-slate-800 shadow-sm">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-700">
                    <Wallet className="size-3.5" /> Live Quote &amp; Route Preview Active
                  </div>
                  <p className="text-xs text-slate-600">
                    Compare live on-chain quotes across {venueCount} DEX venues now, or connect your
                    wallet to execute.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => openWalletConnect("qr")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-purple-700 hover:to-pink-700"
                    >
                      <QrCode className="size-3.5" />
                      <span>MetaMask Mobile QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openWalletConnect("list")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-purple-300 bg-white px-3.5 py-2 text-xs font-semibold text-purple-800 shadow-sm transition hover:bg-purple-50"
                    >
                      <Wallet className="size-3.5" />
                      <span>All Wallets</span>
                    </button>
                  </div>
                </div>
              )}

              <aside
                aria-label="Trade safety and contract information"
                className="rounded-2xl border border-emerald-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <ShieldCheck className="size-4 text-emerald-600" />{" "}
                    {displayChainId === 1 ? "Ethereum" : "Base"} · Non-custodial
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                    <Lock className="size-2.5" /> Direct Settlement
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Trades and approvals are signed in your wallet and settle atomically against the
                  selected DEX router. Contracts have not received an independent third-party audit.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs font-medium">
                  <a
                    className="inline-flex items-center gap-1 text-purple-700 underline-offset-2 hover:underline"
                    href={`${explorerBaseUrl}/address/${activeRouterAddress}#code`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {activeSwap.quote?.bestVenue ? "Active route router" : "Configured router"}{" "}
                    <ExternalLink className="size-3" />
                  </a>
                  <Link
                    to="/stake/paymaster"
                    className="inline-flex items-center gap-1 text-purple-700 underline-offset-2 hover:underline"
                  >
                    Gasless Paymaster
                  </Link>
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
            </div>
          </div>

          {/* Right Column: Multi-Venue Liquidity Matrix & Live Market Scanner */}
          <div className="order-2 min-w-0 space-y-5 lg:col-span-7">
            <PriceChart swap={activeSwap} />

            <MarketScanner defaultEnabled onSelectToken={handleScannerSelectToken} />
          </div>
        </div>
      </div>
    </div>
  );
}
