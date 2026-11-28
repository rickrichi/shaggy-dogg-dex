import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Address, erc20Abi, formatEther, formatUnits, parseAbi, parseEther, parseUnits } from "viem";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";

import {
  DEFAULT_SLIPPAGE,
  getChainUsdcAddress,
  getUniswapV3Deployment,
  SWAP_DEADLINE_BUFFER,
} from "@/config/contracts";
import { getWrappedNativeAddress, matchTokenOnChain, type Token } from "@/config/tokens";
import { liveEthUsd } from "@/lib/amm/gas-cost";
import { positiveAmount } from "@/lib/amm/own-dex";
import { getRoutePriceImpact, HIGH_PRICE_IMPACT } from "@/lib/amm/price-impact";
import {
  BASE_EXTRA_VENUES,
  isV3Route,
  quoteSmartRoutes,
  routeQuoteCall,
  routeSwapCall,
  type SmartRoute,
  type SmartRouteVenue,
  v3RouteFees,
} from "@/lib/amm/smart-routing";
import { calculateMinimumAmountOut } from "@/lib/amm/swap-protection";
import { approvalSequence } from "@/lib/approvals";

const OP_GAS_ORACLE: Address = "0x420000000000000000000000000000000000000F";
const OP_GAS_ORACLE_ABI = parseAbi([
  "function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)",
]);

function describeVenueRoute(route: SmartRoute): string {
  const hops = route.path.length - 1;
  const hopLabel = hops === 1 ? "1 pool" : `${hops} hops`;
  if (isV3Route(route)) {
    const fees = v3RouteFees(route)
      .map((fee) => `${fee / 10_000}%`)
      .join(" → ");
    return `${fees} · ${hopLabel}`;
  }
  if (route.venue === "Aerodrome") {
    const poolTypes = route.stable.map((s) => (s ? "Stable" : "Volatile")).join(" → ");
    return `${poolTypes || "Volatile"} · ${hopLabel}`;
  }
  return `0.3% · ${hopLabel}`;
}

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
    execute: (confirmedQuoteId?: string) => Promise<void>;
  };
  actions: {
    setSellAmount: (amount: string) => void;
    setBuyAmount: (amount: string) => void;
    setSellToken: (token: Token) => void;
    setBuyToken: (token: Token) => void;
    setSlippage: (slippage: number) => void;
    reverseTokens: () => void;
    setPreferredVenue: (venue: SmartRouteVenue | null) => void;
    setMaxSellAmount: () => void;
  };
  quote: {
    rate: number | null;
    minimumReceived: number | null;
    priceImpact: number | null;
    id?: string;
    refresh: () => void;
    isRefreshing: boolean;
    status: QuoteStatus;
    bestVenue?: SmartRouteVenue;
    spreadPercent?: number;
    comparisonText?: string;
    uniswapV3AmountOut?: string;
    uniswapAmountOut?: string;
    aerodromeAmountOut?: string;
    /** Best output per Base venue beyond Uniswap and Aerodrome; venues with no route are absent. */
    extraVenueQuotes?: Array<{ name: SmartRouteVenue; amount: string }>;
    /** The venue the user picked; null means the best quote is used automatically. */
    preferredVenue?: SmartRouteVenue | null;
    /** Venues with a live quote for this trade; absent until quotes arrive. */
    routedVenues?: SmartRouteVenue[];
    /** How far the picked venue's output is below the best quote, in percent. */
    venueShortfallPercent?: number;
    observedAt?: number;
    blockNumber?: bigint;
    routeDescription?: string;
    excludedVenues?: SmartRouteVenue[];
    estimatedNetworkFee?: string;
    estimatedNetworkFeeUsd?: number;
    routerAddress?: Address;
    venueRouteLabels?: Partial<Record<SmartRouteVenue, string>>;
    savingsAmount?: string;
    savingsComparedTo?: SmartRouteVenue;
  };
  hashes?: {
    approve?: `0x${string}`;
    swap?: `0x${string}`;
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
  const [preferredVenue, setPreferredVenue] = useState<SmartRouteVenue | null>(null);
  const [lastHashes, setLastHashes] = useState<{
    approve?: `0x${string}`;
    swap?: `0x${string}`;
  }>({});
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
  // Venues differ per chain, so a pick never carries over to another network.
  useEffect(() => setPreferredVenue(null), [state.sellToken.chainId]);
  const amount = positiveAmount(state.sellAmount, state.sellToken.decimals)
    ? parseUnits(state.sellAmount, state.sellToken.decimals)
    : 0n;
  const key = `${state.sellToken.chainId}:${state.sellToken.address}:${state.buyToken.address}:${amount}`;
  scope.current = `${address}:${chainId}:${key}:${state.slippage}`;
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
    queryKey: ["smart-routes", key, preferredVenue],
    queryFn: async () => {
      const result = await quoteSmartRoutes(client!, state.sellToken, state.buyToken, amount);
      const selected = preferredVenue
        ? (result.quotes.find((q) => q.route.venue === preferredVenue) ?? null)
        : result.best;
      const priceImpact = selected
        ? await getRoutePriceImpact(
            client!,
            state.sellToken.chainId,
            selected.route,
            amount,
            selected.output,
            result.blockNumber
          )
        : null;
      return { ...result, selected, priceImpact };
    },
    enabled: !!client && amount > 0n,
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 1,
  });
  // `best` is the route this swap uses: the top quote, or the venue the user picked.
  const best = quotes.data?.selected;
  const topQuote = quotes.data?.best;
  const compared = !!topQuote && !quotes.isError && now - quotes.data!.observedAt < 30_000;
  const fresh = compared && !!best;
  const buyAmount = fresh ? formatUnits(best.output, state.buyToken.decimals) : "";
  const priceImpact = fresh ? (quotes.data?.priceImpact ?? null) : null;
  // Confirmation survives identical refreshes, but never a changed trade, wallet,
  // route, output, impact or slippage setting. Expired quotes have no review ID.
  const quoteId = fresh
    ? `${scope.current}:${JSON.stringify(best.route)}:${best.output}:${priceImpact}`
    : undefined;
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
    priceImpact !== null &&
    !needed &&
    amount > 0n &&
    sellBalance.data &&
    amount <= sellBalance.data.value &&
    !busy
  );
  const execute = async (operation: "approve" | "swap", confirmedQuoteId?: string) => {
    if (lock.current || !client || !wallet || !address || !best || !fresh || !validChain) return;
    const captured = scope.current;
    const assertWallet = async () => {
      if (
        scope.current !== captured ||
        Date.now() - quotes.data!.observedAt >= 30_000 ||
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
        // A leftover allowance is reset to 0 first only for tokens (e.g. USDT) that require it.
        const approvals = await approvalSequence(client, {
          token: state.sellToken.address,
          owner: address,
          spender: best.route.router,
          amount,
        });
        for (const value of approvals) {
          const { request } = await client.simulateContract({
            address: state.sellToken.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [best.route.router, value],
            account: address,
          });
          await assertWallet();
            const hash = await wallet.writeContract({ ...request, chain: client.chain });
            setLastHashes((prev) => ({ ...prev, approve: hash }));
            toast.loading(
              value === 0n
                ? `This token requires clearing the old allowance first: ${hash}`
                : `Approval submitted: ${hash}`,
              { id: "smart-swap" }
            );
            const receipt = await client.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Approval reverted.");
          }
          await allowance.refetch();
        } else {
          if (!canSwap) throw new Error("Review your allowance, balance, and quote first.");
          if (priceImpact === null)
            throw new Error("Price impact is unavailable. Refresh the quote.");
          if (priceImpact >= HIGH_PRICE_IMPACT && confirmedQuoteId !== quoteId)
            throw new Error("Review and confirm this high-impact swap first.");
          const minimum = calculateMinimumAmountOut(
            best.output,
            BigInt(Math.round(state.slippage * 100))
          );
          const blockNumber = await client.getBlockNumber();
          const current = await client.readContract({
            ...routeQuoteCall(best.route, amount),
            blockNumber,
          });
          const currentOut = isV3Route(best.route)
            ? Array.isArray(current)
              ? (current[0] as bigint)
              : 0n
            : ((current as readonly bigint[]).at(-1) ?? 0n);
          if (currentOut < minimum)
            throw new Error("Price moved beyond your minimum. Review a new quote.");
          const currentImpact = await getRoutePriceImpact(
            client,
            state.sellToken.chainId,
            best.route,
            amount,
            currentOut,
            blockNumber
          );
          if (currentImpact === null)
            throw new Error("Price impact could not be verified. Refresh the quote.");
          if (
            currentImpact >= HIGH_PRICE_IMPACT &&
            (confirmedQuoteId !== quoteId || currentImpact > priceImpact + 0.01)
          ) {
            void quotes.refetch();
            throw new Error("Price impact increased. Review and confirm the updated quote.");
          }
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
          setLastHashes((prev) => ({ ...prev, swap: hash }));
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
    const networkFee = useQuery({
      queryKey: [
        "swap-network-fee",
        state.sellToken.chainId,
        best?.route.venue,
        best?.route.path.length,
      ],
      enabled:
        !!client &&
        typeof (client as { getGasPrice?: unknown }).getGasPrice === "function" &&
        amount > 0n &&
        !!best,
      staleTime: 15_000,
      refetchInterval: 15_000,
      retry: 0,
      queryFn: async () => {
        const gasPrice = await client!.getGasPrice();
        const gasUnits = isV3Route(best!.route)
          ? best!.route.path.length > 2
            ? 230_000n
            : 155_000n
          : best!.route.path.length > 2
            ? 195_000n
            : 140_000n;
        let l1FeeWei = 0n;
        if (
          state.sellToken.chainId === 8453 &&
          typeof (client as { readContract?: unknown }).readContract === "function"
        ) {
          try {
            const rawL1 = await client!.readContract({
              address: OP_GAS_ORACLE,
              abi: OP_GAS_ORACLE_ABI,
              functionName: "getL1FeeUpperBound",
              args: [360n],
            });
            if (typeof rawL1 === "bigint") l1FeeWei = rawL1;
          } catch {
            // Fall back to L2 execution gas if oracle read fails
          }
        }
        const totalWei = gasUnits * gasPrice + l1FeeWei;
        const ethFee = Number(formatEther(totalWei));
        let ethUsd: number | null = null;
        const v3 = getUniswapV3Deployment(state.sellToken.chainId);
        const usdc = getChainUsdcAddress(state.sellToken.chainId);
        if (
          v3 &&
          usdc &&
          typeof (client as { multicall?: unknown }).multicall === "function"
        ) {
          try {
            ethUsd = await liveEthUsd(
              client!,
              v3.quoter,
              getWrappedNativeAddress(state.sellToken.chainId),
              usdc
            );
          } catch {
            ethUsd = null;
          }
        }
        const usdFee = ethUsd && ethUsd > 0 ? ethFee * ethUsd : undefined;
        const label =
          usdFee !== undefined
            ? usdFee < 0.01
              ? `<$0.01 (${ethFee.toFixed(6)} ETH)`
              : `~$${usdFee.toFixed(2)} (${ethFee.toFixed(5)} ETH)`
            : `~${ethFee.toFixed(6)} ETH`;
        return { label, usdFee };
      },
    });
    const normalize = (data: typeof sellBalance.data): BalanceData | undefined =>
      data ? { ...data, formatted: formatUnits(data.value, data.decimals) } : undefined;
    const uniV3 = quotes.data?.quotes.find((q) => q.route.venue === "Uniswap V3");
    const uni = quotes.data?.quotes.find((q) => q.route.venue === "Uniswap V2");
    const aero = quotes.data?.quotes.find((q) => q.route.venue === "Aerodrome");
    const extraVenueQuotes = BASE_EXTRA_VENUES.flatMap((name) => {
      const found = quotes.data?.quotes.find((q) => q.route.venue === name);
      return found ? [{ name, amount: formatUnits(found.output, state.buyToken.decimals) }] : [];
    });
    const venueRouteLabels: Partial<Record<SmartRouteVenue, string>> = {};
    for (const q of quotes.data?.quotes ?? []) {
      if (!venueRouteLabels[q.route.venue]) {
        venueRouteLabels[q.route.venue] = describeVenueRoute(q.route);
      }
    }
    const runnerUp =
      topQuote &&
      (quotes.data?.quotes ?? []).find(
        (q) => q.route.venue !== topQuote.route.venue && q.output < topQuote.output
      );
    const benchmarkQuote =
      uni && topQuote && topQuote.route.venue !== "Uniswap V2" && topQuote.output > uni.output
        ? uni
        : runnerUp;
    const savingsAmount =
      topQuote && benchmarkQuote && topQuote.output > benchmarkQuote.output
        ? formatUnits(topQuote.output - benchmarkQuote.output, state.buyToken.decimals)
        : undefined;
    const savingsComparedTo = benchmarkQuote?.route.venue;
    const improvement =
      best && uni ? Number(((best.output - uni.output) * 1_000_000n) / uni.output) / 10_000 : 0;
    const venueShortfallPercent =
      preferredVenue && best && topQuote
        ? Number(((topQuote.output - best.output) * 1_000_000n) / topQuote.output) / 10_000
        : 0;
    return {
      state: { ...state, buyAmount, isQuoteLoading: quotes.isFetching },
      balances: { sell: normalize(sellBalance.data), buy: normalize(buyBalance.data) },
      approval: { needed, isApproving: busy === "approve", approve: () => execute("approve") },
      swap: {
        canSwap,
        isSwapping: busy === "swap",
        execute: (confirmedQuoteId) => execute("swap", confirmedQuoteId),
      },
      hashes: lastHashes,
      actions: {
        setSellAmount: (sellAmount) => setState((s) => ({ ...s, sellAmount })),
        setBuyAmount: () => {},
        setSellToken: (sellToken) => {
          setLastHashes({});
          setState((s) => ({
            ...s,
            sellToken,
            buyToken:
              s.buyToken.chainId === sellToken.chainId && s.buyToken.symbol !== sellToken.symbol
                ? s.buyToken
                : matchTokenOnChain(s.buyToken, sellToken),
            sellAmount: "",
            buyAmount: "",
          }));
        },
        setBuyToken: (buyToken) => {
          setLastHashes({});
          setState((s) => ({
            ...s,
            sellToken:
              s.sellToken.chainId === buyToken.chainId && s.sellToken.symbol !== buyToken.symbol
                ? s.sellToken
                : matchTokenOnChain(s.sellToken, buyToken),
            buyToken,
          }));
        },
        setSlippage: (slippage) => {
          if (Number.isFinite(slippage) && slippage >= 0 && slippage <= 50)
            setState((s) => ({ ...s, slippage }));
        },
        reverseTokens: () => {
          setLastHashes({});
          setState((s) => ({
            ...s,
            sellToken: s.buyToken,
            buyToken: s.sellToken,
            sellAmount: buyAmount || "",
            buyAmount: "",
          }));
        },
        setPreferredVenue,
        setMaxSellAmount: () => {
          if (!sellBalance.data) return;
          setState((s) => {
            const raw = sellBalance.data!.value;
            if (s.sellToken.address === "native") {
              const gasReserve =
                s.sellToken.chainId === 8453 ? parseEther("0.00015") : parseEther("0.003");
              const usable = raw > gasReserve ? raw - gasReserve : 0n;
              return { ...s, sellAmount: usable > 0n ? formatUnits(usable, s.sellToken.decimals) : "0" };
            }
            return { ...s, sellAmount: formatUnits(raw, s.sellToken.decimals) };
          });
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
        priceImpact,
        ...(quoteId ? { id: quoteId } : {}),
        refresh: () => {
          void quotes.refetch();
        },
        isRefreshing: quotes.isFetching,
        ...(quotes.data?.observedAt !== undefined ? { observedAt: quotes.data.observedAt } : {}),
        ...(quotes.data?.blockNumber !== undefined ? { blockNumber: quotes.data.blockNumber } : {}),
        ...(best
          ? {
              routerAddress: best.route.router,
              routeDescription: `${best.route.venue} · ${best.route.path.length - 1} ${best.route.path.length === 2 ? "pool" : "pools"}${
                isV3Route(best.route)
                  ? ` · ${v3RouteFees(best.route)
                      .map((fee) => `${fee / 10_000}%`)
                      .join(" → ")}`
                  : ""
              }`,
            }
          : {}),
        ...(networkFee.data?.label ? { estimatedNetworkFee: networkFee.data.label } : {}),
        ...(networkFee.data?.usdFee !== undefined
          ? { estimatedNetworkFeeUsd: networkFee.data.usdFee }
          : {}),
        excludedVenues: [...new Set((quotes.data?.excluded ?? []).map((item) => item.route.venue))],
        preferredVenue,
        ...(compared
          ? {
              bestVenue: topQuote.route.venue,
              routedVenues: [...new Set(quotes.data!.quotes.map((q) => q.route.venue))],
              venueRouteLabels,
              ...(savingsAmount && savingsComparedTo
                ? { savingsAmount, savingsComparedTo }
                : {}),
              spreadPercent: improvement,
            venueShortfallPercent,
            comparisonText: !best
              ? `${preferredVenue} has no route for this trade. Choose another venue or Best price.`
              : preferredVenue
                ? venueShortfallPercent > 0
                  ? `You chose ${preferredVenue}: ${venueShortfallPercent.toFixed(2)}% fewer tokens than ${topQuote.route.venue}, the best quote (before gas).`
                  : `You chose ${preferredVenue}, which matches the best quote (before gas).`
                : isV3Route(best.route)
                  ? `Routed via ${best.route.venue} (${v3RouteFees(best.route)
                      .map((fee) => `${fee / 10000}%`)
                      .join(
                        " → "
                      )}${best.route.path.length > 2 ? `, ${best.route.path.length - 1} hops` : ""})${
                      uni && improvement > 0
                        ? ` for +${improvement.toFixed(2)}% more tokens than Uniswap V2`
                        : ""
                    } (before gas).`
                  : uni && best.route.venue === "Aerodrome"
                    ? `Routed via Aerodrome for +${improvement.toFixed(2)}% more tokens than Uniswap V2 (before gas).`
                    : `Best quoted output via ${best.route.venue} (before gas).`,
            ...(uniV3
              ? { uniswapV3AmountOut: formatUnits(uniV3.output, state.buyToken.decimals) }
              : {}),
            ...(uni ? { uniswapAmountOut: formatUnits(uni.output, state.buyToken.decimals) } : {}),
            ...(aero
              ? { aerodromeAmountOut: formatUnits(aero.output, state.buyToken.decimals) }
              : {}),
            extraVenueQuotes,
          }
        : {}),
    },
  };
}
