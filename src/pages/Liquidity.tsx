// src/pages/Liquidity.tsx - Add/Remove Liquidity
import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertCircle, Droplet, Layers, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { type Address, formatUnits, type Hash, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { V2ToV3MigrationWizard } from "@/components/liquidity/V2ToV3MigrationWizard";
import { V3LiquidityManager } from "@/components/liquidity/V3LiquidityManager";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ERC20_ABI, UNISWAP_V2_PAIR_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { getUniswapV2Factory, getUniswapV2Router } from "@/config/contracts";
import { getTokensForChain, getWrappedNativeAddress, type Token } from "@/config/tokens";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

type LiquidityMode = "add" | "remove";
type ProtocolVersion = "migrate" | "v3" | "v2";

interface PoolInfo {
  readonly totalSupply: bigint;
  readonly reserves: readonly [bigint, bigint];
  readonly token0: Address;
  readonly token1: Address;
  readonly userLpBalance: bigint;
  readonly poolShare: string; // percentage, fixed decimal text
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const FACTORY_ABI = [
  {
    constant: true,
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    name: "getPair",
    outputs: [{ name: "pair", type: "address" }],
    type: "function",
  },
] as const;

const BPS_DENOMINATOR = 10_000n;
const LIQUIDITY_SLIPPAGE_BPS = 50n; // 0.5%

const applySlippageFloor = (amount: bigint): bigint =>
  (amount * (BPS_DENOMINATOR - LIQUIDITY_SLIPPAGE_BPS)) / BPS_DENOMINATOR;

function quotePoolAmount(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint | null {
  if (amountIn < 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  return (amountIn * reserveOut) / reserveIn;
}

function formatAmountForInput(amount: bigint, decimals: number, fractionDigits = 6): string {
  const formatted = formatUnits(amount, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, fractionDigits).replace(/0+$/, "");
  const wholeAmount = whole ?? "0";
  return trimmedFraction ? `${wholeAmount}.${trimmedFraction}` : wholeAmount;
}

function formatPercentage(numerator: bigint, denominator: bigint, fractionDigits = 4): string {
  if (denominator <= 0n || numerator <= 0n) return `0.${"0".repeat(fractionDigits)}`;

  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (numerator * 100n * scale) / denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(fractionDigits, "0");
  return `${whole}.${fraction}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function isNative(address: Address | "native"): address is "native" {
  return address === "native";
}

function resolveAddress(token: Token, chainId?: number): Address {
  return isNative(token.address) ? getWrappedNativeAddress(chainId) : token.address;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function Liquidity() {
  const { address: userAddress, chainId, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const isSupportedChain = chainId === 1 || chainId === 8453;
  const isMainnet = isSupportedChain;

  const availableTokens = useMemo(() => getTokensForChain(chainId), [chainId]);
  const factoryAddress = useMemo(() => getUniswapV2Factory(chainId), [chainId]);
  const routerAddress = useMemo(() => getUniswapV2Router(chainId), [chainId]);

  // ────────────────────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────────────────────

  const [protocolVersion, setProtocolVersion] = useState<ProtocolVersion>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("version") || params.get("v");
      if (v === "v2" || v === "2") return "v2";
      if (v === "v3" || v === "3") return "v3";
      if (v === "migrate") return "migrate";
    }
    return "migrate";
  });

  const [mode, setMode] = useState<LiquidityMode>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const m = params.get("mode") || params.get("tab");
      if (m === "remove") return "remove";
    }
    return "add";
  });
  const [tokenA, setTokenA] = useState<Token>(() => availableTokens[0]);
  const [tokenB, setTokenB] = useState<Token>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tokenSym = params.get("token") || params.get("symbol");
      if (tokenSym) {
        const found = availableTokens.find((t) => t.symbol.toUpperCase() === tokenSym.toUpperCase());
        if (found) return found;
      }
    }
    return availableTokens.find((t) => t.symbol === "SD") ?? availableTokens[1];
  });
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [lpTokenAmount, setLpTokenAmount] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const m = params.get("mode") || params.get("tab");
      if (m === "remove") setMode("remove");
      const tokenSym = params.get("token") || params.get("symbol");
      if (tokenSym) {
        const found = availableTokens.find((t) => t.symbol.toUpperCase() === tokenSym.toUpperCase());
        if (found) {
          setTokenB(found);
          return;
        }
      }
    }
    if (chainId === 8453) {
      const sdToken = availableTokens.find((t) => t.symbol === "SD");
      setTokenA(availableTokens[0]); // ETH
      setTokenB(sdToken ?? availableTokens[1]); // SD
    } else {
      setTokenA(availableTokens[0]);
      setTokenB(availableTokens[1]);
    }
  }, [chainId, availableTokens]);

  // ────────────────────────────────────────────────────────────────────────────
  // Contract Reads
  // ────────────────────────────────────────────────────────────────────────────

  // Get pair address
  const { data: pairAddress, refetch: refetchPairAddress } = useReadContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [resolveAddress(tokenA, chainId), resolveAddress(tokenB, chainId)],
    query: { enabled: tokenA.address !== tokenB.address },
  });

  const poolExists = pairAddress && pairAddress !== "0x0000000000000000000000000000000000000000";

  // Get pool reserves
  const { data: reservesData, refetch: refetchReserves } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "getReserves",
    query: { enabled: !!poolExists, refetchInterval: 10_000 },
  });

  // Get LP token total supply
  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "totalSupply",
    query: { enabled: !!poolExists },
  });

  // Get user's LP token balance
  const { data: userLpBalance, refetch: refetchUserLpBalance } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!poolExists && !!userAddress },
  });

  // Get token balances
  const { data: balanceA, refetch: refetchBalanceA } = useBalance({
    address: userAddress,
    token: isNative(tokenA.address) ? undefined : tokenA.address,
    query: { enabled: isConnected },
  });

  const { data: balanceB, refetch: refetchBalanceB } = useBalance({
    address: userAddress,
    token: isNative(tokenB.address) ? undefined : tokenB.address,
    query: { enabled: isConnected },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Write Contracts
  // ────────────────────────────────────────────────────────────────────────────

  const { writeContractAsync: approveA } = useWriteContract();
  const { writeContractAsync: approveB } = useWriteContract();
  const { writeContractAsync: addLiq, isPending: isAddingLiq } = useWriteContract();
  const { writeContractAsync: removeLiq, isPending: isRemovingLiq } = useWriteContract();

  const waitForConfirmation = useCallback(
    async (hash: Hash) => {
      if (!publicClient) {
        throw new Error(
          "A mainnet RPC client is unavailable. Reconnect your wallet and try again."
        );
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("The transaction reverted on-chain.");
      }
    },
    [publicClient]
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Computed Pool Info
  // ────────────────────────────────────────────────────────────────────────────

  const poolInfo = useMemo<PoolInfo | null>(() => {
    if (!poolExists || !reservesData || !totalSupply) return null;

    const [reserve0, reserve1] = reservesData as readonly [bigint, bigint, number];
    const userBalance = userLpBalance || 0n;
    const poolShare = formatPercentage(userBalance, totalSupply);

    // Determine which reserve corresponds to which token
    // Uniswap sorts tokens by address
    const token0Addr = resolveAddress(tokenA, chainId);
    const token1Addr = resolveAddress(tokenB, chainId);
    const isToken0Lower = BigInt(token0Addr) < BigInt(token1Addr);

    return {
      totalSupply,
      reserves: isToken0Lower ? [reserve0, reserve1] : [reserve1, reserve0],
      token0: token0Addr,
      token1: token1Addr,
      userLpBalance: userBalance,
      poolShare,
    };
  }, [poolExists, reservesData, totalSupply, userLpBalance, tokenA, tokenB, chainId]);

  // ────────────────────────────────────────────────────────────────────────────
  // Price Calculations
  // ────────────────────────────────────────────────────────────────────────────

  const priceRatio = useMemo(() => {
    if (!poolInfo || poolInfo.reserves[0] === 0n) return null;
    const oneTokenA = 10n ** BigInt(tokenA.decimals);
    const quote = quotePoolAmount(oneTokenA, poolInfo.reserves[0], poolInfo.reserves[1]);
    return quote === null ? null : formatAmountForInput(quote, tokenB.decimals);
  }, [poolInfo, tokenA.decimals, tokenB.decimals]);

  // Bidirectional calculations for adding liquidity
  const handleAmountAChange = useCallback(
    (value: string) => {
      setAmountA(value);
      if (mode !== "add" || !poolInfo || !value) {
        if (!value) setAmountB("");
        return;
      }
      try {
        const parsed = parseUnits(value, tokenA.decimals);
        const quoted = quotePoolAmount(parsed, poolInfo.reserves[0], poolInfo.reserves[1]);
        if (quoted !== null) {
          setAmountB(formatAmountForInput(quoted, tokenB.decimals));
        }
      } catch {
        // preserve user input
      }
    },
    [mode, poolInfo, tokenA.decimals, tokenB.decimals]
  );

  const handleAmountBChange = useCallback(
    (value: string) => {
      setAmountB(value);
      if (mode !== "add" || !poolInfo || !value) {
        if (!value) setAmountA("");
        return;
      }
      try {
        const parsed = parseUnits(value, tokenB.decimals);
        const quoted = quotePoolAmount(parsed, poolInfo.reserves[1], poolInfo.reserves[0]);
        if (quoted !== null) {
          setAmountA(formatAmountForInput(quoted, tokenA.decimals));
        }
      } catch {
        // preserve user input
      }
    },
    [mode, poolInfo, tokenA.decimals, tokenB.decimals]
  );

  const handleMaxA = useCallback(() => {
    if (!balanceA) return;
    let val = balanceA.value;
    if (isNative(tokenA.address)) {
      const gasBuffer = parseUnits("0.001", 18);
      val = val > gasBuffer ? val - gasBuffer : 0n;
    }
    handleAmountAChange(formatUnits(val, tokenA.decimals));
  }, [balanceA, tokenA, handleAmountAChange]);

  const handleMaxB = useCallback(() => {
    if (!balanceB) return;
    let val = balanceB.value;
    if (isNative(tokenB.address)) {
      const gasBuffer = parseUnits("0.001", 18);
      val = val > gasBuffer ? val - gasBuffer : 0n;
    }
    handleAmountBChange(formatUnits(val, tokenB.decimals));
  }, [balanceB, tokenB, handleAmountBChange]);

  const isInsufficientA = useMemo(() => {
    if (!amountA || !balanceA) return false;
    try {
      return parseUnits(amountA, tokenA.decimals) > balanceA.value;
    } catch {
      return false;
    }
  }, [amountA, balanceA, tokenA.decimals]);

  const isInsufficientB = useMemo(() => {
    if (!amountB || !balanceB) return false;
    try {
      return parseUnits(amountB, tokenB.decimals) > balanceB.value;
    } catch {
      return false;
    }
  }, [amountB, balanceB, tokenB.decimals]);

  // Calculate amounts for remove liquidity
  const removeAmounts = useMemo(() => {
    if (mode !== "remove" || !lpTokenAmount || !poolInfo) return null;

    try {
      const lpAmount = parseUnits(lpTokenAmount, 18);
      if (lpAmount > poolInfo.totalSupply) return null;

      const amountAOut = (poolInfo.reserves[0] * lpAmount) / poolInfo.totalSupply;
      const amountBOut = (poolInfo.reserves[1] * lpAmount) / poolInfo.totalSupply;

      return {
        amountA: amountAOut,
        amountB: amountBOut,
      };
    } catch {
      return null;
    }
  }, [mode, lpTokenAmount, poolInfo]);

  // ────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────────────────────

  const handleAddLiquidity = useCallback(async () => {
    if (!amountA || !amountB || !userAddress) return;
    if (!isMainnet) {
      toast.error(
        "Switch to Base or Ethereum mainnet before managing this Uniswap V2 liquidity position."
      );
      return;
    }
    if (resolveAddress(tokenA, chainId) === resolveAddress(tokenB, chainId)) {
      toast.error("A pool must contain two different assets.");
      return;
    }

    try {
      const amountADesired = parseUnits(amountA, tokenA.decimals);
      const amountBDesired = parseUnits(amountB, tokenB.decimals);
      const amountAMin = applySlippageFloor(amountADesired);
      const amountBMin = applySlippageFloor(amountBDesired);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900); // 15 min

      // Wait for every required approval before requesting the liquidity transaction.
      if (!isNative(tokenA.address) && publicClient) {
        const currentAllowanceA = await publicClient.readContract({
          address: tokenA.address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [userAddress, routerAddress],
        });
        if (currentAllowanceA < amountADesired) {
          const approvalHash = await approveA({
            address: tokenA.address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [routerAddress, amountADesired],
          });
          await waitForConfirmation(approvalHash);
        }
      }

      if (!isNative(tokenB.address) && publicClient) {
        const currentAllowanceB = await publicClient.readContract({
          address: tokenB.address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [userAddress, routerAddress],
        });
        if (currentAllowanceB < amountBDesired) {
          const approvalHash = await approveB({
            address: tokenB.address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [routerAddress, amountBDesired],
          });
          await waitForConfirmation(approvalHash);
        }
      }

      let liquidityHash: Hash;
      if (isNative(tokenA.address)) {
        liquidityHash = await addLiq({
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "addLiquidityETH",
          args: [
            resolveAddress(tokenB, chainId),
            amountBDesired,
            amountBMin,
            amountAMin,
            userAddress,
            deadline,
          ],
          value: amountADesired,
        });
      } else if (isNative(tokenB.address)) {
        liquidityHash = await addLiq({
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "addLiquidityETH",
          args: [
            resolveAddress(tokenA, chainId),
            amountADesired,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ],
          value: amountBDesired,
        });
      } else {
        liquidityHash = await addLiq({
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "addLiquidity",
          args: [
            tokenA.address,
            tokenB.address,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ],
        });
      }
      await waitForConfirmation(liquidityHash);

      toast.success("Liquidity added successfully!");
      setAmountA("");
      setAmountB("");
      void refetchReserves();
      void refetchTotalSupply();
      void refetchUserLpBalance();
      void refetchBalanceA();
      void refetchBalanceB();
      void refetchPairAddress();
    } catch (error) {
      toast.error("Failed to add liquidity");
      console.error(error);
    }
  }, [
    amountA,
    amountB,
    tokenA,
    tokenB,
    chainId,
    userAddress,
    isMainnet,
    routerAddress,
    publicClient,
    approveA,
    approveB,
    addLiq,
    waitForConfirmation,
    refetchReserves,
    refetchTotalSupply,
    refetchUserLpBalance,
    refetchBalanceA,
    refetchBalanceB,
    refetchPairAddress,
  ]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!lpTokenAmount || !userAddress || !poolExists) return;
    if (!isMainnet) {
      toast.error("Switch to Base or Ethereum mainnet before managing this Uniswap V2 liquidity position.");
      return;
    }
    if (!removeAmounts) {
      toast.error("Enter a valid LP-token amount that does not exceed the pool supply.");
      return;
    }

    try {
      const liquidity = parseUnits(lpTokenAmount, 18);
      if (!poolInfo || liquidity > poolInfo.userLpBalance) {
        toast.error("The requested LP-token amount exceeds your available balance.");
        return;
      }
      const amountAMin = applySlippageFloor(removeAmounts.amountA);
      const amountBMin = applySlippageFloor(removeAmounts.amountB);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);

      // The LP-token approval must settle before the removal transaction is submitted.
      const approvalHash = await approveA({
        address: pairAddress as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [routerAddress, liquidity],
      });
      await waitForConfirmation(approvalHash);

      let removeHash: Hash;
      if (isNative(tokenA.address)) {
        removeHash = await removeLiq({
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "removeLiquidityETH",
          args: [resolveAddress(tokenB, chainId), liquidity, amountBMin, amountAMin, userAddress, deadline],
        });
      } else if (isNative(tokenB.address)) {
        removeHash = await removeLiq({
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "removeLiquidityETH",
          args: [resolveAddress(tokenA, chainId), liquidity, amountAMin, amountBMin, userAddress, deadline],
        });
      } else {
        removeHash = await removeLiq({
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "removeLiquidity",
          args: [
            tokenA.address,
            tokenB.address,
            liquidity,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ],
        });
      }
      await waitForConfirmation(removeHash);

      toast.success("Liquidity removed successfully!");
      setLpTokenAmount("");
      void refetchReserves();
      void refetchTotalSupply();
      void refetchUserLpBalance();
      void refetchBalanceA();
      void refetchBalanceB();
    } catch (error) {
      toast.error("Failed to remove liquidity");
      console.error(error);
    }
  }, [
    lpTokenAmount,
    removeAmounts,
    userAddress,
    poolExists,
    pairAddress,
    poolInfo,
    tokenA,
    tokenB,
    chainId,
    isMainnet,
    routerAddress,
    approveA,
    removeLiq,
    waitForConfirmation,
    refetchReserves,
    refetchTotalSupply,
    refetchUserLpBalance,
    refetchBalanceA,
    refetchBalanceB,
  ]);

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-3xl font-black text-transparent">
            <Droplet className="size-8 text-blue-600" />
            Liquidity Pools
          </h1>
          <p className="text-sm text-slate-500">Add or remove liquidity to earn fees</p>
        </div>
      </div>

      {/* Protocol Version / Migration Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-white p-3 shadow-xs">
        <Tabs
          value={protocolVersion}
          onValueChange={(val) => setProtocolVersion(val as ProtocolVersion)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-3 sm:w-auto border bg-slate-100/80 p-1">
            <TabsTrigger
              value="migrate"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white font-bold"
            >
              <Sparkles className="mr-1.5 size-4" /> V2 ➔ V3 Migration
            </TabsTrigger>
            <TabsTrigger
              value="v3"
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white font-semibold"
            >
              <Layers className="mr-1.5 size-4" /> Uniswap V3
            </TabsTrigger>
            <TabsTrigger
              value="v2"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white font-semibold"
            >
              <Droplet className="mr-1.5 size-4" /> Uniswap V2 (Classic)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-xs text-slate-500">
          {protocolVersion === "migrate" && "Withdraw V2 LP and supply into Uniswap V3"}
          {protocolVersion === "v3" && "Manage concentrated liquidity and NFT positions"}
          {protocolVersion === "v2" && "Classic 50/50 liquidity pools"}
        </div>
      </div>

      {protocolVersion === "migrate" && (
        <div className="space-y-6">
          <V2ToV3MigrationWizard />
          <V3LiquidityManager />
        </div>
      )}

      {protocolVersion === "v3" && (
        <div className="space-y-6">
          <V3LiquidityManager />
          <V2ToV3MigrationWizard />
        </div>
      )}

      {protocolVersion === "v2" && (
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Pool Stats */}
        <div className="space-y-4 lg:col-span-1">
          {poolExists && poolInfo ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Your Position</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">LP Tokens</p>
                    <p className="text-2xl font-bold">{formatUnits(poolInfo.userLpBalance, 18)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pool Share</p>
                    <p className="text-xl font-bold text-blue-600">{poolInfo.poolShare}%</p>
                  </div>
                  <div className="border-t pt-2">
                    <p className="mb-1 text-xs text-gray-500">{tokenA.symbol} Balance</p>
                    <p className="font-medium">{balanceA?.formatted || "0"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-gray-500">{tokenB.symbol} Balance</p>
                    <p className="font-medium">{balanceB?.formatted || "0"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Pool Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tokenA.symbol} Reserve</span>
                    <span className="font-medium">
                      {formatUnits(poolInfo.reserves[0], tokenA.decimals)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tokenB.symbol} Reserve</span>
                    <span className="font-medium">
                      {formatUnits(poolInfo.reserves[1], tokenB.decimals)}
                    </span>
                  </div>
                  {priceRatio && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-600">Price Ratio</span>
                      <span className="font-medium">
                        1 {tokenA.symbol} = {priceRatio} {tokenB.symbol}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>
                {poolExists === false
                  ? "Pool does not exist yet. Be the first to add liquidity!"
                  : "Select tokens to view pool info"}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Right: Add/Remove Interface */}
        <div className="lg:col-span-2">
          <Card className="border-2 border-blue-200">
            <CardHeader>
              <Tabs value={mode} onValueChange={(v) => setMode(v as LiquidityMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="add">
                    <Plus className="mr-1 size-4" />
                    Add Liquidity
                  </TabsTrigger>
                  <TabsTrigger value="remove">
                    <Minus className="mr-1 size-4" />
                    Remove Liquidity
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            <CardContent className="space-y-4">
              {mode === "add" ? (
                <>
                  {/* Token A */}
                  <div className="space-y-2">
                    <Label>First Token</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={amountA}
                        onChange={(e) => handleAmountAChange(e.target.value)}
                        className={`flex-1 ${isInsufficientA ? "border-red-500" : ""}`}
                      />
                      <Select
                        value={tokenA.symbol}
                        onValueChange={(sym) => {
                          const token = availableTokens.find((t) => t.symbol === sym);
                          if (token) setTokenA(token);
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTokens.map((t) => (
                            <SelectItem key={t.symbol} value={t.symbol}>
                              {t.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Balance: {balanceA?.formatted || "0"}</span>
                      {balanceA && (
                        <button
                          type="button"
                          onClick={handleMaxA}
                          className="font-bold text-blue-600 hover:text-blue-700"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Plus className="size-6 text-gray-400" />
                  </div>

                  {/* Token B */}
                  <div className="space-y-2">
                    <Label>Second Token</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={amountB}
                        onChange={(e) => handleAmountBChange(e.target.value)}
                        className={`flex-1 ${isInsufficientB ? "border-red-500" : ""}`}
                      />
                      <Select
                        value={tokenB.symbol}
                        onValueChange={(sym) => {
                          const token = availableTokens.find((t) => t.symbol === sym);
                          if (token) setTokenB(token);
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTokens.map((t) => (
                            <SelectItem key={t.symbol} value={t.symbol}>
                              {t.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Balance: {balanceB?.formatted || "0"}
                        {poolInfo && " (auto-synced to pool ratio)"}
                      </span>
                      {balanceB && (
                        <button
                          type="button"
                          onClick={handleMaxB}
                          className="font-bold text-blue-600 hover:text-blue-700"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600"
                    onClick={handleAddLiquidity}
                    disabled={
                      !amountA ||
                      !amountB ||
                      !isConnected ||
                      !isMainnet ||
                      isAddingLiq ||
                      isInsufficientA ||
                      isInsufficientB
                    }
                  >
                    {isAddingLiq ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Adding Liquidity...
                      </>
                    ) : isInsufficientA ? (
                      `Insufficient ${tokenA.symbol} Balance`
                    ) : isInsufficientB ? (
                      `Insufficient ${tokenB.symbol} Balance`
                    ) : (
                      "Add Liquidity"
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {/* Remove Liquidity */}
                  <div className="space-y-2">
                    <Label>LP Tokens to Remove</Label>
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={lpTokenAmount}
                      onChange={(e) => setLpTokenAmount(e.target.value)}
                    />
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Available: {poolInfo ? formatUnits(poolInfo.userLpBalance, 18) : "0"} LP</span>
                      {poolInfo && poolInfo.userLpBalance > 0n && (
                        <button
                          type="button"
                          onClick={() => setLpTokenAmount(formatUnits(poolInfo.userLpBalance, 18))}
                          className="font-bold text-blue-600 hover:text-blue-700"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>

                  {removeAmounts && (
                    <Alert className="border-blue-200 bg-blue-50">
                      <AlertDescription>
                        <p className="mb-2 font-medium">You will receive:</p>
                        <p className="text-sm">
                          • {formatUnits(removeAmounts.amountA, tokenA.decimals)} {tokenA.symbol}
                        </p>
                        <p className="text-sm">
                          • {formatUnits(removeAmounts.amountB, tokenB.decimals)} {tokenB.symbol}
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600"
                    onClick={handleRemoveLiquidity}
                    disabled={!lpTokenAmount || !isConnected || !isMainnet || isRemovingLiq}
                  >
                    {isRemovingLiq ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Removing Liquidity...
                      </>
                    ) : (
                      "Remove Liquidity"
                    )}
                  </Button>
                </>
              )}

              {!isConnected && (
                <Alert>
                  <AlertDescription>
                    Connect your wallet to add or remove liquidity
                  </AlertDescription>
                </Alert>
              )}
              {isConnected && chainId !== 8453 && (
                <Alert className="border-blue-300 bg-blue-50 text-blue-900">
                  <AlertDescription className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-blue-950">Switch to Base Mainnet</p>
                      <p className="text-xs text-blue-800">
                        You are currently on {chain?.name || `Chain ${chainId}`}. Switch to Base to
                        seed Shaggy Dogg (SD) liquidity.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => switchChain({ chainId: 8453 })}
                      disabled={isSwitchingChain}
                      className="ml-4 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      {isSwitchingChain ? "Switching..." : "Switch to Base"}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
