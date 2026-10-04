import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import { type Token } from "@/config/tokens";
import { DEFAULT_SLIPPAGE, SWAP_DEADLINE_BUFFER } from "@/config/contracts";
import { positiveAmount } from "@/lib/amm/own-dex";
import { calculateMinimumAmountOut } from "@/lib/amm/swap-protection";
import { quoteSmartRoutes, routeQuoteCall, routeSwapCall } from "@/lib/amm/smart-routing";

type QuoteStatus = "IDLE" | "LOADING" | "SUCCESS" | "NO_ROUTE" | "ERROR";
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
    bestVenue?: "Uniswap V2" | "Aerodrome";
    spreadPercent?: number;
    comparisonText?: string;
    uniswapAmountOut?: string;
    aerodromeAmountOut?: string;
  };
}

export function useSwap(initialSellToken: Token, initialBuyToken: Token): UseSwapReturn {
  const { address, chainId, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();
  const [state, setState] = useState<SwapState>({
    sellAmount: "",
    buyAmount: "",
    sellToken: initialSellToken,
    buyToken: initialBuyToken,
    slippage: DEFAULT_SLIPPAGE,
    isQuoteLoading: false,
  });
  const client = usePublicClient({ chainId: state.sellToken.chainId });
  const [busy, setBusy] = useState<"approve" | "swap" | null>(null);
  const lock = useRef(false);
  const scope = useRef("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setState((s) => ({
      ...s,
      sellToken: initialSellToken,
      buyToken: initialBuyToken,
      sellAmount: "",
      buyAmount: "",
    }));
  }, [
    initialSellToken.address,
    initialSellToken.chainId,
    initialBuyToken.address,
    initialBuyToken.chainId,
  ]);
  const amount = positiveAmount(state.sellAmount, state.sellToken.decimals)
    ? parseUnits(state.sellAmount, state.sellToken.decimals)
    : 0n;
  const key = `${state.sellToken.chainId}:${state.sellToken.address}:${state.buyToken.address}:${amount}`;
  scope.current = `${address}:${chainId}:${key}`;
  const sellBalance = useBalance({
    address,
    chainId: state.sellToken.chainId,
    token: state.sellToken.address === "native" ? undefined : state.sellToken.address,
    query: { enabled: !!address },
  });
  const buyBalance = useBalance({
    address,
    chainId: state.buyToken.chainId,
    token: state.buyToken.address === "native" ? undefined : state.buyToken.address,
    query: { enabled: !!address },
  });
  const quotes = useQuery({
    queryKey: ["smart-routes", key],
    queryFn: () => quoteSmartRoutes(client!, state.sellToken, state.buyToken, amount),
    enabled: !!client && amount > 0n,
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 1,
  });
  const best = quotes.data?.best;
  const fresh = !!best && !quotes.isError && now - quotes.data!.observedAt < 30_000;
  const buyAmount = fresh ? formatUnits(best.output, state.buyToken.decimals) : "";
  const allowance = useQuery({
    queryKey: [
      "route-allowance",
      state.sellToken.chainId,
      address,
      state.sellToken.address,
      best?.route.router,
    ],
    queryFn: () =>
      client!.readContract({
        address: state.sellToken.address as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, best!.route.router],
      }),
    enabled: !!client && !!address && !!best && state.sellToken.address !== "native",
    refetchInterval: 10_000,
  });
  const needed =
    state.sellToken.address !== "native" &&
    amount > 0n &&
    (allowance.data === undefined || allowance.data < amount);
  const validChain = chainId === state.sellToken.chainId && chainId === state.buyToken.chainId;
  const canSwap = !!(
    isConnected &&
    validChain &&
    fresh &&
    !needed &&
    amount > 0n &&
    sellBalance.data &&
    amount <= sellBalance.data.value &&
    !busy
  );
  const execute = async (operation: "approve" | "swap") => {
    if (lock.current || !client || !wallet || !address || !best || !fresh || !validChain) return;
    const captured = scope.current;
    const assertWallet = async () => {
      if (
        scope.current !== captured ||
        (await wallet.getChainId()) !== state.sellToken.chainId ||
        (await wallet.getAddresses())[0]?.toLowerCase() !== address.toLowerCase()
      )
        throw new Error("Wallet, network, or trade changed. Review the quote again.");
    };
    lock.current = true;
    setBusy(operation);
    try {
      await assertWallet();
      if (operation === "approve") {
        if (state.sellToken.address === "native") return;
        const { request } = await client.simulateContract({
          address: state.sellToken.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [best.route.router, amount],
          account: address,
        });
        await assertWallet();
        const hash = await wallet.writeContract({ ...request, chain: client.chain });
        toast.loading(`Approval submitted: ${hash}`, { id: "smart-swap" });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Approval reverted.");
        await allowance.refetch();
      } else {
        if (!canSwap) throw new Error("Review your allowance, balance, and quote first.");
        const minimum = calculateMinimumAmountOut(
          best.output,
          BigInt(Math.round(state.slippage * 100))
        );
        const current = (await client.readContract(
          routeQuoteCall(best.route, amount)
        )) as readonly bigint[];
        if ((current.at(-1) ?? 0n) < minimum)
          throw new Error("Price moved beyond your minimum. Review a new quote.");
        const call = routeSwapCall(
          best.route,
          state.sellToken,
          state.buyToken,
          amount,
          minimum,
          address,
          BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_BUFFER)
        );
        const { request } = await client.simulateContract({ ...call, account: address });
        await assertWallet();
        const hash = await wallet.writeContract({ ...request, chain: client.chain });
        toast.loading(`Swap submitted: ${hash}`, { id: "smart-swap" });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Swap reverted.");
        if (scope.current === captured) setState((s) => ({ ...s, sellAmount: "", buyAmount: "" }));
        await Promise.all([sellBalance.refetch(), buyBalance.refetch(), allowance.refetch()]);
      }
      toast.success(operation === "approve" ? "Approval confirmed." : "Swap confirmed.", {
        id: "smart-swap",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transaction failed", {
        id: "smart-swap",
      });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  const normalize = (data: typeof sellBalance.data): BalanceData | undefined =>
    data ? { ...data, formatted: formatUnits(data.value, data.decimals) } : undefined;
  const uni = quotes.data?.quotes.find((q) => q.route.venue === "Uniswap V2");
  const aero = quotes.data?.quotes.find((q) => q.route.venue === "Aerodrome");
  const improvement =
    best && uni ? Number(((best.output - uni.output) * 1_000_000n) / uni.output) / 10_000 : 0;
  return {
    state: { ...state, buyAmount, isQuoteLoading: quotes.isFetching },
    balances: { sell: normalize(sellBalance.data), buy: normalize(buyBalance.data) },
    approval: { needed, isApproving: busy === "approve", approve: () => execute("approve") },
    swap: { canSwap, isSwapping: busy === "swap", execute: () => execute("swap") },
    actions: {
      setSellAmount: (sellAmount) => setState((s) => ({ ...s, sellAmount })),
      setBuyAmount: () => {},
      setSellToken: (sellToken) => setState((s) => ({ ...s, sellToken, sellAmount: "" })),
      setBuyToken: (buyToken) => setState((s) => ({ ...s, buyToken })),
      setSlippage: (slippage) => {
        if (Number.isFinite(slippage) && slippage >= 0 && slippage <= 10)
          setState((s) => ({ ...s, slippage }));
      },
      reverseTokens: () =>
        setState((s) => ({ ...s, sellToken: s.buyToken, buyToken: s.sellToken, sellAmount: "" })),
      setMaxSellAmount: () => {
        if (sellBalance.data)
          setState((s) => ({
            ...s,
            sellAmount: formatUnits(sellBalance.data!.value, s.sellToken.decimals),
          }));
      },
    },
    quote: {
      status:
        amount === 0n
          ? "IDLE"
          : quotes.isPending
            ? "LOADING"
            : quotes.isError
              ? "ERROR"
              : fresh
                ? "SUCCESS"
                : "NO_ROUTE",
      rate: buyAmount ? Number(buyAmount) / Number(state.sellAmount) : null,
      minimumReceived: buyAmount ? Number(buyAmount) * (1 - state.slippage / 100) : null,
      priceImpact: null,
      ...(fresh
        ? {
            bestVenue: best.route.venue,
            spreadPercent: improvement,
            comparisonText:
              uni && best.route.venue === "Aerodrome"
                ? `Routed via Aerodrome for +${improvement.toFixed(2)}% more tokens than Uniswap V2 (before gas).`
                : `Best quoted output via ${best.route.venue} (before gas).`,
            ...(uni ? { uniswapAmountOut: formatUnits(uni.output, state.buyToken.decimals) } : {}),
            ...(aero
              ? { aerodromeAmountOut: formatUnits(aero.output, state.buyToken.decimals) }
              : {}),
          }
        : {}),
    },
  };
}
