// src/pages/Liquidity.tsx - 2026 DeFi Liquidity Hub (V3 Concentrated, V2->V3 Migration, Classic V2 & Sovereign Timelock)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  ArrowUpDown,
  Droplet,
  ExternalLink,
  Fuel,
  Layers,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { type Address, formatGwei, formatUnits, type Hash, parseUnits } from "viem";
import { base } from "viem/chains";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { LpLockCard } from "@/components/liquidity/LpLockCard";
import { V2ToV3MigrationWizard } from "@/components/liquidity/V2ToV3MigrationWizard";
import { V3LiquidityManager } from "@/components/liquidity/V3LiquidityManager";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ERC20_ABI, UNISWAP_V2_PAIR_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { getUniswapV2Factory, getUniswapV2Router } from "@/config/contracts";
import { getTokensForChain, getWrappedNativeAddress, type Token } from "@/config/tokens";
import { isPositiveAmount, quoteForInput } from "@/lib/amm/liquidity-input";
import { approvalSequence } from "@/lib/approvals";

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

interface FeaturedBasePool {
  readonly id: string;
  readonly title: string;
  readonly tokenSymbol: string;
  readonly feeLabel: string;
  readonly protocol: ProtocolVersion;
  readonly badge: string;
  readonly highlight: string;
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
const SLIPPAGE_PRESETS_BPS = [
  { label: "0.1%", bps: 10n },
  { label: "0.5%", bps: 50n },
  { label: "1.0%", bps: 100n },
] as const;
const REMOVE_PERCENT_PRESETS = [25, 50, 75, 100] as const;

const FEATURED_BASE_POOLS: readonly FeaturedBasePool[] = [
  {
    id: "mrwd-weth",
    title: "MRWD / WETH",
    tokenSymbol: "MRWD",
    feeLabel: "V3 · 0.30%",
    protocol: "v3",
    badge: "Q1 Staking",
    highlight: "Eligible for Q1 $MRWD NFT staking rewards",
  },
  {
    id: "sd-weth",
    title: "SD / WETH",
    tokenSymbol: "SD",
    feeLabel: "V2 + V3 · 1.0%",
    protocol: "migrate",
    badge: "Flagship",
    highlight: "Active Base V2 & V3 pools + Sovereign Locker",
  },
  {
    id: "usdc-weth",
    title: "ETH / USDC",
    tokenSymbol: "USDC",
    feeLabel: "V3 · 0.05%",
    protocol: "v3",
    badge: "Deepest TVL",
    highlight: "Core Base WETH/USDC concentrated pool",
  },
  {
    id: "fba-weth",
    title: "FBA / WETH",
    tokenSymbol: "FBA",
    feeLabel: "V2 ➔ V3 · 1.0%",
    protocol: "migrate",
    badge: "Migrate",
    highlight: "1-flow V2 LP withdrawal & V3 initialization",
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function quotePoolAmount(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint | null {
  if (amountIn < 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  return (amountIn * reserveOut) / reserveIn;
}

function formatPercentage(numerator: bigint, denominator: bigint, fractionDigits = 4): string {
  if (denominator <= 0n || numerator <= 0n) return `0.${"0".repeat(fractionDigits)}`;

  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (numerator * 100n * scale) / denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(fractionDigits, "0");
  return `${whole}.${fraction}`;
}

function formatReadableUnits(value: bigint, decimals: number, maxFraction = 6): string {
  const formatted = formatUnits(value, decimals);
  const num = Number(formatted);
  if (!Number.isFinite(num) || num === 0) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num < 0.000001) return "<0.000001";
  return num.toLocaleString(undefined, { maximumFractionDigits: maxFraction });
}

function extractTxErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const shortMsg = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMsg === "string" && shortMsg.trim().length > 0) {
      return shortMsg.trim();
    }
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim().length > 0) {
      const firstLine = msg.split("\n")[0]?.trim();
      if (firstLine) return firstLine.slice(0, 140);
    }
  }
  return fallback;
}

function isNative(address: Address | "native"): address is "native" {
  return address === "native";
}

function resolveAddress(token: Token, chainId?: number): Address {
  return isNative(token.address) ? getWrappedNativeAddress(chainId) : token.address;
}

function explorerBaseUrl(chainId: number): string {
  return chainId === 1 ? "https://etherscan.io" : "https://basescan.org";
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function Liquidity() {
  const { address: userAddress, chainId: walletChainId, isConnected, chain } = useAccount();
  // This is a Base app: with no wallet, show Base pools rather than wagmi's first chain.
  const chainId = walletChainId ?? base.id;
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId });
  // Classic V2 add/remove works on Base and Ethereum. Migration, V3 positions and LP locks are Base-only.
  const isSupportedChain = chainId === 1 || chainId === 8453;
  const isMainnet = isSupportedChain;
  const onBase = chainId === base.id;
  const showBaseOnlyNotice = isConnected && !onBase;

  const availableTokens = useMemo(() => getTokensForChain(chainId), [chainId]);
  const factoryAddress = useMemo(() => getUniswapV2Factory(chainId), [chainId]);
  const routerAddress = useMemo(() => getUniswapV2Router(chainId), [chainId]);

  // ────────────────────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────────────────────

  const versionFromLink = useRef(
    typeof window !== "undefined" &&
      ["version", "v"].some((key) => new URLSearchParams(window.location.search).has(key))
  );
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

  const [selectedV3PairId, setSelectedV3PairId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("pair");
    }
    return null;
  });

  // On Ethereum only classic V2 works here, so open on it unless a link asked for another tab.
  useEffect(() => {
    if (chainId === 1 && !versionFromLink.current) {
      setProtocolVersion((current) => (current === "migrate" ? "v2" : current));
    }
  }, [chainId]);

  // Lightweight live block/gas telemetry via publicClient (graceful no-op when mocked/offline)
  const [telemetry, setTelemetry] = useState<{ block: bigint | null; gwei: string | null }>({
    block: null,
    gwei: null,
  });

  useEffect(() => {
    const client = publicClient as
      | {
          getBlockNumber?: () => Promise<bigint>;
          getGasPrice?: () => Promise<bigint>;
        }
      | undefined;
    if (!client || typeof client.getBlockNumber !== "function") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const [blk, gas] = await Promise.all([
          client.getBlockNumber!(),
          typeof client.getGasPrice === "function" ? client.getGasPrice() : Promise.resolve(0n),
        ]);
        if (cancelled) return;
        const gweiNum = gas > 0n ? Number(formatGwei(gas)) : null;
        setTelemetry({
          block: blk,
          gwei:
            gweiNum !== null
              ? gweiNum < 0.01
                ? "<0.01"
                : gweiNum.toFixed(gweiNum < 1 ? 3 : 1)
              : null,
        });
      } catch {
        // Non-blocking telemetry
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 12_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [publicClient, chainId]);

  const openWalletConnect = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("shaggy:open-wallet-connect", { detail: { view: "list" } })
    );
  }, []);

  const syncUrlParams = useCallback(
    (nextVersion: ProtocolVersion, nextMode: LiquidityMode, nextPair?: string | null) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      params.set("version", nextVersion);
      if (nextVersion === "v2") {
        params.set("mode", nextMode);
      } else {
        params.delete("mode");
      }
      if (nextPair) {
        params.set("pair", nextPair);
      }
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/liquidity?${qs}` : "/liquidity");
    },
    []
  );

  const baseOnlyNotice = showBaseOnlyNotice && (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-950">Base only</p>
          <p className="text-xs text-amber-800">
            V2 → V3 migration, Uniswap V3 positions and LP locks run on Base. You are on{" "}
            {chain?.name || `Chain ${chainId}`}.
            {isSupportedChain && " Classic V2 add and remove liquidity works here."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => switchChain({ chainId: base.id })}
          disabled={isSwitchingChain}
          className="bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {isSwitchingChain ? "Switching..." : "Switch to Base"}
        </Button>
      </AlertDescription>
    </Alert>
  );

  const [mode, setMode] = useState<LiquidityMode>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const m = params.get("mode") || params.get("tab");
      if (m === "remove") return "remove";
    }
    return "add";
  });
  const [slippageBps, setSlippageBps] = useState<bigint>(50n);
  const [lastV2TxHash, setLastV2TxHash] = useState<Hash | null>(null);

  const [tokenA, setTokenA] = useState<Token>(() => availableTokens[0]!);
  const [tokenB, setTokenB] = useState<Token>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tokenSym = params.get("token") || params.get("symbol");
      if (tokenSym) {
        const found = availableTokens.find(
          (t) => t.symbol.toUpperCase() === tokenSym.toUpperCase()
        );
        if (found && found.symbol !== availableTokens[0]?.symbol) return found;
      }
    }
    return availableTokens.find((t) => t.symbol === "SD") ?? availableTokens[1]!;
  });
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [lpTokenAmount, setLpTokenAmount] = useState<string>("");

  const prevChainIdRef = useRef<number>(chainId);
  useEffect(() => {
    if (prevChainIdRef.current === chainId) return;
    prevChainIdRef.current = chainId;
    setAmountA("");
    setAmountB("");
    setLpTokenAmount("");
    if (chainId === 8453) {
      const sdToken = availableTokens.find((t) => t.symbol === "SD");
      setTokenA(availableTokens[0]!);
      setTokenB(sdToken ?? availableTokens[1]!);
    } else {
      setTokenA(availableTokens[0]!);
      setTokenB(availableTokens[1]!);
    }
  }, [chainId, availableTokens]);

  const applySlippageFloor = useCallback(
    (amount: bigint): bigint => (amount * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR,
    [slippageBps]
  );

  // Prevent selecting identical token on both sides by swapping tokens cleanly
  const handleSelectTokenA = useCallback(
    (sym: string) => {
      const next = availableTokens.find((t) => t.symbol === sym);
      if (!next) return;
      if (resolveAddress(next, chainId).toLowerCase() === resolveAddress(tokenB, chainId).toLowerCase()) {
        setTokenB(tokenA);
      }
      setTokenA(next);
      setAmountA("");
      setAmountB("");
    },
    [availableTokens, chainId, tokenA, tokenB]
  );

  const handleSelectTokenB = useCallback(
    (sym: string) => {
      const next = availableTokens.find((t) => t.symbol === sym);
      if (!next) return;
      if (resolveAddress(next, chainId).toLowerCase() === resolveAddress(tokenA, chainId).toLowerCase()) {
        setTokenA(tokenB);
      }
      setTokenB(next);
      setAmountA("");
      setAmountB("");
    },
    [availableTokens, chainId, tokenA, tokenB]
  );

  const handleFlipV2Tokens = useCallback(() => {
    setTokenA(tokenB);
    setTokenB(tokenA);
    setAmountA(amountB);
    setAmountB(amountA);
  }, [tokenA, tokenB, amountA, amountB]);

  const handleFeaturedPoolClick = useCallback(
    (pool: FeaturedBasePool) => {
      versionFromLink.current = true;
      setProtocolVersion(pool.protocol);
      setSelectedV3PairId(pool.id);
      syncUrlParams(pool.protocol, mode, pool.id);
    },
    [mode, syncUrlParams]
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Contract Reads
  // ────────────────────────────────────────────────────────────────────────────

  const { data: pairAddress, refetch: refetchPairAddress } = useReadContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [resolveAddress(tokenA, chainId), resolveAddress(tokenB, chainId)],
    chainId,
    query: {
      enabled:
        resolveAddress(tokenA, chainId).toLowerCase() !==
        resolveAddress(tokenB, chainId).toLowerCase(),
    },
  });

  const poolExists = pairAddress && pairAddress !== "0x0000000000000000000000000000000000000000";

  const { data: reservesData, refetch: refetchReserves } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "getReserves",
    chainId,
    query: { enabled: !!poolExists, refetchInterval: 10_000 },
  });

  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "totalSupply",
    chainId,
    query: { enabled: !!poolExists },
  });

  const { data: userLpBalance, refetch: refetchUserLpBalance } = useReadContract({
    address: poolExists ? (pairAddress as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: !!poolExists && !!userAddress },
  });

  const { data: balanceA, refetch: refetchBalanceA } = useBalance({
    address: userAddress,
    token: isNative(tokenA.address) ? undefined : tokenA.address,
    chainId,
    query: { enabled: isConnected },
  });

  const { data: balanceB, refetch: refetchBalanceB } = useBalance({
    address: userAddress,
    token: isNative(tokenB.address) ? undefined : tokenB.address,
    chainId,
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
  // Price & Share Calculations
  // ────────────────────────────────────────────────────────────────────────────

  const priceRatio = useMemo(() => {
    if (!poolInfo || poolInfo.reserves[0] === 0n) return null;
    const oneTokenA = 10n ** BigInt(tokenA.decimals);
    const quote = quotePoolAmount(oneTokenA, poolInfo.reserves[0], poolInfo.reserves[1]);
    return quote === null ? null : quoteForInput(quote, tokenB.decimals);
  }, [poolInfo, tokenA.decimals, tokenB.decimals]);

  const inversePriceRatio = useMemo(() => {
    if (!poolInfo || poolInfo.reserves[1] === 0n) return null;
    const oneTokenB = 10n ** BigInt(tokenB.decimals);
    const quote = quotePoolAmount(oneTokenB, poolInfo.reserves[1], poolInfo.reserves[0]);
    return quote === null ? null : quoteForInput(quote, tokenA.decimals);
  }, [poolInfo, tokenA.decimals, tokenB.decimals]);

  const estimatedNewPoolShare = useMemo(() => {
    if (mode !== "add" || !amountA || !amountB) return null;
    try {
      const parsedA = parseUnits(amountA, tokenA.decimals);
      if (parsedA <= 0n) return null;
      if (!poolInfo || poolInfo.reserves[0] === 0n || poolInfo.totalSupply === 0n) {
        return "100.00";
      }
      const mintedLp = (parsedA * poolInfo.totalSupply) / poolInfo.reserves[0];
      return formatPercentage(mintedLp, poolInfo.totalSupply + mintedLp, 2);
    } catch {
      return null;
    }
  }, [mode, amountA, amountB, tokenA.decimals, poolInfo]);

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
          setAmountB(quoteForInput(quoted, tokenB.decimals));
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
          setAmountA(quoteForInput(quoted, tokenA.decimals));
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

  const handleRemovePercentage = useCallback(
    (pct: number) => {
      if (!poolInfo || poolInfo.userLpBalance <= 0n) return;
      const portion =
        pct === 100 ? poolInfo.userLpBalance : (poolInfo.userLpBalance * BigInt(pct)) / 100n;
      setLpTokenAmount(formatUnits(portion, 18));
    },
    [poolInfo]
  );

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

  const removeAmounts = useMemo(() => {
    if (mode !== "remove" || !lpTokenAmount || !poolInfo) return null;

    try {
      const lpAmount = parseUnits(lpTokenAmount, 18);
      if (lpAmount <= 0n || lpAmount > poolInfo.totalSupply) return null;

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

  const amountsValid =
    isPositiveAmount(amountA, tokenA.decimals) && isPositiveAmount(amountB, tokenB.decimals);

  const handleAddLiquidity = useCallback(async () => {
    if (!userAddress) return;
    if (!isPositiveAmount(amountA, tokenA.decimals) || !isPositiveAmount(amountB, tokenB.decimals)) {
      toast.error("Enter an amount above zero for both tokens.");
      return;
    }
    if (!isMainnet) {
      toast.error(
        "Switch to Base or Ethereum mainnet before managing this Uniswap V2 liquidity position."
      );
      return;
    }
    if (
      resolveAddress(tokenA, chainId).toLowerCase() ===
      resolveAddress(tokenB, chainId).toLowerCase()
    ) {
      toast.error("A pool must contain two different assets.");
      return;
    }

    try {
      setLastV2TxHash(null);
      const amountADesired = parseUnits(amountA, tokenA.decimals);
      const amountBDesired = parseUnits(amountB, tokenB.decimals);
      const amountAMin = applySlippageFloor(amountADesired);
      const amountBMin = applySlippageFloor(amountBDesired);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900); // 15 min

      if (!isNative(tokenA.address) && publicClient) {
        const approvals = await approvalSequence(publicClient, {
          token: tokenA.address,
          owner: userAddress,
          spender: routerAddress,
          amount: amountADesired,
        });
        for (const value of approvals) {
          const approvalHash = await approveA({
            address: tokenA.address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [routerAddress, value],
            chainId,
          });
          await waitForConfirmation(approvalHash);
        }
      }

      if (!isNative(tokenB.address) && publicClient) {
        const approvals = await approvalSequence(publicClient, {
          token: tokenB.address,
          owner: userAddress,
          spender: routerAddress,
          amount: amountBDesired,
        });
        for (const value of approvals) {
          const approvalHash = await approveB({
            address: tokenB.address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [routerAddress, value],
            chainId,
          });
          await waitForConfirmation(approvalHash);
        }
      }

      const simClient = publicClient as { simulateContract?: (req: unknown) => Promise<unknown> } | undefined;
      let liquidityHash: Hash;
      if (isNative(tokenA.address)) {
        const callArgs = {
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "addLiquidityETH" as const,
          args: [
            resolveAddress(tokenB, chainId),
            amountBDesired,
            amountBMin,
            amountAMin,
            userAddress,
            deadline,
          ] as const,
          value: amountADesired,
        };
        if (simClient && typeof simClient.simulateContract === "function") {
          await simClient.simulateContract({ ...callArgs, account: userAddress });
        }
        liquidityHash = await addLiq({ ...callArgs, chainId });
      } else if (isNative(tokenB.address)) {
        const callArgs = {
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "addLiquidityETH" as const,
          args: [
            resolveAddress(tokenA, chainId),
            amountADesired,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ] as const,
          value: amountBDesired,
        };
        if (simClient && typeof simClient.simulateContract === "function") {
          await simClient.simulateContract({ ...callArgs, account: userAddress });
        }
        liquidityHash = await addLiq({ ...callArgs, chainId });
      } else {
        const callArgs = {
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "addLiquidity" as const,
          args: [
            tokenA.address,
            tokenB.address,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ] as const,
        };
        if (simClient && typeof simClient.simulateContract === "function") {
          await simClient.simulateContract({ ...callArgs, account: userAddress });
        }
        liquidityHash = await addLiq({ ...callArgs, chainId });
      }
      setLastV2TxHash(liquidityHash);
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
      toast.error(extractTxErrorMessage(error, "Failed to add liquidity"));
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
    applySlippageFloor,
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
      toast.error(
        "Switch to Base or Ethereum mainnet before managing this Uniswap V2 liquidity position."
      );
      return;
    }
    if (!removeAmounts) {
      toast.error("Enter a valid LP-token amount that does not exceed the pool supply.");
      return;
    }

    try {
      setLastV2TxHash(null);
      const liquidity = parseUnits(lpTokenAmount, 18);
      if (!poolInfo || liquidity > poolInfo.userLpBalance) {
        toast.error("The requested LP-token amount exceeds your available balance.");
        return;
      }
      const amountAMin = applySlippageFloor(removeAmounts.amountA);
      const amountBMin = applySlippageFloor(removeAmounts.amountB);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);

      // Only submit LP approval when existing allowance is insufficient
      if (publicClient) {
        const approvals = await approvalSequence(publicClient, {
          token: pairAddress as Address,
          owner: userAddress,
          spender: routerAddress,
          amount: liquidity,
        });
        for (const value of approvals) {
          const approvalHash = await approveA({
            address: pairAddress as Address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [routerAddress, value],
            chainId,
          });
          await waitForConfirmation(approvalHash);
        }
      } else {
        const approvalHash = await approveA({
          address: pairAddress as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [routerAddress, liquidity],
          chainId,
        });
        await waitForConfirmation(approvalHash);
      }

      const simClient = publicClient as { simulateContract?: (req: unknown) => Promise<unknown> } | undefined;
      let removeHash: Hash;
      if (isNative(tokenA.address)) {
        const callArgs = {
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "removeLiquidityETH" as const,
          args: [
            resolveAddress(tokenB, chainId),
            liquidity,
            amountBMin,
            amountAMin,
            userAddress,
            deadline,
          ] as const,
        };
        if (simClient && typeof simClient.simulateContract === "function") {
          await simClient.simulateContract({ ...callArgs, account: userAddress });
        }
        removeHash = await removeLiq({ ...callArgs, chainId });
      } else if (isNative(tokenB.address)) {
        const callArgs = {
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "removeLiquidityETH" as const,
          args: [
            resolveAddress(tokenA, chainId),
            liquidity,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ] as const,
        };
        if (simClient && typeof simClient.simulateContract === "function") {
          await simClient.simulateContract({ ...callArgs, account: userAddress });
        }
        removeHash = await removeLiq({ ...callArgs, chainId });
      } else {
        const callArgs = {
          address: routerAddress,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "removeLiquidity" as const,
          args: [
            tokenA.address,
            tokenB.address,
            liquidity,
            amountAMin,
            amountBMin,
            userAddress,
            deadline,
          ] as const,
        };
        if (simClient && typeof simClient.simulateContract === "function") {
          await simClient.simulateContract({ ...callArgs, account: userAddress });
        }
        removeHash = await removeLiq({ ...callArgs, chainId });
      }
      setLastV2TxHash(removeHash);
      await waitForConfirmation(removeHash);

      toast.success("Liquidity removed successfully!");
      setLpTokenAmount("");
      void refetchReserves();
      void refetchTotalSupply();
      void refetchUserLpBalance();
      void refetchBalanceA();
      void refetchBalanceB();
    } catch (error) {
      toast.error(extractTxErrorMessage(error, "Failed to remove liquidity"));
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
    publicClient,
    applySlippageFloor,
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
    <div className="mx-auto max-w-7xl min-h-[calc(100vh-80px)] space-y-6 p-4 md:p-8">
      {/* ── Flagship Header & Live Network Telemetry Bar ─────────────────────── */}
      <div className="rounded-2xl border border-indigo-100/90 bg-gradient-to-r from-white via-indigo-50/30 to-cyan-50/30 p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-3xl font-black text-transparent">
                <Droplet className="size-8 text-blue-600" />
                Liquidity Pools
              </h1>
              <Badge className="border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-800">
                0% Frontend LP Fee
              </Badge>
              <Badge variant="outline" className="border-indigo-200 bg-white text-[11px] text-indigo-800">
                {chainId === 1 ? "Ethereum Mainnet" : "Base Mainnet"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Supply concentrated Uniswap V3 liquidity, migrate legacy V2 LP, or lock NFTs in the
              non-custodial Sovereign Timelock while retaining 100% of swap fees.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {telemetry.block !== null && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">
                <Activity className="size-3.5 text-emerald-600" />
                <span className="font-mono font-semibold">#{telemetry.block.toString()}</span>
                {telemetry.gwei && (
                  <>
                    <span className="text-slate-300">·</span>
                    <Fuel className="size-3.5 text-indigo-600" />
                    <span className="font-mono">{telemetry.gwei} Gwei</span>
                  </>
                )}
              </div>
            )}
            <Link
              to="/stake"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 text-xs font-bold text-purple-900 transition hover:bg-purple-100"
            >
              <Sparkles className="size-3.5 text-purple-700" />
              Stake LP for $MRWD
            </Link>
            <Link
              to="/swap"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              <ArrowLeftRight className="size-3.5" />
              Swap Tokens
            </Link>
            {!isConnected && (
              <Button
                type="button"
                size="sm"
                onClick={openWalletConnect}
                className="h-8 bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Wallet className="mr-1.5 size-3.5" />
                Connect Wallet
              </Button>
            )}
          </div>
        </div>

        {/* Featured Base Pools Quick-Select Strip */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED_BASE_POOLS.map((pool) => {
            const isSelected =
              selectedV3PairId === pool.id &&
              (protocolVersion === "migrate" || protocolVersion === "v3");
            return (
              <button
                key={pool.id}
                type="button"
                onClick={() => handleFeaturedPoolClick(pool)}
                className={`group flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/15"
                    : "border-slate-200/90 bg-white/90 hover:border-indigo-300 hover:shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">
                    {pool.title}
                  </span>
                  <span className="rounded-full bg-indigo-100/80 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                    {pool.badge}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{pool.highlight}</p>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[10px] font-semibold text-slate-600">
                  <span className="font-mono">{pool.feeLabel}</span>
                  <span className="text-indigo-600 group-hover:underline">Select Pool →</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Protocol Version Tabs (With Proper ARIA TabsContent Panels) ──────── */}
      <Tabs
        value={protocolVersion}
        onValueChange={(val) => {
          const next = val as ProtocolVersion;
          versionFromLink.current = true;
          setProtocolVersion(next);
          syncUrlParams(next, mode, selectedV3PairId);
        }}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-white p-3 shadow-xs">
          <TabsList className="grid w-full grid-cols-3 border bg-slate-100/80 p-1 sm:w-auto">
            <TabsTrigger
              value="migrate"
              className="font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white"
            >
              <Sparkles className="mr-1.5 size-4" /> V2 ➔ V3 Migration
            </TabsTrigger>
            <TabsTrigger
              value="v3"
              className="font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
            >
              <Layers className="mr-1.5 size-4" /> Uniswap V3
            </TabsTrigger>
            <TabsTrigger
              value="v2"
              className="font-semibold data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Droplet className="mr-1.5 size-4" /> Uniswap V2 (Classic)
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-emerald-600" />
            {protocolVersion === "migrate" &&
              "Withdraw legacy V2 LP & supply into Uniswap V3 with auto-synced pool ratios"}
            {protocolVersion === "v3" &&
              "Manage concentrated NFT positions, collect fees & supply new Base V3 pools"}
            {protocolVersion === "v2" && "Classic 50/50 constant-product pools on Base & Ethereum"}
          </div>
        </div>

        <TabsContent value="migrate" className="mt-0 space-y-6">
          {baseOnlyNotice}
          <V2ToV3MigrationWizard
            externalPairId={selectedV3PairId}
            onPairChange={(pairId) => {
              setSelectedV3PairId(pairId);
              syncUrlParams("migrate", mode, pairId);
            }}
          />
          <V3LiquidityManager />
        </TabsContent>

        <TabsContent value="v3" className="mt-0 space-y-6">
          {baseOnlyNotice}
          <V3LiquidityManager />
          <V2ToV3MigrationWizard
            externalPairId={selectedV3PairId}
            onPairChange={(pairId) => {
              setSelectedV3PairId(pairId);
              syncUrlParams("v3", mode, pairId);
            }}
          />
        </TabsContent>

        <TabsContent value="v2" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left: Pool Stats */}
            <div className="space-y-4 lg:col-span-1">
              {poolExists && poolInfo ? (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-gray-600">
                          Your V2 Position
                        </CardTitle>
                        <a
                          href={`${explorerBaseUrl(chainId)}/address/${pairAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-xs text-blue-600 hover:underline"
                        >
                          Pair Contract <ExternalLink className="ml-1 size-3" />
                        </a>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-500">LP Tokens</p>
                        <p
                          className="font-mono text-2xl font-bold"
                          title={formatUnits(poolInfo.userLpBalance, 18)}
                        >
                          {formatReadableUnits(poolInfo.userLpBalance, 18, 6)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Pool Share</p>
                        <p className="text-xl font-bold text-blue-600">{poolInfo.poolShare}%</p>
                      </div>
                      <div className="border-t pt-2">
                        <p className="mb-1 text-xs text-gray-500">{tokenA.symbol} Balance</p>
                        <p className="font-mono font-medium">
                          {balanceA ? formatReadableUnits(balanceA.value, tokenA.decimals, 5) : "0"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-gray-500">{tokenB.symbol} Balance</p>
                        <p className="font-mono font-medium">
                          {balanceB ? formatReadableUnits(balanceB.value, tokenB.decimals, 5) : "0"}
                        </p>
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
                        <span
                          className="font-mono font-medium"
                          title={formatUnits(poolInfo.reserves[0], tokenA.decimals)}
                        >
                          {formatReadableUnits(poolInfo.reserves[0], tokenA.decimals, 4)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">{tokenB.symbol} Reserve</span>
                        <span
                          className="font-mono font-medium"
                          title={formatUnits(poolInfo.reserves[1], tokenB.decimals)}
                        >
                          {formatReadableUnits(poolInfo.reserves[1], tokenB.decimals, 4)}
                        </span>
                      </div>
                      {priceRatio && (
                        <div className="space-y-1 border-t pt-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Spot Rate</span>
                            <span className="font-mono font-medium">
                              1 {tokenA.symbol} = {priceRatio} {tokenB.symbol}
                            </span>
                          </div>
                          {inversePriceRatio && (
                            <div className="flex justify-between text-gray-500">
                              <span>Inverse Rate</span>
                              <span className="font-mono">
                                1 {tokenB.symbol} = {inversePriceRatio} {tokenA.symbol}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-2 text-xs text-gray-500">
                        <span>LP Swap Fee</span>
                        <span className="font-semibold text-emerald-700">0.30% to LPs</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {poolExists === false
                      ? `No Uniswap V2 pool exists yet for ${tokenA.symbol} / ${tokenB.symbol}. Adding liquidity will initialize the pair at your deposit ratio (or switch to Uniswap V3 for active concentrated pools).`
                      : "Select tokens to view live on-chain pool reserves."}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Right: Add/Remove Interface */}
            <div className="lg:col-span-2">
              <Card className="border-2 border-blue-200/80 shadow-xs">
                <CardContent className="p-6">
                  <Tabs
                    value={mode}
                    onValueChange={(v) => {
                      const nextMode = v as LiquidityMode;
                      setMode(nextMode);
                      syncUrlParams("v2", nextMode, selectedV3PairId);
                    }}
                    className="space-y-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <TabsList className="grid w-full grid-cols-2 sm:w-80">
                        <TabsTrigger value="add">
                          <Plus className="mr-1 size-4" />
                          Add Liquidity
                        </TabsTrigger>
                        <TabsTrigger value="remove">
                          <Minus className="mr-1 size-4" />
                          Remove Liquidity
                        </TabsTrigger>
                      </TabsList>

                      {/* Configurable Slippage Tolerance */}
                      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
                        <span className="text-slate-500">Max Slippage:</span>
                        {SLIPPAGE_PRESETS_BPS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setSlippageBps(preset.bps)}
                            className={`rounded px-2 py-0.5 font-semibold transition ${
                              slippageBps === preset.bps
                                ? "bg-blue-600 text-white"
                                : "text-slate-600 hover:bg-slate-200/70"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <TabsContent value="add" className="mt-0 space-y-4">
                      {/* Token A */}
                      <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                        <Label htmlFor="v2-amount-a" className="text-xs font-semibold text-slate-700">
                          First Token
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="v2-amount-a"
                            type="number"
                            inputMode="decimal"
                            placeholder="0.0"
                            value={amountA}
                            onChange={(e) => handleAmountAChange(e.target.value)}
                            className={`flex-1 bg-white font-mono ${isInsufficientA ? "border-red-500" : ""}`}
                          />
                          <Select value={tokenA.symbol} onValueChange={handleSelectTokenA}>
                            <SelectTrigger className="w-36 bg-white font-semibold">
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
                            Balance:{" "}
                            {balanceA
                              ? formatReadableUnits(balanceA.value, tokenA.decimals, 5)
                              : "0"}
                          </span>
                          {balanceA && balanceA.value > 0n && (
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
                        <button
                          type="button"
                          onClick={handleFlipV2Tokens}
                          aria-label="Flip token order"
                          className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-2xs transition hover:border-blue-300 hover:text-blue-600"
                        >
                          <ArrowUpDown className="size-4" />
                        </button>
                      </div>

                      {/* Token B */}
                      <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                        <Label htmlFor="v2-amount-b" className="text-xs font-semibold text-slate-700">
                          Second Token
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="v2-amount-b"
                            type="number"
                            inputMode="decimal"
                            placeholder="0.0"
                            value={amountB}
                            onChange={(e) => handleAmountBChange(e.target.value)}
                            className={`flex-1 bg-white font-mono ${isInsufficientB ? "border-red-500" : ""}`}
                          />
                          <Select value={tokenB.symbol} onValueChange={handleSelectTokenB}>
                            <SelectTrigger className="w-36 bg-white font-semibold">
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
                            Balance:{" "}
                            {balanceB
                              ? formatReadableUnits(balanceB.value, tokenB.decimals, 5)
                              : "0"}
                            {poolInfo && " (auto-synced to pool ratio)"}
                          </span>
                          {balanceB && balanceB.value > 0n && (
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

                      {estimatedNewPoolShare && amountsValid && (
                        <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
                          <span>Estimated Share of Pool</span>
                          <span className="font-mono font-bold">{estimatedNewPoolShare}%</span>
                        </div>
                      )}

                      <Button
                        className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 font-bold"
                        onClick={handleAddLiquidity}
                        disabled={
                          !amountsValid ||
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
                    </TabsContent>

                    <TabsContent value="remove" className="mt-0 space-y-4">
                      <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="v2-remove-lp"
                            className="text-xs font-semibold text-slate-700"
                          >
                            LP Tokens to Remove
                          </Label>
                          {poolInfo && poolInfo.userLpBalance > 0n && (
                            <div className="flex items-center gap-1">
                              {REMOVE_PERCENT_PRESETS.map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => handleRemovePercentage(pct)}
                                  className="rounded border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                                >
                                  {pct === 100 ? "MAX" : `${pct}%`}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Input
                          id="v2-remove-lp"
                          type="number"
                          inputMode="decimal"
                          placeholder="0.0"
                          value={lpTokenAmount}
                          onChange={(e) => setLpTokenAmount(e.target.value)}
                          className="bg-white font-mono"
                        />
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>
                            Available:{" "}
                            {poolInfo ? formatReadableUnits(poolInfo.userLpBalance, 18, 6) : "0"} LP
                          </span>
                        </div>
                      </div>

                      {removeAmounts && (
                        <Alert className="border-blue-200 bg-blue-50">
                          <AlertDescription>
                            <p className="mb-1.5 text-xs font-semibold text-blue-950">
                              Estimated Tokens Returned (before {Number(slippageBps) / 100}% max
                              slippage guard):
                            </p>
                            <p className="font-mono text-sm">
                              • {formatReadableUnits(removeAmounts.amountA, tokenA.decimals, 6)}{" "}
                              {tokenA.symbol}
                            </p>
                            <p className="font-mono text-sm">
                              • {formatReadableUnits(removeAmounts.amountB, tokenB.decimals, 6)}{" "}
                              {tokenB.symbol}
                            </p>
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 font-bold"
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
                    </TabsContent>
                  </Tabs>

                  {lastV2TxHash && (
                    <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <span>Last V2 liquidity transaction submitted</span>
                      <a
                        href={`${explorerBaseUrl(chainId)}/tx/${lastV2TxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center font-semibold underline"
                      >
                        View Explorer <ExternalLink className="ml-1 size-3" />
                      </a>
                    </div>
                  )}

                  {!isConnected && (
                    <Alert className="mt-4">
                      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>Connect your wallet to add or remove liquidity</span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={openWalletConnect}
                          className="bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <Wallet className="mr-1.5 size-3.5" />
                          Connect Wallet
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {isConnected && !isSupportedChain && (
                    <Alert className="mt-4 border-blue-300 bg-blue-50 text-blue-900">
                      <AlertDescription className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-blue-950">Switch network</p>
                          <p className="text-xs text-blue-800">
                            Classic V2 liquidity here works on Base and Ethereum. You are currently
                            on {chain?.name || `Chain ${chainId}`}.
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
        </TabsContent>
      </Tabs>

      {/* ── Sovereign V3 Liquidity Locker ────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Lock className="size-3.5 text-indigo-600" />
          <span>Non-Custodial Liquidity Security</span>
        </div>
        {protocolVersion === "v2" && baseOnlyNotice}
        <LpLockCard />
      </div>
    </div>
  );
}
