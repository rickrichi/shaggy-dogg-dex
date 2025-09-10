/* eslint-disable react-hooks/exhaustive-deps */
// src/hooks/useSwap.ts
import { useState, useCallback, useMemo, useEffect } from 'react';
import { parseUnits, formatUnits, type Address } from 'viem';
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { toast } from 'sonner';
import type { Token, NativeSentinel } from '@/config/tokens';
import { CONTRACTS, DEFAULT_SLIPPAGE, SWAP_DEADLINE_BUFFER } from '@/config/contracts';
import { ERC20_ABI, UNISWAP_V2_ROUTER_ABI } from '@/config/abis';

// ---------- Helpers & narrow types ----------
type EvmAddress = Address;

const isNative = (addr: EvmAddress | NativeSentinel): addr is NativeSentinel =>
  addr === 'native';

const resolvePathAddress = (
  current: EvmAddress | NativeSentinel,
  wrappedFallback: EvmAddress
): EvmAddress => (isNative(current) ? wrappedFallback : current);

const resolveEthValue = (token: Token, amountParsed: bigint): bigint | undefined =>
  isNative(token.address) ? amountParsed : undefined;

// ---------- Public, stable types (used by components) ----------
export type BalanceData = {
  value: bigint;
  decimals: number;
  symbol: string;
  formatted: string;
};

interface SwapState {
  sellAmount: string;
  buyAmount: string;
  sellToken: Token;
  buyToken: Token;
  slippage: number;
  isQuoteLoading: boolean;
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
  };
}

export function useSwap(initialSellToken: Token, initialBuyToken: Token): UseSwapReturn {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<SwapState>({
    sellAmount: '',
    buyAmount: '',
    sellToken: initialSellToken,
    buyToken: initialBuyToken,
    slippage: DEFAULT_SLIPPAGE,
    isQuoteLoading: false,
  });

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
    address: isNative(state.sellToken.address) ? undefined : (state.sellToken.address as EvmAddress),
    abi: ERC20_ABI,
    functionName: 'allowance',
    args:
      isConnected && !!address && !isNative(state.sellToken.address)
        ? [address, CONTRACTS.UNISWAP_V2_ROUTER as Address]
        : undefined,
    query: {
      enabled: isConnected && !!address && !isNative(state.sellToken.address),
    },
  });

  // ---------- Quote (Uniswap V2 getAmountsOut) ----------
  const amountInForQuote =
    state.sellAmount && parseFloat(state.sellAmount) > 0
      ? parseUnits(state.sellAmount, state.sellToken.decimals)
      : undefined;

  const path: readonly Address[] | undefined =
    amountInForQuote
      ? ([
          resolvePathAddress(state.sellToken.address, initialSellToken.address as Address),
          resolvePathAddress(state.buyToken.address, initialBuyToken.address as Address),
        ] as const)
      : undefined;

  const { data: quoteData, isLoading: isQuoteLoading } = useReadContract({
    address: CONTRACTS.UNISWAP_V2_ROUTER as Address,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: amountInForQuote && path ? [amountInForQuote, path] : undefined,
    query: {
      enabled:
        !!amountInForQuote &&
        !!path &&
        path[0] !== path[1], // avoid degenerate route
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
      const outputAmount = formatUnits(quoteData[1] as bigint, state.buyToken.decimals);
      setState((prev) => ({ ...prev, buyAmount: outputAmount }));
    } else if (!state.sellAmount) {
      setState((prev) => ({ ...prev, buyAmount: '' }));
    }
  }, [quoteData, state.buyToken.decimals, state.sellAmount]);

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
      !needsApproval &&
      isConnected
    );
  }, [
    state.sellAmount,
    state.buyAmount,
    state.sellToken.decimals,
    sellTokenBalance,
    needsApproval,
    isConnected,
  ]);

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

  // ---------- Actions ----------
  const handleApprove = useCallback(async () => {
    if (!state.sellAmount || isNative(state.sellToken.address)) return;

    try {
      const hash = await approveToken({
        address: state.sellToken.address as Address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [
          CONTRACTS.UNISWAP_V2_ROUTER as Address,
          parseUnits(state.sellAmount, state.sellToken.decimals),
        ],
        chain: undefined,
        account: undefined,
      });

      if (hash) {
        toast.loading('Approval pending...', { id: 'approve' });
      }
    } catch (error) {
      toast.error('Approval failed. Please try again.');
      console.error('Approve error:', error);
    }
  }, [state.sellAmount, state.sellToken.address, state.sellToken.decimals, approveToken]);

  const handleSwap = useCallback(async () => {
    if (!canSwap || !quoteData) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_BUFFER);
    const amountIn = parseUnits(state.sellAmount, state.sellToken.decimals);
    const amountOutMin = parseUnits(
      (parseFloat(state.buyAmount) * (1 - state.slippage / 100)).toString(),
      state.buyToken.decimals
    );

    const sellPath0 = resolvePathAddress(state.sellToken.address, initialSellToken.address as Address);
    const buyPath1 = resolvePathAddress(state.buyToken.address, initialBuyToken.address as Address);
    const uniswapPath = [sellPath0, buyPath1] as const;

    try {
      let hash: `0x${string}` | undefined;

      if (isNative(state.sellToken.address)) {
        // native -> token
        hash = await executeSwap({
          address: CONTRACTS.UNISWAP_V2_ROUTER as Address,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: 'swapExactETHForTokens',
          args: [amountOutMin, uniswapPath, (address as Address), deadline],
          value: resolveEthValue(state.sellToken, amountIn),
          chain: undefined,
          account: undefined,
        });
      } else {
        // token -> token
        hash = await executeSwap({
          address: CONTRACTS.UNISWAP_V2_ROUTER as Address,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [amountIn, amountOutMin, uniswapPath, (address as Address), deadline],
          chain: undefined,
          account: undefined,
        });
      }

      if (hash) {
        toast.loading('Swap pending...', { id: 'swap' });
      }
    } catch (error) {
      toast.error('Swap failed. Please try again.');
      console.error('Swap error:', error);
    }
  }, [
    canSwap,
    quoteData,
    state.sellAmount,
    state.buyAmount,
    state.slippage,
    state.sellToken.address,
    state.sellToken.decimals,
    state.buyToken.decimals,
    executeSwap,
    initialSellToken.address,
    initialBuyToken.address,
    address,
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
      toast.success('Token approved!', { id: 'approve' });
    }
  }, [isApproveSuccess]);

  useEffect(() => {
    if (isSwapSuccess) {
      toast.success('Swap completed!', { id: 'swap' });
      setState((prev) => ({ ...prev, sellAmount: '', buyAmount: '' }));
    }
    if (isSwapError) {
      toast.error('Swap failed', { id: 'swap' });
    }
  }, [isSwapSuccess, isSwapError]);

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
      setSlippage: (slippage: number) => setState((prev) => ({ ...prev, slippage })),
      reverseTokens,
      setMaxSellAmount,
    },
    quote,
  };
}
