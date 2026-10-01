// src/hooks/useSwap.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { type Address, formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { ERC20_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { DEFAULT_SLIPPAGE, SWAP_DEADLINE_BUFFER, getUniswapV2Router } from "@/config/contracts";
import { WRAPPED_NATIVE_ADDRESS, getWrappedNativeAddress } from "@/config/tokens";
import {
  trackProtectionAndGas,
  trackQuoteSourceSelection,
  trackRouteDecision,
  trackSwap,
} from "@/lib/analytics";

import type { NativeSentinel, Token } from "@/config/tokens";

// ---------- Helpers & narrow types ----------
type EvmAddress = Address;
type QuoteStatus = "IDLE" | "LOADING" | "SUCCESS" | "NO_ROUTE" | "ERROR";

const isNative = (addr: EvmAddress | NativeSentinel): addr is NativeSentinel => addr === "native";

const resolvePathAddress = (
  current: EvmAddress | NativeSentinel,
  wrappedFallback: EvmAddress = WRAPPED_NATIVE_ADDRESS
): EvmAddress => (isNative(current) ? wrappedFallback : current);

const buildRoutePath = (
  sell: Token,
  buy: Token,
  wrappedFallback: EvmAddress = WRAPPED_NATIVE_ADDRESS
): readonly Address[] => {
  const from = resolvePathAddress(sell.address, wrappedFallback);
  const to = resolvePathAddress(buy.address, wrappedFallback);

  if (from === to) return [from];

  const isFromWrapped = from === wrappedFallback;
  const isToWrapped = to === wrappedFallback;

  if (isFromWrapped || isToWrapped) {
    return [from, to] as const;
  }

  // Default bridge through wrapped native for liquidity depth (simple heuristic)
  return [from, wrappedFallback, to] as const;
};

const resolveEthValue = (token: Token, amountParsed: bigint): bigint | undefined =>
  isNative(token.address) ? amountParsed : undefined;

// ---------- Public, stable types (used by components) ----------
export interface BalanceData {
  value: bigint;
  decimals: number;
  symbol: string;
  formatted: string;
}

interface SwapState {
  sellAmount: string;
  buyAmount: string;
  sellToken: Token;
  buyToken: Token;
  slippage: number;
  isQuoteLoading: boolean;
}

interface SwapTelemetryContext {
  sellAmount: string;
  buyAmount: string;
  sellToken: Token;
  buyToken: Token;
  slippage: number;
  path: readonly Address[];
  quoteSource: string;
  priceImpactBps: number | null;
}

export interface UseSwapReturn {
  state: SwapState;
  balances: {
    sell: BalanceData | undefined;
    buy: BalanceData | undefined;
  };
  approval: {
    needed: boolean;
    isApproving: boolean;
    approve: () => Promise<void>;
  };
  swap: {
    canSwap: boolean;
    isSwapping: boolean;
    execute: () => Promise<void>;
  };
  actions: {
    setSellAmount: (amount: string) => void;
    setBuyAmount: (amount: string) => void;
    setSellToken: (token: Token) => void;
    setBuyToken: (token: Token) => void;
    setSlippage: (slippage: number) => void;
    reverseTokens: () => void;
    setMaxSellAmount: () => void;
  };
  quote: {
    rate: number | null;
    minimumReceived: number | null;
    priceImpact: number | null;
    status: QuoteStatus;
  };
}

export function useSwap(initialSellToken: Token, initialBuyToken: Token): UseSwapReturn {
  const { chain, address, isConnected } = useAccount();
  const currentChainId = chain?.id ?? 1;
  const currentRouter = getUniswapV2Router(currentChainId);
  const currentWrapped = getWrappedNativeAddress(currentChainId);

  const lastSwapContextRef = useRef<SwapTelemetryContext | null>(null);
  const lastRouteRef = useRef<{ path: readonly Address[]; source: string } | null>(null);
  const [activeRoutePath, setActiveRoutePath] = useState<readonly Address[] | null>(null);

  const [state, setState] = useState<SwapState>({
    sellAmount: "",
    buyAmount: "",
    sellToken: initialSellToken,
    buyToken: initialBuyToken,
    slippage: DEFAULT_SLIPPAGE,
    isQuoteLoading: false,
  });

  // Keep internal state aligned with upstream token changes (e.g. URL updates)
  useEffect(() => {
    setState((prev) => {
      const sellChanged = prev.sellToken.address !== initialSellToken.address;
      const buyChanged = prev.buyToken.address !== initialBuyToken.address;

      if (!sellChanged && !buyChanged) {
        return prev;
      }

      return {
        ...prev,
        sellToken: sellChanged ? initialSellToken : prev.sellToken,
        buyToken: buyChanged ? initialBuyToken : prev.buyToken,
        sellAmount: sellChanged ? "" : prev.sellAmount,
        buyAmount: buyChanged ? "" : prev.buyAmount,
      };
    });
  }, [initialSellToken, initialBuyToken]);

  // ---------- Balances ----------
  const { data: rawSellBal } = useBalance({
    address,
    token: isNative(state.sellToken.address) ? undefined : (state.sellToken.address as EvmAddress),
    query: { enabled: isConnected },
  });

  const { data: rawBuyBal } = useBalance({
    address,
    token: isNative(state.buyToken.address) ? undefined : (state.buyToken.address as EvmAddress),
    query: { enabled: isConnected },
  });

  // Normalize to BalanceData so UI never sees unknown/ReturnType<>
  const sellTokenBalance: BalanceData | undefined = rawSellBal
    ? {
        value: rawSellBal.value,
        decimals: rawSellBal.decimals,
        formatted: rawSellBal.formatted,
        symbol: rawSellBal.symbol ?? state.sellToken.symbol,
      }
    : undefined;

  const buyTokenBalance: BalanceData | undefined = rawBuyBal
    ? {
        value: rawBuyBal.value,
        decimals: rawBuyBal.decimals,
        formatted: rawBuyBal.formatted,
        symbol: rawBuyBal.symbol ?? state.buyToken.symbol,
      }
    : undefined;

  // ---------- Allowance (only for ERC-20 sells) ----------
  const { data: allowance } = useReadContract({
    address: isNative(state.sellToken.address)
      ? undefined
      : (state.sellToken.address as EvmAddress),
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      isConnected && !!address && !isNative(state.sellToken.address)
        ? [address, currentRouter]
        : undefined,
    query: {
      enabled: isConnected && !!address && !isNative(state.sellToken.address),
    },
  });

  // ---------- Quote (Uniswap V2 getAmountsOut) ----------
  const routePath: readonly Address[] | undefined = useMemo(() => {
    if (!state.sellAmount) return undefined;
    return buildRoutePath(state.sellToken, state.buyToken, currentWrapped);
  }, [state.sellAmount, state.sellToken, state.buyToken, currentWrapped]);

  const amountInForQuote =
    state.sellAmount && parseFloat(state.sellAmount) > 0
      ? parseUnits(state.sellAmount, state.sellToken.decimals)
      : undefined;

  const {
    data: quoteData,
    isError: isQuoteError,
    isLoading: isQuoteLoading,
  } = useReadContract({
    address: currentRouter,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args:
      amountInForQuote && routePath && routePath.length > 1
        ? [amountInForQuote, routePath]
        : undefined,
    query: {
      enabled:
        !!amountInForQuote &&
        !!routePath &&
        routePath.length > 1 &&
        routePath[0] !== routePath[routePath.length - 1], // avoid degenerate route
      refetchInterval: 10_000,
      staleTime: 5_000,
    },
  });

  // ---------- Writers ----------
  const {
    writeContractAsync: approveToken,
    isPending: isApprovePending,
    data: approveHash,
  } = useWriteContract();

  const {
    writeContractAsync: executeSwap,
    isPending: isSwapPending,
    data: swapHash,
  } = useWriteContract();

  // ---------- Receipts ----------
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: isSwapSuccess, isError: isSwapError } = useWaitForTransactionReceipt({
    hash: swapHash,
  });

  // ---------- Quote → UI buyAmount ----------
  useEffect(() => {
    if (quoteData && Array.isArray(quoteData) && quoteData.length > 1) {
      const outputAmount = formatUnits(
        quoteData[quoteData.length - 1] as bigint,
        state.buyToken.decimals
      );
      if (routePath) {
        setActiveRoutePath(routePath);
      }
      setState((prev) => ({ ...prev, buyAmount: outputAmount }));
    } else if (!state.sellAmount) {
      setActiveRoutePath(null);
      setState((prev) => ({ ...prev, buyAmount: "" }));
    }
  }, [quoteData, routePath, state.buyToken.decimals, state.sellAmount]);

  // ---------- Derived flags ----------
  const needsApproval = useMemo(() => {
    if (isNative(state.sellToken.address) || !state.sellAmount || !allowance) return false;
    const sellAmountBigInt = parseUnits(state.sellAmount, state.sellToken.decimals);
    return allowance < sellAmountBigInt;
  }, [allowance, state.sellAmount, state.sellToken.address, state.sellToken.decimals]);

  const canSwap = useMemo(() => {
    return !!(
      state.sellAmount &&
      state.buyAmount &&
      parseFloat(state.sellAmount) > 0 &&
      sellTokenBalance &&
      parseUnits(state.sellAmount, state.sellToken.decimals) <= sellTokenBalance.value &&
      activeRoutePath &&
      !needsApproval &&
      isConnected
    );
  }, [
    state.sellAmount,
    state.buyAmount,
    state.sellToken.decimals,
    sellTokenBalance,
    activeRoutePath,
    needsApproval,
    isConnected,
  ]);

  const quoteStatus: QuoteStatus = useMemo(() => {
    if (!state.sellAmount || parseFloat(state.sellAmount) <= 0) return "IDLE";
    if (isQuoteLoading) return "LOADING";
    if (isQuoteError) return "ERROR";
    if (!routePath || routePath.length < 2 || routePath[0] === routePath[routePath.length - 1]) {
      return "NO_ROUTE";
    }
    if (state.buyAmount && activeRoutePath) return "SUCCESS";
    return "NO_ROUTE";
  }, [activeRoutePath, isQuoteError, isQuoteLoading, routePath, state.buyAmount, state.sellAmount]);

  const quote = useMemo(() => {
    if (!state.sellAmount || !state.buyAmount || parseFloat(state.sellAmount) === 0) {
      return { rate: null, minimumReceived: null, priceImpact: null };
    }
    const rate = parseFloat(state.buyAmount) / parseFloat(state.sellAmount);
    const minimumReceived = parseFloat(state.buyAmount) * (1 - state.slippage / 100);
    // Price impact placeholder (requires pool reserves for accuracy)
    const priceImpact = 0;
    return { rate, minimumReceived, priceImpact };
  }, [state.sellAmount, state.buyAmount, state.slippage]);

  // Track route/quote computations
  useEffect(() => {
    if (!quoteData || !amountInForQuote || !routePath) return;

    const routeId = routePath.join("->");
    lastRouteRef.current = { path: routePath, source: "uniswap_v2" };

    trackRouteDecision({
      routeId,
      strategy: "best_price",
      protocols: ["uniswap_v2"],
      hops: routePath.length - 1,
      ...(state.buyAmount ? { estimatedOutput: state.buyAmount } : {}),
      status: "computed",
    });

    trackQuoteSourceSelection({
      primary: "uniswap_v2_router",
      ...(routePath.length > 2 ? { fallback: "weth_bridge" } : {}),
    });
  }, [amountInForQuote, routePath, quoteData, state.buyAmount]);

  // ---------- Actions ----------
  const handleApprove = useCallback(async () => {
    if (!state.sellAmount || isNative(state.sellToken.address)) return;

    try {
      const hash = await approveToken({
        address: state.sellToken.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [
          currentRouter,
          parseUnits(state.sellAmount, state.sellToken.decimals),
        ],
        chain: undefined,
        account: undefined,
      });

      if (hash) {
        toast.loading("Approval pending...", { id: "approve" });
      }
    } catch (error) {
      toast.error("Approval failed. Please try again.");
      console.error("Approve error:", error);
    }
  }, [state.sellAmount, state.sellToken.address, state.sellToken.decimals, approveToken, currentRouter]);

  const handleSwap = useCallback(async () => {
    if (!canSwap || !quoteData) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_BUFFER);
    const amountIn = parseUnits(state.sellAmount, state.sellToken.decimals);
    const quotedAmountOut = quoteData[quoteData.length - 1] as bigint;
    const slippageBps = BigInt(Math.round(state.slippage * 100));
    const amountOutMin = (quotedAmountOut * (10_000n - slippageBps)) / 10_000n;

    const uniswapPath = activeRoutePath;
    if (!uniswapPath || uniswapPath.length < 2) {
      toast.error("Route unavailable. Please try a different pair.");
      return;
    }

    const routeContext = lastRouteRef.current;
    const routingStrategy = routeContext ? "best_price" : undefined;
    const priceImpactBps = quote.priceImpact !== null ? Math.round(quote.priceImpact * 100) : null;

    lastSwapContextRef.current = {
      sellAmount: state.sellAmount,
      buyAmount: state.buyAmount,
      sellToken: state.sellToken,
      buyToken: state.buyToken,
      slippage: state.slippage,
      path: uniswapPath,
      quoteSource: routeContext?.source ?? "uniswap_v2",
      priceImpactBps,
    };

    trackProtectionAndGas({
      slippageBps: Math.round(state.slippage * 100),
    });

    trackSwap({
      fromToken: state.sellToken.symbol,
      toToken: state.buyToken.symbol,
      fromAmount: state.sellAmount,
      toAmount: state.buyAmount,
      chainId: state.sellToken.chainId ?? state.buyToken.chainId ?? 1,
      status: "initiated",
      routePath: [...uniswapPath],
      protocols: ["uniswap_v2"],
      slippageBps: Math.round(state.slippage * 100),
      mevPath: "public",
      quoteSource: routeContext?.source ?? "uniswap_v2",
      ...(routingStrategy ? { routingStrategy } : {}),
      ...(priceImpactBps !== null ? { priceImpactBps } : {}),
    });

    try {
      let hash: `0x${string}` | undefined;

      if (isNative(state.sellToken.address)) {
        // native -> token
        hash = await executeSwap({
          address: currentRouter,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [amountOutMin, uniswapPath, address as Address, deadline],
          value: resolveEthValue(state.sellToken, amountIn),
          chain: undefined,
          account: undefined,
        });
      } else if (isNative(state.buyToken.address)) {
        // token -> native; the V2 router unwraps WETH before sending ETH to the recipient.
        hash = await executeSwap({
          address: currentRouter,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [amountIn, amountOutMin, uniswapPath, address as Address, deadline],
          chain: undefined,
          account: undefined,
        });
      } else {
        // token -> token
        hash = await executeSwap({
          address: currentRouter,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [amountIn, amountOutMin, uniswapPath, address as Address, deadline],
          chain: undefined,
          account: undefined,
        });
      }

      if (hash) {
        toast.loading("Swap pending...", { id: "swap" });
      }
    } catch (error) {
      toast.error("Swap failed. Please try again.");
      console.error("Swap error:", error);
      trackSwap({
        fromToken: state.sellToken.symbol,
        toToken: state.buyToken.symbol,
        fromAmount: state.sellAmount,
        toAmount: state.buyAmount,
        chainId: state.sellToken.chainId ?? state.buyToken.chainId ?? 1,
        status: "failed",
        quoteSource: routeContext?.source ?? "uniswap_v2",
        error: error instanceof Error ? error.message : "Swap failed",
      });
    }
  }, [
    canSwap,
    quoteData,
    state.sellAmount,
    state.buyAmount,
    state.slippage,
    state.sellToken.address,
    state.sellToken.decimals,
    state.buyToken.address,
    state.buyToken.decimals,
    activeRoutePath,
    executeSwap,
    address,
    currentRouter,
  ]);

  const reverseTokens = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sellToken: prev.buyToken,
      buyToken: prev.sellToken,
      sellAmount: prev.buyAmount,
      buyAmount: prev.sellAmount,
    }));
  }, []);

  const setMaxSellAmount = useCallback(() => {
    if (sellTokenBalance) {
      setState((prev) => ({
        ...prev,
        sellAmount: formatUnits(sellTokenBalance.value, prev.sellToken.decimals),
      }));
    }
  }, [sellTokenBalance]);

  // ---------- Notifications ----------
  useEffect(() => {
    if (isApproveSuccess) {
      toast.success("Token approved!", { id: "approve" });
    }
  }, [isApproveSuccess]);

  useEffect(() => {
    if (isSwapSuccess) {
      toast.success("Swap completed!", { id: "swap" });
      const context = lastSwapContextRef.current;
      if (context) {
        trackSwap({
          fromToken: context.sellToken.symbol,
          toToken: context.buyToken.symbol,
          fromAmount: context.sellAmount,
          toAmount: context.buyAmount,
          chainId: context.sellToken.chainId ?? context.buyToken.chainId ?? 1,
          status: "completed",
          routingStrategy: "best_price",
          routePath: context.path as unknown as string[],
          protocols: ["uniswap_v2"],
          slippageBps: Math.round(context.slippage * 100),
          mevPath: "public",
          quoteSource: context.quoteSource,
          ...(context.priceImpactBps !== null && context.priceImpactBps !== undefined
            ? { priceImpactBps: context.priceImpactBps }
            : {}),
          ...(swapHash ? { txHash: swapHash } : {}),
        });
      }
      setState((prev) => ({ ...prev, sellAmount: "", buyAmount: "" }));
    }
    if (isSwapError) {
      toast.error("Swap failed", { id: "swap" });
      const context = lastSwapContextRef.current;
      if (context) {
        trackSwap({
          fromToken: context.sellToken.symbol,
          toToken: context.buyToken.symbol,
          fromAmount: context.sellAmount,
          toAmount: context.buyAmount,
          chainId: context.sellToken.chainId ?? context.buyToken.chainId ?? 1,
          status: "failed",
          routingStrategy: "best_price",
          routePath: context.path as unknown as string[],
          protocols: ["uniswap_v2"],
          slippageBps: Math.round(context.slippage * 100),
          mevPath: "public",
          quoteSource: context.quoteSource,
          ...(swapHash ? { txHash: swapHash } : {}),
          error: "swap_receipt_error",
        });
      }
    }
  }, [isSwapSuccess, isSwapError, swapHash]);

  return {
    state: { ...state, isQuoteLoading },
    balances: {
      sell: sellTokenBalance,
      buy: buyTokenBalance,
    },
    approval: {
      needed: needsApproval,
      isApproving: isApprovePending,
      approve: handleApprove,
    },
    swap: {
      canSwap,
      isSwapping: isSwapPending,
      execute: handleSwap,
    },
    actions: {
      setSellAmount: (amount: string) => setState((prev) => ({ ...prev, sellAmount: amount })),
      setBuyAmount: (amount: string) => setState((prev) => ({ ...prev, buyAmount: amount })),
      setSellToken: (token: Token) => setState((prev) => ({ ...prev, sellToken: token })),
      setBuyToken: (token: Token) => setState((prev) => ({ ...prev, buyToken: token })),
      setSlippage: (slippage: number) => {
        setState((prev) => ({ ...prev, slippage }));
        trackProtectionAndGas({
          slippageBps: Math.round(slippage * 100),
          autoSlippageReason: "user_adjusted",
        });
      },
      reverseTokens,
      setMaxSellAmount,
    },
    quote: {
      ...quote,
      status: quoteStatus,
    },
  };
}
