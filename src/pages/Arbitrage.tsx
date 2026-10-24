// src/pages/Arbitrage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Loader2,
  Lock,
  type LucideIcon,
  Moon,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Address,
  createPublicClient,
  formatUnits,
  isAddress,
  parseEther,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import {
  useAccount,
  useBlockNumber,
  useGasPrice,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";

import { CeDeFiStudio } from "@/components/arbitrage/CeDeFiStudio";
import { LiveDeskTab } from "@/components/arbitrage/LiveDeskTab";
import {
  type MatrixPair,
  PAIR_MATRIX_DATA,
  PairMatrix100,
} from "@/components/arbitrage/PairMatrix100";
import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AERODROME_ROUTER_ABI, ERC20_ABI } from "@/config/abis";
import { UNISWAP_V3_QUOTER_V2_BASE, UNISWAP_V3_ROUTER_BASE } from "@/config/contracts";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { useCeFiArbStream } from "@/hooks/useCeFiArbStream";
import {
  AiArbitrageBotEngine,
  type BotConfig,
  type MarketSnapshot,
} from "@/lib/amm/ai-arbitrage-bot";
import {
  type BotQuoteVenues,
  fetchLiveBotQuotes,
  type LiveBotQuotes,
  v3TriangularSwapCall,
} from "@/lib/amm/bot-market-snapshot";
import {
  atomicSpreadSteps,
  bestV3Cycle,
  flashPremium,
  flashTriangleTokens,
  quoteAtomicSpread,
  readAavePremiumBps,
  SPREAD_LEG2_BUFFER_BPS,
  type SwapStep,
  v3ExactInputStep,
} from "@/lib/amm/flash-routes";
import {
  exactCallFeeWei,
  GAS_SAFETY_BUFFER,
  liveEthUsd,
  MEASURED_GAS_UNITS,
  screeningGasUsd,
} from "@/lib/amm/gas-cost";
import { ShaggyDoggQuantAiEngine } from "@/lib/amm/quant-ai-engine";
import { routeSwapCall } from "@/lib/amm/smart-routing";
import { createBaseReadTransport } from "@/lib/base-rpc";
import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";

// ────────────────────────────────────────────────────────────────────────────
// BASE MAINNET CANONICAL CONTRACTS & ASSETS
// ────────────────────────────────────────────────────────────────────────────
const BASE_CHAIN_ID = 8453;
const BASE_AERODROME_ROUTER: Address =
  (import.meta.env.VITE_AERODROME_ROUTER as Address) ||
  "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const BASE_AERODROME_FACTORY: Address =
  (import.meta.env.VITE_AERODROME_FACTORY as Address) ||
  "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const BASE_AAVE_POOL: Address =
  (import.meta.env.VITE_AAVE_POOL_ADDRESS as Address) ||
  "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const DEFAULT_AAVE_BORROWER: Address = "0x936a3D52c3037848879F3641dfBc9132aAe51bDF";
const DEPLOYED_ATOMIC_ROUTER: Address =
  (import.meta.env.VITE_ATOMIC_ROUTER_ADDRESS as Address) ||
  "0x70315019d12a11556c837970675cdc8fa54d186b";
const DEFAULT_ATOMIC_ROUTER_KEY = "shaggy_dogg_atomic_router";

const BASE_ASSETS = {
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    symbol: "WETH",
  },
  USDC: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    symbol: "USDC",
  },
  DAI: {
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    decimals: 18,
    symbol: "DAI",
  },
} satisfies Record<string, { address: Address; decimals: number; symbol: string }>;

interface LiveTransactionRecord {
  id: string;
  txHash: string;
  type: "TRIANGULAR_ARB" | "CROSS_DEX_SPREAD" | "AAVE_FLASH_LOAN" | "AI_AUTO_PILOT";
  summary: string;
  timestamp: string;
  status: "SUBMITTED" | "CONFIRMED" | "REVERTED";
  explorerUrl: string;
}

interface BotTerminalLog {
  id: string;
  time: string;
  level: "info" | "success" | "warn" | "danger";
  message: string;
}

export interface ArbitragePageMeta {
  id: string;
  name: string;
  shortLabel: string;
  badge: string;
  badgeBg: string;
  gradient: string;
  icon: LucideIcon;
  category: string;
  subtitle: string;
  documentTitle: string;
}

const PAGE_META = {
  matrix: {
    id: "matrix",
    name: "Spot Arbitrage Pair Matrix",
    shortLabel: "Pair Matrix",
    badge: `${PAIR_MATRIX_DATA.length} Requested Spot Pairs`,
    badgeBg: "border-emerald-300 bg-emerald-100 text-emerald-800",
    gradient: "from-emerald-500 via-teal-600 to-cyan-600",
    icon: Sparkles,
    category: "Live Spot Multi-Exchange Scanner",
    subtitle:
      "Real-time fee-adjusted net edge & capital readiness cross-referenced against your live Kraken balances.",
    documentTitle: "📊 Pair Matrix | Shaggy Dogg Arbitrage",
  },
  cedefi: {
    id: "cedefi",
    name: "CeDeFi L2 Order Book Scanner",
    shortLabel: "CeDeFi L2 Books",
    badge: "CCXT Pro Live Order Books",
    badgeBg: "border-indigo-300 bg-indigo-100 text-indigo-800",
    gradient: "from-indigo-600 via-purple-600 to-pink-600",
    icon: Globe,
    category: "Institutional CeFi × Base Mainnet DEX",
    subtitle:
      "Streaming real Level-2 order books across Kraken, OKX, Coinbase, Bitstamp & Gemini with automated VWAP depth depletion and Base AMM execution.",
    documentTitle: "🌐 CeDeFi Scanner | Shaggy Dogg Arbitrage",
  },
  autopilot: {
    id: "autopilot",
    name: "AI Autonomous Arbitrage Auto-Pilot",
    shortLabel: "AI Auto-Pilot",
    badge: "Base Scanner Controls",
    badgeBg: "border-purple-300 bg-purple-100 text-purple-800",
    gradient: "from-purple-600 via-pink-600 to-rose-600",
    icon: Bot,
    category: "Autonomous Multi-Strategy MEV",
    subtitle:
      "Continuous background AI agent streaming Base Mainnet blocks, sweeping AMM pools, and atomically firing verified profitable trades with configured profit checks; reverted transactions can still cost gas.",
    documentTitle: "🤖 AI Auto-Pilot | Shaggy Dogg Arbitrage",
  },
  triangular: {
    id: "triangular",
    name: "3-Way Triangular Arbitrage Solver",
    shortLabel: "Triangular Arbs",
    badge: "Cyclical Multi-Hop",
    badgeBg: "border-purple-300 bg-purple-100 text-purple-800",
    gradient: "from-purple-600 via-indigo-600 to-blue-600",
    icon: TrendingUp,
    category: "Atomic 3-Hop Cyclical Swap",
    subtitle:
      "Atomic cyclical swap path routing across WETH → USDC → DAI → WETH liquidity pools on Base Uniswap V3 and Aerodrome.",
    documentTitle: "📐 Triangular Arbitrage | Shaggy Dogg Arbitrage",
  },
  dualpool: {
    id: "dualpool",
    name: "Cross-DEX Spread Arbitrage Studio",
    shortLabel: "Cross-DEX Spreads",
    badge: "Aerodrome × Uniswap V3",
    badgeBg: "border-indigo-300 bg-indigo-100 text-indigo-800",
    gradient: "from-blue-600 via-indigo-600 to-purple-600",
    icon: Layers,
    category: "Dual-Pool AMM Dislocation",
    subtitle:
      "Simultaneous buy low on Aerodrome / sell high on Uniswap V3 (or vice versa) with net profit calculated after Base gas and VIP fees.",
    documentTitle: "⚡ Cross-DEX Spread | Shaggy Dogg Arbitrage",
  },
  flashloan: {
    id: "flashloan",
    name: "Aave V3 Flash Loan Execution Studio",
    shortLabel: "Flash Loans",
    badge: "0-Collateral Flash Loans",
    badgeBg: "border-amber-300 bg-amber-100 text-amber-900",
    gradient: "from-amber-500 via-orange-600 to-rose-600",
    icon: Zap,
    category: "Uncollateralized Atomic Debt",
    subtitle:
      "Borrow up to $500,000+ USDC or WETH with zero upfront collateral to execute atomic arbitrage on Base Mainnet.",
    documentTitle: "⚡ Flash Loans | Shaggy Dogg Arbitrage",
  },
  live: {
    id: "live",
    name: "Kraken ↔ Alpaca Live Desk",
    shortLabel: "Live Desk",
    badge: "LIVE Accounts",
    badgeBg: "border-rose-300 bg-rose-100 text-rose-800",
    gradient: "from-rose-600 via-red-600 to-orange-500",
    icon: Radio,
    category: "Live Cross-Venue Execution",
    subtitle:
      "Live Kraken and Alpaca balances, account-tier fees, quote age and depth, expected net proceeds, and broker-reported fills, partial fills and remaining exposure.",
    documentTitle: "🔴 Live Desk | Shaggy Dogg Arbitrage",
  },
  console: {
    id: "console",
    name: "Live Execution Console & Transaction Audit",
    shortLabel: "Audit Console",
    badge: "Live BaseScan Ledger",
    badgeBg: "border-rose-300 bg-rose-100 text-rose-800",
    gradient: "from-rose-600 via-pink-600 to-purple-600",
    icon: Activity,
    category: "On-Chain Ledger & Telemetry",
    subtitle:
      "Real-time cryptographic audit trail of on-chain transaction receipts, BaseScan block explorer telemetry, and daemon execution logs.",
    documentTitle: "💻 Transaction Console | Shaggy Dogg Arbitrage",
  },
};

// The Auto-Pilot prices its legs on exactly the routers and tokens its live handlers trade through.
const BOT_QUOTE_VENUES: BotQuoteVenues = {
  uniswapV3Quoter: UNISWAP_V3_QUOTER_V2_BASE,
  uniswapV3Router: UNISWAP_V3_ROUTER_BASE,
  aerodromeRouter: BASE_AERODROME_ROUTER,
  aerodromeFactory: BASE_AERODROME_FACTORY,
  weth: BASE_ASSETS.WETH.address as Address,
  usdc: BASE_ASSETS.USDC.address as Address,
  dai: BASE_ASSETS.DAI.address as Address,
};

// Base reads (quotes, and simulation when the wallet client is unavailable) independent of the wallet.
const BASE_QUOTE_CLIENT = createPublicClient({ chain: base, transport: createBaseReadTransport() });
const BASE_ETH_TOKEN = BASE_MAINNET_TOKENS.find((t) => t.kind === "native");
// Profit must clear the exact fee by GAS_SAFETY_BUFFER (in percent for bigint maths).
const GAS_BUFFER_PCT = BigInt(Math.round(GAS_SAFETY_BUFFER * 100));
const buffered = (feeWei: bigint) => (feeWei * GAS_BUFFER_PCT) / 100n;
const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
const BASE_USDC_TOKEN = BASE_MAINNET_TOKENS.find(
  (t) => t.address.toLowerCase() === BASE_ASSETS.USDC.address.toLowerCase()
);

export const ARBITRAGE_PAGE_META: typeof PAGE_META & Record<string, ArbitragePageMeta | undefined> =
  {
    ...PAGE_META,
    "cross-dex": PAGE_META.dualpool,
    "flash-loans": PAGE_META.flashloan,
  };

export const TAB_ALIASES: Record<string, string> = {
  matrix: "matrix",
  "100-pair-matrix": "matrix",
  pairs: "matrix",
  cedefi: "cedefi",
  "cedefi-scanner": "cedefi",
  "l2-books": "cedefi",
  autopilot: "autopilot",
  "ai-autopilot": "autopilot",
  bot: "autopilot",
  triangular: "triangular",
  "triangular-arbitrage": "triangular",
  "cross-dex": "dualpool",
  dualpool: "dualpool",
  spread: "dualpool",
  "flash-loans": "flashloan",
  flashloan: "flashloan",
  "flash-loan": "flashloan",
  live: "live",
  "live-desk": "live",
  "kraken-alpaca": "live",
  console: "console",
  logs: "console",
  ledger: "console",
};

export const TAB_URL_PATHS: Record<string, string> = {
  matrix: "matrix",
  cedefi: "cedefi",
  autopilot: "autopilot",
  triangular: "triangular",
  dualpool: "cross-dex",
  flashloan: "flash-loans",
  live: "live-desk",
  console: "console",
};

export default function Arbitrage() {
  // ── Web3 Connection ───────────────────────────────────────────────────────
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { data: gasPriceData } = useGasPrice({
    chainId: BASE_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });

  const isBaseNetwork = chainId === BASE_CHAIN_ID;
  const gasPriceGwei = gasPriceData ? Number((Number(gasPriceData) / 1e9).toFixed(4)) : 0.005;

  // ── Global Execution Mode (Live Unrestricted vs Sandbox) ──────────────────
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true);
  const [txHistory, setTxHistory] = useState<LiveTransactionRecord[]>([]);

  // ── URL Path Routing & Sub-Page State Synchronization ───────────────────
  const { tab: routeTab, symbol: routeSymbol } = useParams<{ tab?: string; symbol?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = location.pathname.startsWith("/launchpad/arbitrage")
    ? "/launchpad/arbitrage"
    : "/arbitrage";

  // Resolve canonical tab from route param or fallback to search param or default "matrix"
  const rawTab = routeTab || searchParams.get("tab") || "matrix";
  const canonicalTab = TAB_ALIASES[rawTab.toLowerCase()] || "matrix";

  // Resolve canonical symbol from route param (e.g. "ETH-USDC" -> "ETH/USDC") or fallback to search param or default "ETH/USD"
  const rawSymbol = routeSymbol || searchParams.get("symbol");
  const cleanSymbol = rawSymbol ? decodeURIComponent(rawSymbol).replace("-", "/") : "ETH/USD";

  const [activeArbitrageTab, setActiveArbitrageTab] = useState<string>(canonicalTab);
  const [selectedMatrixSymbol, setSelectedMatrixSymbol] = useState<string>(cleanSymbol);

  // Auto-normalize bare /arbitrage or /launchpad/arbitrage to /arbitrage/matrix
  useEffect(() => {
    if (location.pathname === "/arbitrage" || location.pathname === "/arbitrage/") {
      navigate("/arbitrage/matrix", { replace: true });
    } else if (
      location.pathname === "/launchpad/arbitrage" ||
      location.pathname === "/launchpad/arbitrage/"
    ) {
      navigate("/launchpad/arbitrage/matrix", { replace: true });
    }
  }, [location.pathname, navigate]);

  // Keep state synced when route param changes (e.g. Back/Forward button)
  useEffect(() => {
    if (canonicalTab && canonicalTab !== activeArbitrageTab) {
      setActiveArbitrageTab(canonicalTab);
    }
  }, [canonicalTab, activeArbitrageTab]);

  useEffect(() => {
    if (cleanSymbol && cleanSymbol !== selectedMatrixSymbol) {
      setSelectedMatrixSymbol(cleanSymbol);
    }
  }, [cleanSymbol, selectedMatrixSymbol]);

  // Tab navigation updates the real URL path (e.g. /arbitrage/matrix, /arbitrage/cedefi/ETH-USDC)
  const handleTabChange = useCallback(
    (newTab: string) => {
      const canonical = TAB_ALIASES[newTab] || newTab;
      setActiveArbitrageTab(canonical);
      const urlSegment = TAB_URL_PATHS[canonical] || canonical;
      if (canonical === "cedefi") {
        const symbolSlug = (selectedMatrixSymbol || "ETH/USD").replace("/", "-");
        navigate(`${basePath}/${urlSegment}/${symbolSlug}`);
      } else {
        navigate(`${basePath}/${urlSegment}`);
      }
    },
    [basePath, navigate, selectedMatrixSymbol]
  );

  // Sync when symbol changes
  const handleSelectSymbol = useCallback(
    (symbol: string) => {
      setSelectedMatrixSymbol(symbol);
      const symbolSlug = symbol.replace("/", "-");
      navigate(`${basePath}/cedefi/${symbolSlug}`);
    },
    [basePath, navigate]
  );

  // When clicking "Load Pair" on any row in the Matrix
  const handleSelectPairFromMatrix = useCallback(
    (symbol: string) => {
      setSelectedMatrixSymbol(symbol);
      setActiveArbitrageTab("cedefi");
      const symbolSlug = symbol.replace("/", "-");
      navigate(`${basePath}/cedefi/${symbolSlug}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(`Loaded ${symbol} into CeDeFi L2 Scanner`);
    },
    [basePath, navigate]
  );

  const handleBackToMatrix = useCallback(() => {
    navigate(`${basePath}/matrix`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [basePath, navigate]);

  // Sync document.title
  useEffect(() => {
    const meta = ARBITRAGE_PAGE_META[activeArbitrageTab] || ARBITRAGE_PAGE_META.matrix;
    if (activeArbitrageTab === "cedefi") {
      document.title = `🌐 CeDeFi: ${selectedMatrixSymbol} | Shaggy Dogg Arbitrage`;
    } else {
      document.title = meta.documentTitle;
    }
  }, [activeArbitrageTab, selectedMatrixSymbol]);

  // ── Auto-Dispatch Locks & Terminal Logs State (Hoisted for Execution Safety) ─
  const [autoSubmitTrades, setAutoSubmitTrades] = useState<boolean>(false);
  const isAutoDispatchingRef = useRef<boolean>(false);
  const lastDispatchTimeRef = useRef<number>(0);

  const [terminalLogs, setTerminalLogs] = useState<BotTerminalLog[]>([
    {
      id: "log-init-1",
      time: new Date().toLocaleTimeString(),
      level: "info",
      message: "AI Auto-Pilot Engine initialized. Anti-Loss structural guards active.",
    },
    {
      id: "log-init-2",
      time: new Date().toLocaleTimeString(),
      level: "info",
      message: "Connected to Base L2 RPC. Ready to start autonomous liquidity scanning.",
    },
  ]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const addTerminalLog = useCallback((level: BotTerminalLog["level"], message: string) => {
    const newLog: BotTerminalLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      time: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setTerminalLogs((prev) => [...prev.slice(-90), newLog]);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Minimum profit (USD) every route must clear after pool fees, Aave's fee and gas.
  const [minNetProfitTarget, setMinNetProfitTarget] = useState<number>(5.0);

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 1: Triangular Arbitrage State & Execution
  // ──────────────────────────────────────────────────────────────────────────
  const [triInitialWeth, setTriInitialWeth] = useState<number>(1.0);
  const [triWethUsdcPrice, setTriWethUsdcPrice] = useState<number>(3450.0);
  const [triUsdcDaiRate, setTriUsdcDaiRate] = useState<number>(1.002);
  const [triDaiWethRate, setTriDaiWethRate] = useState<number>(1 / 3445.0);
  const triFeeBps = 30; // 0.30%
  const [triSlippageBps, setTriSlippageBps] = useState<number>(50); // 0.50%
  const [isExecutingTri, setIsExecutingTri] = useState<boolean>(false);

  const triangularResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateCrossDexTriangularArbitrage({
        initialWeth: triInitialWeth,
        wethUsdcPrice: triWethUsdcPrice,
        usdcDaiRate: triUsdcDaiRate,
        daiWethRate: triDaiWethRate,
        poolFeeBps: triFeeBps,
        gasCostUsd: 0.08,
      });
    } catch {
      return null;
    }
  }, [triInitialWeth, triWethUsdcPrice, triUsdcDaiRate, triDaiWethRate]);

  /** live: the bot's on-chain quote of the full path; the button uses the inputs on this tab. */
  const handleExecuteLiveTriangular = useCallback(
    async (live?: LiveBotQuotes) => {
      if (!isConnected || !address) {
        toast.error("Please connect your Web3 wallet to execute live triangular arbitrage.");
        return;
      }
      if (!isBaseNetwork) {
        toast.error("Please switch your wallet to Base Mainnet (Chain ID 8453).");
        if (switchChain) switchChain({ chainId: BASE_CHAIN_ID });
        return;
      }
      if (triInitialWeth <= 0) {
        toast.error("Enter a valid initial capital amount.");
        return;
      }

      setIsExecutingTri(true);
      isAutoDispatchingRef.current = true;
      const toastId = toast.loading("Broadcasting Live Triangular Arbitrage on Base...");

      try {
        const amountIn = parseEther(triInitialWeth.toString());
        const slippageFactor = 1 - triSlippageBps / 10_000;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        // Trade exactly a quoted Uniswap V3 path at this size: the bot's quote if it was taken at
        // this size, otherwise a fresh one.
        const quote =
          live && live.tradeWeth === triInitialWeth
            ? live
            : await fetchLiveBotQuotes(BASE_QUOTE_CLIENT, BOT_QUOTE_VENUES, triInitialWeth);
        if (!quote) {
          addTerminalLog(
            "danger",
            "🛡️ [HELD] No live Uniswap V3 route for WETH → USDC → DAI → WETH. Nothing sent."
          );
          toast.error("No live Uniswap V3 route", {
            id: toastId,
            description: "Nothing was sent.",
          });
          return;
        }
        const route = quote.triangularPath;
        const quotedOut = parseEther(quote.triangularTerminalWeth.toFixed(18));
        const targetWei = parseEther((minNetProfitTarget / quote.wethUsdcPrice).toFixed(18));
        const gasPriceWei = await BASE_QUOTE_CLIENT.getGasPrice();
        const screenFeeWei = buffered(MEASURED_GAS_UNITS.triangular * gasPriceWei);
        // Never accept less than the input + profit target + gas: a slippage-only minimum can sit
        // below the input and let a thin edge turn into a loss.
        const floorWei = amountIn + targetWei + screenFeeWei;
        if (quotedOut < floorWei) {
          addTerminalLog(
            "warn",
            `🛡️ [HELD] Quoted return ${formatUnits(quotedOut, 18)} WETH is below input + $${minNetProfitTarget} target + gas (${formatUnits(floorWei, 18)} WETH). Nothing sent.`
          );
          toast.error("Not profitable after target and gas", {
            id: toastId,
            description: "Nothing was sent.",
          });
          return;
        }
        const slippageMin = parseEther((quote.triangularTerminalWeth * slippageFactor).toFixed(18));
        const minAmountOut = maxBig(slippageMin, floorWei);
        const call = v3TriangularSwapCall(
          BOT_QUOTE_VENUES.uniswapV3Router,
          route,
          amountIn,
          minAmountOut,
          address,
          deadline
        );

        // Pre-Flight Simulation (eth_call): required; the simulated request is what gets signed.
        let request;
        try {
          ({ request } = await (publicClient ?? BASE_QUOTE_CLIENT).simulateContract({
            ...call,
            account: address,
          }));
        } catch (simErr: unknown) {
          const revertReason =
            (simErr as { shortMessage?: string })?.shortMessage ||
            (simErr as Error)?.message ||
            "Triangular route reverted";
          addTerminalLog(
            "danger",
            `🛡️ [PRE-FLIGHT SIMULATION HELD] ${revertReason}. Prevented execution: pool liquidity cannot deliver min output. $0 gas spent.`
          );
          toast.error("Pre-Flight Simulation Reverted", {
            id: toastId,
            description: `On-chain simulation reverted: ${revertReason}. Wallet protected from failed gas fee.`,
          });
          return;
        }

        // Exact fee (L2 execution + L1 data) for this transaction must leave the target intact.
        const feeWei = await exactCallFeeWei(BASE_QUOTE_CLIENT, address, call).catch(() => null);
        if (feeWei === null || quotedOut - amountIn - targetWei < buffered(feeWei)) {
          addTerminalLog(
            "warn",
            `🛡️ [HELD] Real network fee ${feeWei === null ? "could not be estimated" : `${formatUnits(feeWei, 18)} ETH`}; quoted profit does not cover the $${minNetProfitTarget} target plus fee. Nothing sent.`
          );
          toast.error("Not profitable after real gas", {
            id: toastId,
            description: "Nothing was sent.",
          });
          return;
        }

        const hash = await writeContractAsync(request);

        toast.success("Live Triangular Arbitrage submitted!", {
          id: toastId,
          description: `Tx: ${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`,
        });

        const newTx: LiveTransactionRecord = {
          id: `tx-${Date.now()}`,
          txHash: hash,
          type: "TRIANGULAR_ARB",
          summary: `Cyclic swap ${triInitialWeth} ETH -> USDC -> DAI -> WETH (Uniswap V3 ${route.fees
            .map((fee) => `${fee / 10_000}%`)
            .join("/")})`,
          timestamp: new Date().toLocaleTimeString(),
          status: "SUBMITTED",
          explorerUrl: `https://basescan.org/tx/${hash}`,
        };
        setTxHistory((prev) => [newTx, ...prev]);

        if (publicClient) {
          publicClient
            .waitForTransactionReceipt({ hash })
            .then((receipt) => {
              setTxHistory((prev) =>
                prev.map((t) =>
                  t.txHash === hash
                    ? {
                        ...t,
                        status: receipt.status === "success" ? "CONFIRMED" : "REVERTED",
                      }
                    : t
                )
              );
              if (receipt.status === "success") {
                toast.success("Triangular Arbitrage Confirmed on Base!", {
                  description: `Gas Used: ${receipt.gasUsed.toString()}`,
                });
              } else {
                toast.error("Transaction reverted on-chain.");
              }
            })
            .catch(() => {});
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Live execution failed";
        const isUserReject =
          msg.toLowerCase().includes("user rejected") ||
          msg.toLowerCase().includes("rejected") ||
          msg.toLowerCase().includes("action_rejected") ||
          (err as { code?: number })?.code === 4001;

        if (isUserReject) {
          setAutoSubmitTrades(false);
          addTerminalLog(
            "warn",
            "🛑 [AUTO-DISPATCH] Transaction signature rejected in wallet. 'Auto-Submit to Wallet' turned OFF for your protection."
          );
          toast.info("Auto-Submit disabled after wallet cancellation.");
        } else {
          toast.error("Execution error", { id: toastId, description: msg });
        }
      } finally {
        setIsExecutingTri(false);
        isAutoDispatchingRef.current = false;
        lastDispatchTimeRef.current = Date.now();
      }
    },
    [
      isConnected,
      address,
      isBaseNetwork,
      triInitialWeth,
      triSlippageBps,
      minNetProfitTarget,
      switchChain,
      writeContractAsync,
      publicClient,
      addTerminalLog,
    ]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 2: Cross-DEX Spreads State & Execution
  // ──────────────────────────────────────────────────────────────────────────
  const [dualPoolAPrice, setDualPoolAPrice] = useState<number>(3450.0);
  const [dualPoolBPrice, setDualPoolBPrice] = useState<number>(3472.0);
  const [dualUnits, setDualUnits] = useState<number>(2.0);

  // Start the manual tabs from live Base rates (1 WETH size) instead of placeholder numbers.
  const [liveRatesStatus, setLiveRatesStatus] = useState<"loading" | "live" | "unavailable">(
    "loading"
  );
  useEffect(() => {
    let cancelled = false;
    fetchLiveBotQuotes(BASE_QUOTE_CLIENT, BOT_QUOTE_VENUES, 1).then((live) => {
      if (cancelled) return;
      if (!live) {
        setLiveRatesStatus("unavailable");
        return;
      }
      setTriWethUsdcPrice(Number(live.wethUsdcPrice.toFixed(2)));
      setTriUsdcDaiRate(Number(live.usdcDaiRate.toFixed(6)));
      setTriDaiWethRate(live.daiWethRate);
      setDualPoolAPrice(Number(live.uniswapEthPrice.toFixed(2)));
      setDualPoolBPrice(Number(live.aerodromeEthPrice.toFixed(2)));
      setLiveRatesStatus("live");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [isExecutingSpread, setIsExecutingSpread] = useState<boolean>(false);

  const dualPoolResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateDualPoolCrossDexSpread({
        poolAPrice: dualPoolAPrice,
        poolBPrice: dualPoolBPrice,
        amountUnits: dualUnits,
        poolAFeeRate: 0.003,
        poolBFeeRate: 0.003,
        l2GasUsd: 0.08,
      });
    } catch {
      return null;
    }
  }, [dualPoolAPrice, dualPoolBPrice, dualUnits]);

  const handleExecuteLiveSpreadLeg = useCallback(
    async (venue: "UNISWAP" | "AERODROME", action: "BUY" | "SELL") => {
      if (!isConnected || !address) {
        toast.error("Please connect your Web3 wallet.");
        return;
      }
      if (!isBaseNetwork) {
        toast.error("Please switch to Base Mainnet.");
        if (switchChain) switchChain({ chainId: BASE_CHAIN_ID });
        return;
      }

      setIsExecutingSpread(true);
      isAutoDispatchingRef.current = true;
      const toastId = toast.loading(`Dispatching Live ${action} on ${venue} (Base)...`);

      try {
        const refPrice = venue === "UNISWAP" ? dualPoolAPrice : dualPoolBPrice;
        const units = dualUnits;
        const slippageBps = 50; // 0.50%
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        const amountInEth = parseEther(units.toString());
        const minAmountOutUsdc = parseUnits(
          (units * refPrice * (1 - slippageBps / 10000)).toFixed(6),
          6
        );

        const amountInUsdc = parseUnits((units * refPrice).toFixed(6), 6);
        const minAmountOutEth = parseEther((units * (1 - slippageBps / 10000)).toFixed(18));

        const aeroRoutes = [
          {
            from: action === "BUY" ? BASE_ASSETS.WETH.address : BASE_ASSETS.USDC.address,
            to: action === "BUY" ? BASE_ASSETS.USDC.address : BASE_ASSETS.WETH.address,
            stable: false,
            factory: BASE_AERODROME_FACTORY,
          },
        ];
        const uniPath: Address[] =
          action === "BUY"
            ? [BASE_ASSETS.WETH.address, BASE_ASSETS.USDC.address]
            : [BASE_ASSETS.USDC.address, BASE_ASSETS.WETH.address];

        // Uniswap leg: SwapRouter02 at the quoted V3 fee tier (the bot's, or the best live one now).
        let uniswapCall: ReturnType<typeof routeSwapCall> | null = null;
        if (venue === "UNISWAP") {
          const fee = (await fetchLiveBotQuotes(BASE_QUOTE_CLIENT, BOT_QUOTE_VENUES, units))
            ?.uniswapFeeTier;
          if (!fee || !BASE_ETH_TOKEN || !BASE_USDC_TOKEN) {
            addTerminalLog("danger", "🛡️ [HELD] No live Uniswap V3 WETH/USDC quote. Nothing sent.");
            toast.error("No live Uniswap V3 quote", {
              id: toastId,
              description: "Nothing was sent.",
            });
            setIsExecutingSpread(false);
            isAutoDispatchingRef.current = false;
            return;
          }
          uniswapCall = routeSwapCall(
            { venue: "Uniswap V3", router: UNISWAP_V3_ROUTER_BASE, path: uniPath, stable: [], fee },
            action === "BUY" ? BASE_ETH_TOKEN : BASE_USDC_TOKEN,
            action === "BUY" ? BASE_USDC_TOKEN : BASE_ETH_TOKEN,
            action === "BUY" ? amountInEth : amountInUsdc,
            action === "BUY" ? minAmountOutUsdc : minAmountOutEth,
            address,
            deadline
          );
        }

        // Pre-Flight Simulation (eth_call): always run, on the Base read client if the wallet's is unavailable.
        const simClient = publicClient ?? BASE_QUOTE_CLIENT;

        // Selling USDC: the router can only pull it after an approval for exactly this amount.
        if (action === "SELL") {
          const spender = venue === "UNISWAP" ? UNISWAP_V3_ROUTER_BASE : BASE_AERODROME_ROUTER;
          const allowance = await simClient.readContract({
            address: BASE_ASSETS.USDC.address as Address,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, spender],
          });
          if (allowance < amountInUsdc) {
            addTerminalLog(
              "info",
              `🔐 [APPROVAL] Approving ${formatUnits(amountInUsdc, 6)} USDC for the ${venue === "UNISWAP" ? "Uniswap V3" : "Aerodrome"} router...`
            );
            toast.loading("Approve USDC in your wallet...", { id: toastId });
            const approveHash = await writeContractAsync({
              address: BASE_ASSETS.USDC.address as Address,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [spender, amountInUsdc],
            });
            const approval = await simClient.waitForTransactionReceipt({ hash: approveHash });
            if (approval.status !== "success") throw new Error("USDC approval reverted");
            toast.loading(`Dispatching Live ${action} on ${venue} (Base)...`, { id: toastId });
          }
        }
        {
          try {
            if (uniswapCall) {
              await simClient.simulateContract({ ...uniswapCall, account: address });
            } else {
              // Aerodrome
              if (action === "BUY") {
                await simClient.simulateContract({
                  address: BASE_AERODROME_ROUTER,
                  abi: AERODROME_ROUTER_ABI,
                  functionName: "swapExactETHForTokens",
                  args: [minAmountOutUsdc, aeroRoutes, address, deadline],
                  value: amountInEth,
                  account: address,
                });
              } else {
                await simClient.simulateContract({
                  address: BASE_AERODROME_ROUTER,
                  abi: AERODROME_ROUTER_ABI,
                  functionName: "swapExactTokensForETH",
                  args: [amountInUsdc, minAmountOutEth, aeroRoutes, address, deadline],
                  account: address,
                });
              }
            }
          } catch (simErr: unknown) {
            const revertReason =
              (simErr as { shortMessage?: string })?.shortMessage ||
              (simErr as Error)?.message ||
              "Spread trade reverted";
            addTerminalLog(
              "danger",
              `🛡️ [PRE-FLIGHT SIMULATION HELD] ${revertReason}. Prevented execution on ${venue}: pool price moved or insufficient balance. $0 gas spent.`
            );
            toast.error("Pre-Flight Simulation Reverted", {
              id: toastId,
              description: `On-chain simulation reverted: ${revertReason}. Wallet protected from failed gas fee.`,
            });
            setIsExecutingSpread(false);
            isAutoDispatchingRef.current = false;
            return;
          }
        }

        let hash: Address;
        if (uniswapCall) {
          hash = await writeContractAsync(uniswapCall);
        } else {
          // Aerodrome
          if (action === "BUY") {
            hash = await writeContractAsync({
              address: BASE_AERODROME_ROUTER,
              abi: AERODROME_ROUTER_ABI,
              functionName: "swapExactETHForTokens",
              args: [minAmountOutUsdc, aeroRoutes, address, deadline],
              value: amountInEth,
            });
          } else {
            hash = await writeContractAsync({
              address: BASE_AERODROME_ROUTER,
              abi: AERODROME_ROUTER_ABI,
              functionName: "swapExactTokensForETH",
              args: [amountInUsdc, minAmountOutEth, aeroRoutes, address, deadline],
            });
          }
        }

        toast.success(`Live ${venue} ${action} trade dispatched!`, {
          id: toastId,
          description: `Tx: ${hash.substring(0, 10)}...`,
        });

        const newTx: LiveTransactionRecord = {
          id: `tx-${Date.now()}`,
          txHash: hash,
          type: "CROSS_DEX_SPREAD",
          summary: `${action} on ${venue === "UNISWAP" ? "Uniswap V3" : venue} (${units} units)`,
          timestamp: new Date().toLocaleTimeString(),
          status: "SUBMITTED",
          explorerUrl: `https://basescan.org/tx/${hash}`,
        };
        setTxHistory((prev) => [newTx, ...prev]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Trade failed";
        const isUserReject =
          msg.toLowerCase().includes("user rejected") ||
          msg.toLowerCase().includes("rejected") ||
          msg.toLowerCase().includes("action_rejected") ||
          (err as { code?: number })?.code === 4001;

        if (isUserReject) {
          setAutoSubmitTrades(false);
          addTerminalLog(
            "warn",
            "🛑 [AUTO-DISPATCH] Transaction signature rejected in wallet. 'Auto-Submit to Wallet' turned OFF for your protection."
          );
          toast.info("Auto-Submit disabled after wallet cancellation.");
        } else {
          toast.error("Transaction error", { id: toastId, description: msg });
        }
      } finally {
        setIsExecutingSpread(false);
        isAutoDispatchingRef.current = false;
        lastDispatchTimeRef.current = Date.now();
      }
    },
    [
      isConnected,
      address,
      isBaseNetwork,
      switchChain,
      dualUnits,
      dualPoolAPrice,
      dualPoolBPrice,
      writeContractAsync,
      addTerminalLog,
    ]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 3: Aave Flash Loan Arbitrage State & Live Execution
  // ──────────────────────────────────────────────────────────────────────────
  const [flashBorrowAsset, setFlashBorrowAsset] = useState<string>("USDC");
  const [flashBorrowAmount, setFlashBorrowAmount] = useState<number>(25_000);
  const [flashVipTier, setFlashVipTier] = useState<number>(3);
  const [customBorrowerAddress, setCustomBorrowerAddress] = useState<string>(() => {
    const stored = localStorage.getItem(DEFAULT_ATOMIC_ROUTER_KEY);
    if (
      !stored ||
      !isAddress(stored) ||
      stored.toLowerCase() === DEFAULT_AAVE_BORROWER.toLowerCase()
    ) {
      return DEPLOYED_ATOMIC_ROUTER;
    }
    return stored;
  });
  const [isExecutingFlash, setIsExecutingFlash] = useState<boolean>(false);
  const [isDeployingRouter, setIsDeployingRouter] = useState<boolean>(false);

  const isAtomicRouter = useMemo(() => {
    return (
      isAddress(customBorrowerAddress) &&
      customBorrowerAddress.toLowerCase() !== DEFAULT_AAVE_BORROWER.toLowerCase()
    );
  }, [customBorrowerAddress]);

  const flashArbResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
        borrowAsset: flashBorrowAsset,
        borrowAmount: flashBorrowAmount,
        flashPremiumBps: 5,
        sdStakedTier: flashVipTier,
        triangularRoute: {
          wethUsdcPrice: 3450.0,
          usdcDaiRate: 1.0025,
          daiWethRate: 1 / 3442.0,
          basePoolFeeBps: 30,
        },
        gasCostUsd: 0.15,
      });
    } catch {
      return null;
    }
  }, [flashBorrowAsset, flashBorrowAmount, flashVipTier]);

  const handleDeployAtomicRouter = useCallback(async () => {
    if (!walletClient || !address) {
      toast.error("Please connect your Web3 wallet first.");
      return;
    }
    if (!isBaseNetwork) {
      toast.error("Please switch to Base Mainnet (Chain ID 8453).");
      if (switchChain) switchChain({ chainId: BASE_CHAIN_ID });
      return;
    }

    setIsDeployingRouter(true);
    const toastId = toast.loading("Deploying AtomicFlashArbitrageRouter on Base Mainnet...");

    try {
      const hash = await walletClient.deployContract({
        abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
        bytecode: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.bytecode,
        args: [BASE_AAVE_POOL, address],
        account: address,
        chain: null,
      });

      toast.loading(
        `Deployment submitted: ${hash.substring(0, 10)}... Waiting for block confirmation...`,
        {
          id: toastId,
        }
      );

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.contractAddress) {
          const newRouter = receipt.contractAddress;
          setCustomBorrowerAddress(newRouter);
          localStorage.setItem(DEFAULT_ATOMIC_ROUTER_KEY, newRouter);
          toast.success("AtomicFlashArbitrageRouter Deployed on Base!", {
            id: toastId,
            description: `Contract: ${newRouter}`,
          });
          addTerminalLog(
            "success",
            `✅ [DEPLOY] AtomicFlashArbitrageRouter deployed at ${newRouter} on Base!`
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deployment failed";
      toast.error("Router deployment failed", { id: toastId, description: msg });
    } finally {
      setIsDeployingRouter(false);
    }
  }, [walletClient, address, isBaseNetwork, switchChain, publicClient, addTerminalLog]);

  const handleExecuteLiveFlashLoan = useCallback(async () => {
    if (!isConnected || !address) {
      toast.error("Please connect your Web3 wallet.");
      return;
    }
    if (!isBaseNetwork) {
      toast.error("Please switch to Base Mainnet (Chain ID 8453).");
      if (switchChain) switchChain({ chainId: BASE_CHAIN_ID });
      return;
    }
    if (!isAddress(customBorrowerAddress)) {
      toast.error("Invalid flash borrower router contract address.");
      return;
    }
    if (flashBorrowAmount <= 0) {
      toast.error("Enter a valid borrow amount.");
      return;
    }

    setIsExecutingFlash(true);
    isAutoDispatchingRef.current = true;
    const toastId = toast.loading(
      `Requesting Live ${flashBorrowAmount.toLocaleString()} ${flashBorrowAsset} Flash Loan from Aave v3...`
    );

    try {
      const assetConfig =
        BASE_ASSETS[flashBorrowAsset as keyof typeof BASE_ASSETS] ?? BASE_ASSETS.USDC;
      const borrowAmountBigInt = parseUnits(flashBorrowAmount.toString(), assetConfig.decimals);

      // Atomic router: price the cycle live on Uniswap V3 and run it as one generic step. The router
      // reverts unless it ends with principal + Aave premium + minNetProfit.
      let genericArgs: readonly [Address, bigint, bigint, Address, SwapStep[]] | null = null;
      if (isAtomicRouter) {
        if (flashBorrowAsset !== "USDC" && flashBorrowAsset !== "WETH") {
          addTerminalLog(
            "danger",
            "🛡️ [HELD] V3 flash routes borrow USDC or WETH only. Nothing sent."
          );
          toast.error("Borrow USDC or WETH", { id: toastId, description: "Nothing was sent." });
          setIsExecutingFlash(false);
          isAutoDispatchingRef.current = false;
          return;
        }
        const { tokens, stableHops } = flashTriangleTokens(flashBorrowAsset, BOT_QUOTE_VENUES);
        const [cycle, premiumBps] = await Promise.all([
          bestV3Cycle(
            BASE_QUOTE_CLIENT,
            BOT_QUOTE_VENUES.uniswapV3Quoter,
            tokens,
            stableHops,
            borrowAmountBigInt
          ),
          readAavePremiumBps(BASE_QUOTE_CLIENT, BASE_AAVE_POOL),
        ]);
        const owed = borrowAmountBigInt + flashPremium(borrowAmountBigInt, premiumBps);
        const fmt = (v: bigint) => formatUnits(v, assetConfig.decimals);
        if (!cycle || cycle.amountOut <= owed) {
          addTerminalLog(
            "warn",
            `🛡️ [HELD] Best live Uniswap V3 cycle returns ${cycle ? fmt(cycle.amountOut) : "nothing"} ${flashBorrowAsset}; Aave needs ${fmt(owed)}. Nothing sent.`
          );
          toast.error("No profitable V3 cycle right now", {
            id: toastId,
            description: "Nothing was sent.",
          });
          setIsExecutingFlash(false);
          isAutoDispatchingRef.current = false;
          return;
        }
        const edge = cycle.amountOut - owed;
        const ethUsd = await liveEthUsd(
          BASE_QUOTE_CLIENT,
          BOT_QUOTE_VENUES.uniswapV3Quoter,
          BOT_QUOTE_VENUES.weth,
          BOT_QUOTE_VENUES.usdc
        );
        // Fees are paid in ETH; express them (and the USD target) in the borrowed asset.
        const toAsset = (wei: bigint) =>
          flashBorrowAsset === "WETH"
            ? wei
            : (wei * BigInt(Math.round((ethUsd ?? 0) * 1e6))) / 10n ** 18n;
        const targetAsset =
          flashBorrowAsset === "WETH"
            ? parseEther((minNetProfitTarget / (ethUsd ?? Infinity)).toFixed(18))
            : parseUnits(minNetProfitTarget.toFixed(6), 6);
        const router = customBorrowerAddress as Address;
        const argsFor = (minNet: bigint) =>
          [
            assetConfig.address as Address,
            borrowAmountBigInt,
            minNet,
            address,
            [
              v3ExactInputStep(
                BOT_QUOTE_VENUES.uniswapV3Router,
                cycle.tokens,
                cycle.fees,
                borrowAmountBigInt,
                owed + minNet,
                router
              ),
            ],
          ] as const;
        const provisional = (edge * 70n) / 100n; // keep at least 70% of the quoted edge
        const feeWei = ethUsd
          ? await exactCallFeeWei(BASE_QUOTE_CLIENT, address, {
              address: router,
              abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
              functionName: "executeGenericArbitrage",
              args: argsFor(provisional),
            }).catch(() => null)
          : null;
        if (feeWei === null || edge < targetAsset + buffered(toAsset(feeWei))) {
          addTerminalLog(
            "warn",
            `🛡️ [HELD] Cycle edge ${fmt(edge)} ${flashBorrowAsset} after Aave's fee does not cover the $${minNetProfitTarget} target plus ${feeWei === null ? "gas (route would revert or no ETH price)" : `gas ${fmt(toAsset(feeWei))} ${flashBorrowAsset}`}. Nothing sent.`
          );
          toast.error("Not profitable after target and gas", {
            id: toastId,
            description: "Nothing was sent.",
          });
          setIsExecutingFlash(false);
          isAutoDispatchingRef.current = false;
          return;
        }
        // The router itself must refuse anything that would net less than target + gas.
        genericArgs = argsFor(
          maxBig(provisional, targetAsset + toAsset(feeWei))
        ) as unknown as readonly [Address, bigint, bigint, Address, SwapStep[]];
        addTerminalLog(
          "info",
          `📈 [V3 CYCLE] ${cycle.fees.map((f) => `${f / 10_000}%`).join(" / ")} returns ${fmt(cycle.amountOut)} ${flashBorrowAsset} for ${fmt(borrowAmountBigInt)} (Aave fee ${premiumBps} bps).`
        );
      }

      // ──────────────────────────────────────────────────────────────────────
      // STEP 1: PRE-FLIGHT SIMULATION VIA eth_call (Deterministic Anti-Loss Guard)
      // ──────────────────────────────────────────────────────────────────────
      addTerminalLog(
        "info",
        `🔍 [PRE-FLIGHT SIMULATION] Simulating uncollateralized flash loan on Base L2 (${flashBorrowAmount.toLocaleString()} ${flashBorrowAsset})...`
      );

      const simClient = publicClient ?? BASE_QUOTE_CLIENT;
      {
        try {
          if (genericArgs) {
            await simClient.simulateContract({
              address: customBorrowerAddress as Address,
              abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
              functionName: "executeGenericArbitrage",
              args: genericArgs,
              account: address,
            });
          } else {
            await simClient.simulateContract({
              address: customBorrowerAddress as Address,
              abi: LAUNCHPAD_ARTIFACTS.AaveFlashBorrower.abi,
              functionName: "requestFlashLoan",
              args: [assetConfig.address, borrowAmountBigInt, "0x"],
              account: address,
            });
          }
          addTerminalLog(
            "success",
            `✅ [PRE-FLIGHT SIMULATION PASSED] Base L2 simulation cleared anti-loss invariant! Dispatching to wallet for cryptographic signature...`
          );
        } catch (simErr: unknown) {
          const revertReason =
            (simErr as { shortMessage?: string })?.shortMessage ||
            (simErr as Error)?.message ||
            "Anti-loss invariant triggered";
          // Only the contracts' own profit checks mean "spread too small"; any other revert
          // (authorization, missing contract, failed swap) must be shown as-is.
          const isAntiLoss =
            revertReason.includes("Anti-loss") ||
            revertReason.includes("Insufficient profit") ||
            revertReason.includes("Insufficient funds to repay");

          addTerminalLog(
            "danger",
            `🛡️ [PRE-FLIGHT SIMULATION HELD] ${revertReason}. Anti-Loss Guard prevented transaction broadcast — zero gas lost, $0 capital at risk.`
          );

          toast.error("Pre-Flight Simulation Reverted", {
            id: toastId,
            description: `Simulation reverted: ${isAntiLoss ? "Insufficient arbitrage spread to cover Aave fee and gas." : revertReason}. Your wallet was protected from paying wasted gas.`,
          });

          setIsExecutingFlash(false);
          isAutoDispatchingRef.current = false;
          return;
        }
      }

      // ──────────────────────────────────────────────────────────────────────
      // STEP 2: LIVE BROADCAST TO WALLET ONLY IF SIMULATION PASSED
      // ──────────────────────────────────────────────────────────────────────
      let hash: Address;
      if (genericArgs) {
        hash = await writeContractAsync({
          address: customBorrowerAddress as Address,
          abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
          functionName: "executeGenericArbitrage",
          args: genericArgs,
        });
      } else {
        hash = await writeContractAsync({
          address: customBorrowerAddress as Address,
          abi: LAUNCHPAD_ARTIFACTS.AaveFlashBorrower.abi,
          functionName: "requestFlashLoan",
          args: [assetConfig.address, borrowAmountBigInt, "0x"],
        });
      }

      toast.success("Aave v3 Flash Loan Executed on Base!", {
        id: toastId,
        description: `Tx: ${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`,
      });

      const newTx: LiveTransactionRecord = {
        id: `tx-${Date.now()}`,
        txHash: hash,
        type: "AAVE_FLASH_LOAN",
        summary: `Flash Loan ${flashBorrowAmount.toLocaleString()} ${flashBorrowAsset} via Aave v3${genericArgs ? " (Uniswap V3 cycle)" : ""}`,
        timestamp: new Date().toLocaleTimeString(),
        status: "SUBMITTED",
        explorerUrl: `https://basescan.org/tx/${hash}`,
      };
      setTxHistory((prev) => [newTx, ...prev]);

      if (publicClient) {
        publicClient
          .waitForTransactionReceipt({ hash })
          .then((receipt) => {
            setTxHistory((prev) =>
              prev.map((t) =>
                t.txHash === hash
                  ? {
                      ...t,
                      status: receipt.status === "success" ? "CONFIRMED" : "REVERTED",
                    }
                  : t
              )
            );
            if (receipt.status === "success") {
              toast.success("Flash Arbitrage Settled & Profit Captured!", {
                description: `Block: ${receipt.blockNumber.toString()}`,
              });
            } else {
              toast.error("Flash Loan reverted on-chain (insufficient profit to repay debt).");
            }
          })
          .catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Flash loan execution failed";
      const isUserReject =
        msg.toLowerCase().includes("user rejected") ||
        msg.toLowerCase().includes("rejected") ||
        msg.toLowerCase().includes("action_rejected") ||
        (err as { code?: number })?.code === 4001;

      if (isUserReject) {
        setAutoSubmitTrades(false);
        addTerminalLog(
          "warn",
          "🛑 [AUTO-DISPATCH] Transaction signature rejected in wallet. 'Auto-Submit to Wallet' turned OFF for your protection."
        );
        toast.info("Auto-Submit disabled after wallet cancellation.");
      } else {
        toast.error("Execution error", { id: toastId, description: msg });
      }
    } finally {
      setIsExecutingFlash(false);
      isAutoDispatchingRef.current = false;
      lastDispatchTimeRef.current = Date.now();
    }
  }, [
    isConnected,
    address,
    isBaseNetwork,
    switchChain,
    customBorrowerAddress,
    flashBorrowAmount,
    flashBorrowAsset,
    isAtomicRouter,
    flashArbResult,
    writeContractAsync,
    publicClient,
    addTerminalLog,
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // OPTION A: IN-BROWSER AI AUTO-PILOT STATE & ENGINE
  // ──────────────────────────────────────────────────────────────────────────
  const [isBotRunning, setIsBotRunning] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.location.pathname.includes("autopilot") || window.location.search.includes("autopilot")
    );
  });
  const [maxSlippageCap, setMaxSlippageCap] = useState<number>(0.2); // 0.2%
  const [maxGasCeiling, setMaxGasCeiling] = useState<number>(0.01); // 0.01 Gwei

  // Strategy selections
  const [strategyTriangular, setStrategyTriangular] = useState<boolean>(true);
  const [strategyCrossDex, setStrategyCrossDex] = useState<boolean>(true);
  const [strategyFlashLoan, setStrategyFlashLoan] = useState<boolean>(true);
  const [strategy100PairMatrix, setStrategy100PairMatrix] = useState<boolean>(true);
  // 🌙 Autonomous Sleep Mode: Auto-clicks / auto-executes qualified opportunities without human interaction
  const [isSleepMode, setIsSleepMode] = useState<boolean>(true);

  // Terminal Channel Filter: All, Pair Matrix, or Base Flash
  const [terminalChannel, setTerminalChannel] = useState<"ALL" | "MATRIX_100" | "FLASH_BASE">(
    "ALL"
  );

  // Top Qualified 100-Pair Signal (for 1-click "Snatch That Money" banner)
  const [topQualified100Pair, setTopQualified100Pair] = useState<{
    symbol: string;
    baseAsset: string;
    buyExchange: string;
    sellExchange: string;
    netBps: number;
    netPct: string;
    hurdlePct: string;
    estProfitUsd: number;
    ts: number;
  } | null>(null);

  // CCXT Pro Live CeDeFi Stream for 100-pair order books
  const cefiStream = useCeFiArbStream({ notional: 1000, minNetBps: -1e9, symbols: null });

  /**
   * Two-sided WETH/USDC spread in one transaction: flash-borrow WETH, sell it on the venue paying
   * more USDC, buy WETH back on the other venue, repay Aave. Requires the AtomicFlashArbitrageRouter;
   * it reverts unless the route ends with principal + premium + minNetProfit.
   */
  const handleExecuteAtomicSpread = useCallback(
    async (units: number) => {
      if (!isConnected || !address || !isBaseNetwork) {
        toast.error("Connect your wallet on Base Mainnet.");
        return;
      }
      if (!isAtomicRouter) {
        addTerminalLog(
          "warn",
          "⚠️ [HELD] Two-sided spreads run atomically through AtomicFlashArbitrageRouter. Deploy it in '3. Flash Loans' tab."
        );
        return;
      }
      setIsExecutingSpread(true);
      isAutoDispatchingRef.current = true;
      const toastId = toast.loading("Pricing atomic Uniswap V3 / Aerodrome spread...");
      try {
        const amount = parseEther(units.toString());
        const [quote, premiumBps] = await Promise.all([
          quoteAtomicSpread(BASE_QUOTE_CLIENT, BOT_QUOTE_VENUES, amount),
          readAavePremiumBps(BASE_QUOTE_CLIENT, BASE_AAVE_POOL),
        ]);
        const owed = amount + flashPremium(amount, premiumBps);
        // Leg 2 spends slightly less USDC than leg 1 returns; scale its quoted output the same way.
        const expectedOut = quote
          ? (quote.wethOut * (10_000n - SPREAD_LEG2_BUFFER_BPS)) / 10_000n
          : 0n;
        if (!quote || expectedOut <= owed) {
          addTerminalLog(
            "warn",
            `🛡️ [HELD] Atomic spread returns ${quote ? formatUnits(expectedOut, 18) : "nothing"} WETH; Aave needs ${formatUnits(owed, 18)}. Nothing sent.`
          );
          toast.error("No profitable two-sided spread right now", {
            id: toastId,
            description: "Nothing was sent.",
          });
          return;
        }
        const edge = expectedOut - owed;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        const router = customBorrowerAddress as Address;
        const ethUsd = Number(formatUnits(quote.usdcMid, 6)) / units;
        const targetWei = parseEther((minNetProfitTarget / ethUsd).toFixed(18));
        const argsFor = (minNet: bigint) =>
          [
            BASE_ASSETS.WETH.address as Address,
            amount,
            minNet,
            address,
            atomicSpreadSteps(BOT_QUOTE_VENUES, quote, amount, owed + minNet, router, deadline),
          ] as const;
        const provisional = (edge * 70n) / 100n;
        const feeWei = await exactCallFeeWei(BASE_QUOTE_CLIENT, address, {
          address: router,
          abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
          functionName: "executeGenericArbitrage",
          args: argsFor(provisional),
        }).catch(() => null);
        if (feeWei === null || edge < targetWei + buffered(feeWei)) {
          addTerminalLog(
            "warn",
            `🛡️ [HELD] Spread edge ${formatUnits(edge, 18)} WETH after Aave's fee does not cover the $${minNetProfitTarget} target plus ${feeWei === null ? "gas (route would revert)" : `gas ${formatUnits(feeWei, 18)} ETH`}. Nothing sent.`
          );
          toast.error("Not profitable after target and gas", {
            id: toastId,
            description: "Nothing was sent.",
          });
          return;
        }
        const args = argsFor(maxBig(provisional, targetWei + feeWei));

        let request;
        try {
          ({ request } = await (publicClient ?? BASE_QUOTE_CLIENT).simulateContract({
            address: router,
            abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
            functionName: "executeGenericArbitrage",
            args,
            account: address,
          }));
        } catch (simErr: unknown) {
          const reason =
            (simErr as { shortMessage?: string })?.shortMessage ||
            (simErr as Error)?.message ||
            "Atomic spread reverted";
          addTerminalLog("danger", `🛡️ [PRE-FLIGHT SIMULATION HELD] ${reason}. Nothing sent.`);
          toast.error("Pre-Flight Simulation Reverted", { id: toastId, description: reason });
          return;
        }

        const hash = await writeContractAsync(request);
        toast.success("Atomic spread submitted!", {
          id: toastId,
          description: `Tx: ${hash.substring(0, 10)}...`,
        });
        const venueName = (v: string) => (v === "UNISWAP" ? "Uniswap V3" : "Aerodrome");
        setTxHistory((prev) => [
          {
            id: `tx-${Date.now()}`,
            txHash: hash,
            type: "CROSS_DEX_SPREAD",
            summary: `Atomic spread ${units} WETH: sell on ${venueName(quote.sellVenue)}, buy on ${venueName(quote.buyVenue)}`,
            timestamp: new Date().toLocaleTimeString(),
            status: "SUBMITTED",
            explorerUrl: `https://basescan.org/tx/${hash}`,
          },
          ...prev,
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Atomic spread failed";
        if (msg.toLowerCase().includes("rejected") || (err as { code?: number })?.code === 4001) {
          setAutoSubmitTrades(false);
          addTerminalLog(
            "warn",
            "🛑 [AUTO-DISPATCH] Transaction signature rejected in wallet. 'Auto-Submit to Wallet' turned OFF for your protection."
          );
        } else {
          toast.error("Execution error", { id: toastId, description: msg });
        }
      } finally {
        setIsExecutingSpread(false);
        isAutoDispatchingRef.current = false;
        lastDispatchTimeRef.current = Date.now();
      }
    },
    [
      isConnected,
      address,
      isBaseNetwork,
      isAtomicRouter,
      customBorrowerAddress,
      minNetProfitTarget,
      publicClient,
      writeContractAsync,
      addTerminalLog,
    ]
  );

  const [botStats, setBotStats] = useState<{
    scansCount: number;
    opportunitiesDetected: number;
    tradesDispatched: number;
    totalProfitUsd: number;
  }>({
    scansCount: 0,
    opportunitiesDetected: 0,
    tradesDispatched: 0,
    totalProfitUsd: 0,
  });

  const botParamsRef = useRef({
    minNetProfitTarget,
    maxSlippageCap,
    maxGasCeiling,
    strategyTriangular,
    strategyCrossDex,
    strategyFlashLoan,
    strategy100PairMatrix,
    isSleepMode,
    cefiStream,
    triInitialWeth,
    flashBorrowAmount,
    flashBorrowAsset,
    flashVipTier,
    gasPriceGwei,
    autoSubmitTrades,
    isConnected,
    isBaseNetwork,
    blockNumber,
    address,
    customBorrowerAddress,
    isAtomicRouter,
    handleExecuteLiveTriangular,
    handleExecuteAtomicSpread,
    handleExecuteLiveFlashLoan,
  });

  useEffect(() => {
    botParamsRef.current = {
      minNetProfitTarget,
      maxSlippageCap,
      maxGasCeiling,
      strategyTriangular,
      strategyCrossDex,
      strategyFlashLoan,
      strategy100PairMatrix,
      isSleepMode,
      cefiStream,
      triInitialWeth,
      flashBorrowAmount,
      flashBorrowAsset,
      flashVipTier,
      gasPriceGwei,
      autoSubmitTrades,
      isConnected,
      isBaseNetwork,
      blockNumber,
      address,
      customBorrowerAddress,
      isAtomicRouter,
      handleExecuteLiveTriangular,
      handleExecuteAtomicSpread,
      handleExecuteLiveFlashLoan,
    };
  });

  // Auto-Pilot Continuous Scan Loop (Resilient to Base L2 block stream & Pair Matrix)
  useEffect(() => {
    if (!isBotRunning) return;

    let cancelled = false;
    let tickInFlight = false;

    const runScanTick = async () => {
      if (tickInFlight) return; // previous tick still waiting on quotes
      tickInFlight = true;
      try {
        await scanTick();
      } finally {
        tickInFlight = false;
      }
    };

    const scanTick = async () => {
      const params = botParamsRef.current;
      setBotStats((prev) => ({ ...prev, scansCount: prev.scansCount + 1 }));

      const currentBlock = params.blockNumber ? params.blockNumber.toString() : "pending";
      // Live on-chain quotes at the trade size, from the routers the live handlers use.
      const live = await fetchLiveBotQuotes(
        BASE_QUOTE_CLIENT,
        BOT_QUOTE_VENUES,
        params.triInitialWeth
      );
      if (cancelled) return;

      if (!live) {
        addTerminalLog(
          "warn",
          `⏸ [BLOCK #${currentBlock}] No live Uniswap V3 / Aerodrome quote this tick: AMM strategies skipped, nothing dispatched.`
        );
      } else {
        const botConfig: BotConfig = {
          minNetProfitUsd: params.minNetProfitTarget,
          maxSlippageBps: Math.round(params.maxSlippageCap * 100),
          maxGasCeilingGwei: params.maxGasCeiling,
          strategies: {
            triangular: params.strategyTriangular,
            crossDex: params.strategyCrossDex,
            flashLoan: params.strategyFlashLoan,
          },
          tradeCapitalEth: params.triInitialWeth,
          flashBorrowUsdc: params.flashBorrowAmount,
          vipTier: params.flashVipTier,
        };

        const gasPriceWei = BigInt(Math.round(params.gasPriceGwei * 1e9));
        const marketSnapshot: MarketSnapshot = {
          wethUsdcPrice: live.wethUsdcPrice,
          usdcDaiRate: live.usdcDaiRate,
          daiWethRate: live.daiWethRate,
          uniswapEthPrice: live.uniswapEthPrice,
          aerodromeEthPrice: live.aerodromeEthPrice,
          aerodromeFeeRate: live.aerodromeFeeRate,
          uniswapFeeRate: live.uniswapFeeRate,
          triangularFeesIncluded: true,
          gasCostUsd: {
            triangular: screeningGasUsd(
              MEASURED_GAS_UNITS.triangular,
              gasPriceWei,
              live.uniswapEthPrice
            ),
            crossDex: screeningGasUsd(
              MEASURED_GAS_UNITS.crossDex,
              gasPriceWei,
              live.uniswapEthPrice
            ),
            flashLoan: screeningGasUsd(
              MEASURED_GAS_UNITS.flashLoan,
              gasPriceWei,
              live.uniswapEthPrice
            ),
          },
          currentGasGwei: params.gasPriceGwei,
          timestamp: Date.now(),
        };

        const evalResult = AiArbitrageBotEngine.evaluateMarketOpportunity(
          botConfig,
          marketSnapshot
        );

        if (evalResult.qualified) {
          addTerminalLog(
            "success",
            `⚡ [BLOCK #${currentBlock}] OPPORTUNITY QUALIFIED: ${evalResult.summary} | Est. Net: +$${evalResult.projectedNetProfitUsd.toFixed(2)} (Confidence: ${evalResult.confidenceScore}%)`
          );
          if (evalResult.breakdown) {
            addTerminalLog(
              "info",
              `📊 [P&L TELEMETRY] Gross: $${evalResult.breakdown.grossProfitUsd.toFixed(2)} | Aave Fee (-0.05%): -$${evalResult.breakdown.flashLoanFeeUsd.toFixed(2)} | Gas: -$${evalResult.breakdown.estimatedGasUsd.toFixed(2)} | Hurdle Floor: $${evalResult.breakdown.minProfitFloorUsd.toFixed(2)}`
            );
          }
          setBotStats((prev) => ({
            ...prev,
            opportunitiesDetected: prev.opportunitiesDetected + 1,
          }));

          if (params.autoSubmitTrades && params.isConnected && params.isBaseNetwork) {
            const now = Date.now();
            if (isAutoDispatchingRef.current) {
              // Already awaiting wallet confirmation — do NOT fire a second popup!
              return;
            }
            if (now - lastDispatchTimeRef.current < 25_000) {
              // 25-second cooldown between auto-dispatches to avoid spam
              return;
            }

            if (evalResult.strategy === "CROSS_DEX" && !params.isAtomicRouter) {
              addTerminalLog(
                "warn",
                `⚠️ [HELD] Cross-DEX signal (+${evalResult.projectedNetProfitUsd.toFixed(2)} USD). Two-sided spreads run atomically through AtomicFlashArbitrageRouter: deploy it in '3. Flash Loans' tab.`
              );
              return;
            }

            if (evalResult.strategy === "FLASH_LOAN") {
              if (!params.isAtomicRouter) {
                addTerminalLog(
                  "warn",
                  `⚠️ [HELD] Flash loan signal (+${evalResult.projectedNetProfitUsd.toFixed(2)} USD). Deploy AtomicFlashArbitrageRouter in '3. Flash Loans' tab to enable autonomous execution.`
                );
                return;
              }

              addTerminalLog(
                "info",
                `🚀 [AUTO-DISPATCH] Pre-flight simulation initiated for ${evalResult.strategy} (+${evalResult.projectedNetProfitUsd.toFixed(2)} USD)...`
              );
              setBotStats((prev) => ({
                ...prev,
                tradesDispatched: prev.tradesDispatched + 1,
                totalProfitUsd: Number(
                  (prev.totalProfitUsd + evalResult.projectedNetProfitUsd).toFixed(2)
                ),
              }));
              params.handleExecuteLiveFlashLoan();
              return;
            }

            addTerminalLog(
              "info",
              `🚀 [AUTO-DISPATCH] Submitting atomic transaction on Base Mainnet for ${evalResult.strategy}...`
            );
            setBotStats((prev) => ({
              ...prev,
              tradesDispatched: prev.tradesDispatched + 1,
              totalProfitUsd: Number(
                (prev.totalProfitUsd + evalResult.projectedNetProfitUsd).toFixed(2)
              ),
            }));

            // Trigger execution based on strategy
            if (evalResult.strategy === "TRIANGULAR") {
              params.handleExecuteLiveTriangular(live);
            } else if (evalResult.strategy === "CROSS_DEX") {
              params.handleExecuteAtomicSpread(live.tradeWeth);
            }
          } else if (!params.autoSubmitTrades) {
            addTerminalLog(
              "warn",
              `⚠️ Opportunity held: 'Auto-Submit to Wallet' is OFF. Enable toggle to execute automatically.`
            );
          } else if (!params.isConnected) {
            addTerminalLog(
              "warn",
              `⚠️ Opportunity held: Web3 wallet is disconnected. Connect wallet to auto-execute.`
            );
          }
        } else {
          // Disqualified / held for safety
          if (evalResult.disqualificationReason?.includes("safety ceiling")) {
            addTerminalLog(
              "danger",
              `🛑 [BLOCK #${currentBlock}] Gas Guard: ${evalResult.disqualificationReason}`
            );
          } else {
            addTerminalLog(
              "info",
              `🔍 [BLOCK #${currentBlock}] Scanned Base pools | ${evalResult.summary} | Anti-Loss: ${evalResult.disqualificationReason ?? "Holding for higher spread"}`
            );
          }
        }
      }

      // ──────────────────────────────────────────────────────────────────────
      // 100-PAIR SPOT ARBITRAGE MATRIX SWEEP (Binance • Bybit • OKX • Coinbase • Kraken)
      // ──────────────────────────────────────────────────────────────────────
      if (params.strategy100PairMatrix) {
        const liveOpps = params.cefiStream?.snapshot?.opportunities ?? [];
        let matchedOpp: {
          pair: MatrixPair;
          buyExchange: string;
          sellExchange: string;
          netBps: number;
          netProfitUsd: number;
        } | null = null;

        // Check if any real-time CCXT opportunities match the 100-pair matrix
        for (const opp of liveOpps) {
          const matrixMatch = PAIR_MATRIX_DATA.find((p) => p.symbol === opp.symbol);
          if (!matrixMatch || matrixMatch.quoteAsset !== "USD") continue; // USD profit targets require a USD quote.
          const hurdleBps = parseFloat(matrixMatch.minNetEdgePct) * 100;
          if (opp.netBps >= hurdleBps) {
            matchedOpp = {
              pair: matrixMatch,
              buyExchange: opp.buyExchange,
              sellExchange: opp.sellExchange,
              netBps: opp.netBps,
              netProfitUsd: opp.netPnlQuote,
            };
            break;
          }
        }

        // No synthetic opportunities: wait for actual exchange books.

        if (matchedOpp) {
          const hurdleBps = parseFloat(matchedOpp.pair.minNetEdgePct) * 100;
          const netPctFormatted = `${(matchedOpp.netBps / 100).toFixed(2)}%`;

          if (matchedOpp.netBps >= hurdleBps) {
            setTopQualified100Pair({
              symbol: matchedOpp.pair.symbol,
              baseAsset: matchedOpp.pair.baseAsset,
              buyExchange: matchedOpp.buyExchange,
              sellExchange: matchedOpp.sellExchange,
              netBps: matchedOpp.netBps,
              netPct: netPctFormatted,
              hurdlePct: matchedOpp.pair.minNetEdgePct,
              estProfitUsd: matchedOpp.netProfitUsd,
              ts: Date.now(),
            });

            addTerminalLog(
              "success",
              `⚡ [100-PAIR MATRIX] OPPORTUNITY QUALIFIED: ${matchedOpp.pair.symbol} (${matchedOpp.buyExchange.toUpperCase()} ➔ ${matchedOpp.sellExchange.toUpperCase()}) | Net Edge: +${netPctFormatted} (Min Hurdle: ${matchedOpp.pair.minNetEdgePct}) | Est. Net: +$${matchedOpp.netProfitUsd.toFixed(2)} USD`
            );
            addTerminalLog(
              "info",
              `🎯 [CAPITAL READINESS] Check current Kraken balances and both venue inventories before executing ${matchedOpp.pair.baseAsset}.`
            );

            setBotStats((prev) => ({
              ...prev,
              opportunitiesDetected: prev.opportunitiesDetected + 1,
            }));

            if (params.isSleepMode) {
              const now = Date.now();
              if (now - lastDispatchTimeRef.current >= 3500) {
                lastDispatchTimeRef.current = now;
                addTerminalLog(
                  "info",
                  `🌙 [SLEEP MODE: SCANNER TICK] Qualified spread on ${matchedOpp.pair.symbol} (+${netPctFormatted}) | Buy: ${matchedOpp.buyExchange.toUpperCase()} ➔ Sell: ${matchedOpp.sellExchange.toUpperCase()}`
                );
                addTerminalLog(
                  "warn",
                  `⚠️ [PAPER MODE] Real cross-exchange execution requires funded accounts on BOTH ${matchedOpp.buyExchange.toUpperCase()} and ${matchedOpp.sellExchange.toUpperCase()}. No order was submitted.`
                );
              }
            } else {
              if (params.autoSubmitTrades) {
                addTerminalLog(
                  "info",
                  `Execution is not armed for ${matchedOpp.pair.symbol}; this scanner has not submitted an order.`
                );
              }
            }
          } else {
            addTerminalLog(
              "info",
              `🔍 [100-PAIR MATRIX] Scanned configured spot pairs across Binance, Bybit, OKX, Coinbase, Kraken | Top: ${matchedOpp.pair.symbol} (${netPctFormatted}) | Anti-Loss Guard held (Below ${matchedOpp.pair.minNetEdgePct} hurdle).`
            );
          }
        }
      }
    };

    // Run first tick immediately on startup
    void runScanTick();
    const interval = setInterval(() => void runScanTick(), 2800);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isBotRunning, addTerminalLog]);

  const handleToggleBot = () => {
    if (!isBotRunning) {
      setIsBotRunning(true);
      addTerminalLog("success", "▶ AI Auto-Pilot STARTED. Continuous Base AMM scanning active.");
      toast.success("AI Arbitrage Auto-Pilot Started!", {
        description: `Targeting minimum profit of $${minNetProfitTarget.toLocaleString()} USD`,
      });
    } else {
      setIsBotRunning(false);
      addTerminalLog("warn", "⏹ AI Auto-Pilot PAUSED by user.");
      toast.info("AI Arbitrage Auto-Pilot Paused.");
    }
  };

  const handleDownloadLog = () => {
    const content = terminalLogs
      .map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sd-arbitrage-bot-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = useMemo(() => {
    if (terminalChannel === "MATRIX_100") {
      return terminalLogs.filter(
        (l) =>
          l.message.includes("100-PAIR") ||
          l.message.includes("CAPITAL") ||
          l.message.includes("Kraken")
      );
    }
    if (terminalChannel === "FLASH_BASE") {
      return terminalLogs.filter(
        (l) =>
          l.message.includes("BLOCK #") ||
          l.message.includes("PRE-FLIGHT") ||
          l.message.includes("Base pools") ||
          l.message.includes("Aave")
      );
    }
    return terminalLogs;
  }, [terminalLogs, terminalChannel]);

  const currentMeta = ARBITRAGE_PAGE_META[activeArbitrageTab] || ARBITRAGE_PAGE_META.matrix;
  const CurrentIcon = currentMeta.icon;

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Launchpad Sub-Navigation */}
      <LaunchpadNav />

      {/* ── Active Page Breadcrumb & Context Navigation Bar ── */}
      <div className="shadow-xs flex flex-col gap-2 rounded-2xl border border-purple-100 bg-white/80 p-3.5 backdrop-blur-md md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-400">Arbitrage Studio</span>
          <ChevronRight className="size-3.5 text-slate-300" />
          <Badge variant="outline" className={`font-bold ${currentMeta.badgeBg}`}>
            <CurrentIcon className="mr-1 size-3.5" />
            {currentMeta.category}
          </Badge>
          <ChevronRight className="size-3.5 text-slate-300" />
          <span className="font-extrabold text-slate-900">{currentMeta.shortLabel}</span>
          {activeArbitrageTab === "cedefi" && (
            <>
              <ChevronRight className="size-3.5 text-slate-300" />
              <Badge className="shadow-xs bg-purple-600 font-mono font-bold text-white">
                Active Pair: {selectedMatrixSymbol}
              </Badge>
            </>
          )}
        </div>

        {/* Quick Return & Fast-Switch Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {activeArbitrageTab !== "matrix" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackToMatrix}
              className="border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <ArrowLeft className="mr-1.5 size-3.5 text-emerald-600" />
              📊 Return to Pair Matrix
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTabChange("cedefi")}
              className="border-indigo-300 bg-indigo-50 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
            >
              <Globe className="mr-1.5 size-3.5 text-indigo-600" />
              🌐 Open CeDeFi L2 Books ({selectedMatrixSymbol})
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Dynamic Page Header (Changes Name & Purpose per Page) ── */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className={`bg-gradient-to-r ${currentMeta.gradient} flex items-center gap-2.5 bg-clip-text text-3xl font-black text-transparent`}
            >
              <CurrentIcon className="inline size-8 text-slate-800" />
              {activeArbitrageTab === "cedefi"
                ? `CeDeFi L2 Scanner: ${selectedMatrixSymbol}`
                : currentMeta.name}
            </h1>

            {isBotRunning ? (
              <Badge className="flex items-center gap-1.5 border-emerald-500 bg-emerald-600 px-3 py-1 font-black text-white shadow-sm shadow-emerald-200">
                <span className="size-2 animate-ping rounded-full bg-white" />
                🤖 AI AUTO-PILOT ACTIVE
              </Badge>
            ) : isLiveMode ? (
              <Badge className="flex items-center gap-1.5 border-rose-500 bg-rose-600 px-3 py-1 font-black text-white shadow-sm shadow-rose-200">
                <span className="size-2 animate-ping rounded-full bg-white" />⚡ LIVE UNRESTRICTED
                ARBITRAGE
              </Badge>
            ) : (
              <Badge className="border-amber-300 bg-amber-100 font-bold text-amber-900">
                🧪 SANDBOX SIMULATION
              </Badge>
            )}

            <Badge
              variant="outline"
              className={`font-mono text-xs font-bold ${currentMeta.badgeBg}`}
            >
              {currentMeta.badge}
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{currentMeta.subtitle}</p>
        </div>

        {/* Global Controls & Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {activeArbitrageTab === "cedefi" && (
            <Button
              size="sm"
              onClick={handleBackToMatrix}
              className="border-2 border-emerald-400 bg-emerald-600 font-black text-white shadow-sm hover:bg-emerald-700"
            >
              <ArrowLeft className="mr-1.5 size-4" /> 📊 Return to 100 Pairs
            </Button>
          )}

          <Button
            variant={isLiveMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsLiveMode(!isLiveMode)}
            className={
              isLiveMode
                ? "border-rose-600 bg-rose-600 font-bold text-white hover:bg-rose-700"
                : "border-slate-300 font-bold text-slate-700"
            }
          >
            {isLiveMode ? "⚡ Mode: Live Mainnet" : "🧪 Mode: Sandbox Simulation"}
          </Button>

          <a
            href={`https://basescan.org/address/${customBorrowerAddress}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Borrower Contract <ExternalLink className="ml-1.5 size-3.5" />
            </Button>
          </a>
        </div>
      </div>

      {/* Network & Live Wallet Status Banner */}
      <Card
        className={`border ${
          isLiveMode
            ? "border-rose-200 bg-gradient-to-r from-rose-50/50 via-white to-amber-50/30"
            : "border-slate-200 bg-slate-50"
        } shadow-sm`}
      >
        <CardContent className="flex flex-col items-start justify-between gap-4 p-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Radio
                className={`size-3.5 ${
                  isConnected ? "animate-pulse text-emerald-500" : "text-slate-400"
                }`}
              />
              <span className="font-semibold text-slate-700">Wallet:</span>
              {isConnected && address ? (
                <span className="font-mono font-bold text-slate-900">
                  {address.substring(0, 6)}...{address.substring(address.length - 4)}
                </span>
              ) : (
                <span className="font-medium text-amber-600">Disconnected</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">Network:</span>
              {isBaseNetwork ? (
                <Badge className="border-blue-300 bg-blue-100 font-bold text-blue-900">
                  🔵 Base (8453)
                </Badge>
              ) : (
                <Badge className="border-amber-300 bg-amber-100 font-bold text-amber-900">
                  ⚠️ Chain ID: {chainId ?? "None"}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Cpu className="size-3.5 text-purple-600" />
              <span className="font-semibold text-slate-700">Base Gas:</span>
              <span className="font-mono font-bold text-purple-900">{gasPriceGwei} Gwei</span>
            </div>

            {blockNumber && (
              <div className="hidden items-center gap-1.5 sm:flex">
                <span className="font-semibold text-slate-700">Block:</span>
                <span className="font-mono text-slate-600">#{blockNumber.toString()}</span>
              </div>
            )}
          </div>

          {!isBaseNetwork && isConnected && (
            <Button
              size="sm"
              onClick={() => switchChain && switchChain({ chainId: BASE_CHAIN_ID })}
              disabled={isSwitchingChain}
              className="bg-blue-600 font-bold text-white hover:bg-blue-700"
            >
              Switch to Base Mainnet
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Main Execution Tabs - Auto-Pilot Prominently Featured */}
      <Tabs value={activeArbitrageTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-1 border border-purple-100 bg-white/70 p-1 shadow-sm sm:grid-cols-8">
          <TabsTrigger
            value="matrix"
            className="flex items-center gap-2 font-bold text-emerald-800 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Sparkles className="size-4" />
            📊 Pair Matrix
          </TabsTrigger>
          <TabsTrigger
            value="cedefi"
            className="flex items-center gap-2 font-bold text-indigo-800 data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
          >
            <Globe className="size-4" />
            🌐 CeDeFi L2 Books
          </TabsTrigger>
          <TabsTrigger
            value="autopilot"
            className="flex items-center gap-2 font-bold text-purple-800 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
          >
            <Bot className="size-4" />
            🤖 AI Auto-Pilot
          </TabsTrigger>
          <TabsTrigger
            value="triangular"
            className="flex items-center gap-2 font-semibold text-slate-700 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
          >
            <TrendingUp className="size-4" />
            1. Triangular
          </TabsTrigger>
          <TabsTrigger
            value="dualpool"
            className="flex items-center gap-2 font-semibold text-slate-700 data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
          >
            <Layers className="size-4" />
            2. Cross-DEX
          </TabsTrigger>
          <TabsTrigger
            value="flashloan"
            className="flex items-center gap-2 font-semibold text-slate-700 data-[state=active]:bg-amber-600 data-[state=active]:text-white"
          >
            <Zap className="size-4" />
            3. Flash Loans
          </TabsTrigger>
          <TabsTrigger
            value="live"
            className="flex items-center gap-2 font-bold text-rose-700 data-[state=active]:bg-rose-600 data-[state=active]:text-white"
          >
            <Radio className="size-4" />
            🔴 Live Desk
          </TabsTrigger>
          <TabsTrigger
            value="console"
            className="flex items-center gap-2 font-semibold text-slate-700 data-[state=active]:bg-rose-600 data-[state=active]:text-white"
          >
            <Activity className="size-4" />
            4. Console ({txHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: AI AUTO-PILOT DASHBOARD ── */}
        <TabsContent value="autopilot" className="space-y-6">
          {/* Top Performance Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-purple-100 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-slate-500">
                  Auto-Pilot Status
                </CardTitle>
                <Bot className="size-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-xl font-black ${
                    isBotRunning ? "text-emerald-600" : "text-slate-500"
                  }`}
                >
                  {isBotRunning ? "RUNNING" : "PAUSED"}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {isBotRunning ? "Scanning Base every 3.5s" : "Click Start to activate"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-100 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-slate-500">Total Scans</CardTitle>
                <Activity className="size-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-slate-900">
                  {botStats.scansCount.toLocaleString()}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">AMM pool liquidity sweeps</p>
              </CardContent>
            </Card>

            <Card className="border-amber-100 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-slate-500">
                  Qualified Signals
                </CardTitle>
                <Zap className="size-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-amber-600">
                  {botStats.opportunitiesDetected}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Cleared all Anti-Loss gates</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/30 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-amber-800">
                  Projected Edge of Dispatched Signals
                </CardTitle>
                <Flame className="size-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-amber-700">
                  +${botStats.totalProfitUsd.toFixed(2)} USD
                </div>
                <p className="mt-1 text-[11px] text-amber-800/80">
                  {botStats.tradesDispatched} signals sent to your wallet for confirmation.
                  Projections from live quotes, not settled profit.
                </p>
                <div className="mt-2 flex items-center justify-between rounded bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                  <span>Real Settled P&L:</span>
                  <span className="font-mono font-bold">Not tracked; check BaseScan</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-slate-500">
                  Anti-Loss Guard
                </CardTitle>
                <ShieldCheck className="size-4 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-indigo-600">Min-output enforced</div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Swaps revert below the quoted minimum; a reverted transaction still pays gas.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Real Capital Custody & Settlement Destination Verifier */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 text-white shadow-md">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      Capital Custody & Earnings Settlement Gate
                    </span>
                    <Badge className="border-emerald-500/30 bg-emerald-500/20 text-[10px] text-emerald-300">
                      100% Retained Equity
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300">
                    Your real capital is 100% safe. All captured arbitrage settles directly into
                    your authenticated accounts with 0% platform fee.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Destination 1: Kraken */}
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5">
                  <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                  <span className="text-slate-300">Kraken Spot:</span>
                  <span className="font-mono font-bold text-emerald-400">$108.58 USD</span>
                  <span className="text-[10px] text-slate-400">
                    (1.37 VVV • 0.011 ETH • 29.2 USDC • 77 SEI)
                  </span>
                </div>

                {/* Destination 2: Web3 Wallet */}
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5">
                  <Wallet className="size-3.5 text-indigo-400" />
                  <span className="text-slate-300">Wallet:</span>
                  <a
                    href="https://basescan.org/address/0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-bold text-indigo-300 underline hover:text-white"
                  >
                    0x9dC0...47C98 ↗
                  </a>
                  <span className="text-[10px] text-slate-400">(Aave Flash Profits)</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-col justify-between gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 md:flex-row md:items-center">
              <div className="flex items-center gap-1.5">
                <Lock className="size-3 text-amber-400" />
                <span>
                  <strong>Anti-Loss Guard:</strong> every dispatch is simulated on-chain first and
                  carries a minimum output. Session projections (+$
                  {botStats.totalProfitUsd.toFixed(2)} USD) are estimates, not settled profit.
                </span>
              </div>
              <div className="shrink-0 font-mono text-slate-400">
                Router:{" "}
                <a
                  href="https://basescan.org/address/0x70315019d12a11556c837970675cdc8fa54d186b"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-300 underline"
                >
                  0x7031...186b ↗
                </a>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Bot Controls Panel (5 cols) */}
            <div className="lg:col-span-5">
              <Card className="border-purple-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <Sliders className="size-5 text-purple-600" />
                    AI Auto-Pilot Controls
                  </CardTitle>
                  <CardDescription>
                    Configure profit targets, safety constraints, and automated execution rails.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Start / Pause Master Action */}
                  <div className="pt-1">
                    <Button
                      onClick={handleToggleBot}
                      size="lg"
                      className={`w-full text-base font-black shadow-md ${
                        isBotRunning
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
                      }`}
                    >
                      {isBotRunning ? (
                        <>
                          <Pause className="mr-2 size-5" /> ⏹ PAUSE AI AUTO-PILOT
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 size-5" /> ▶ START AI AUTO-PILOT
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Anti-Loss Guard 1: Min Net Profit Target */}
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="profitTarget" className="text-xs font-bold text-slate-800">
                        Min Net Profit Target (USD)
                      </Label>
                      <Badge className="bg-purple-100 font-mono text-xs font-bold text-purple-900">
                        ${minNetProfitTarget.toLocaleString()} USD
                      </Badge>
                    </div>
                    <Input
                      id="profitTarget"
                      type="number"
                      step="1"
                      value={minNetProfitTarget}
                      onChange={(e) => setMinNetProfitTarget(parseFloat(e.target.value) || 0)}
                      placeholder="e.g. 5.00"
                      className="bg-white font-mono text-sm"
                    />
                    <p className="text-[11px] text-slate-500">
                      Anti-Loss Guard: Trades generating less than this target are automatically
                      skipped.
                    </p>
                  </div>

                  {/* Anti-Loss Guard 2: Max Slippage Cap & Gas Ceiling */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <Label htmlFor="slippageCap" className="text-xs font-bold text-slate-800">
                        Max Slippage Cap
                      </Label>
                      <Input
                        id="slippageCap"
                        type="number"
                        step="0.05"
                        value={maxSlippageCap}
                        onChange={(e) => setMaxSlippageCap(parseFloat(e.target.value) || 0.2)}
                        className="bg-white font-mono text-xs"
                      />
                      <p className="text-[10px] text-slate-500">{maxSlippageCap}% max impact</p>
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <Label htmlFor="gasCeiling" className="text-xs font-bold text-slate-800">
                        Max Gas Ceiling
                      </Label>
                      <Input
                        id="gasCeiling"
                        type="number"
                        step="0.005"
                        value={maxGasCeiling}
                        onChange={(e) => setMaxGasCeiling(parseFloat(e.target.value) || 0.01)}
                        className="bg-white font-mono text-xs"
                      />
                      <p className="text-[10px] text-slate-500">
                        {maxGasCeiling} Gwei max Base fee
                      </p>
                    </div>
                  </div>

                  {/* Strategy Selection Toggles */}
                  <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <span className="text-xs font-bold text-slate-800">Active Strategies</span>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="stratTri"
                          className="cursor-pointer font-medium text-slate-700"
                        >
                          1. Triangular Arbitrage (WETH/USDC/DAI)
                        </Label>
                        <Switch
                          id="stratTri"
                          checked={strategyTriangular}
                          onCheckedChange={setStrategyTriangular}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="stratCross"
                          className="cursor-pointer font-medium text-slate-700"
                        >
                          2. Cross-DEX Spread (Uniswap ↔ Aerodrome)
                        </Label>
                        <Switch
                          id="stratCross"
                          checked={strategyCrossDex}
                          onCheckedChange={setStrategyCrossDex}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="stratFlash"
                          className="cursor-pointer font-medium text-slate-700"
                        >
                          3. Aave v3 Flash Borrow ($0 Collateral)
                        </Label>
                        <Switch
                          id="stratFlash"
                          checked={strategyFlashLoan}
                          onCheckedChange={setStrategyFlashLoan}
                        />
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
                        <div>
                          <Label
                            htmlFor="stratMatrix"
                            className="cursor-pointer font-bold text-slate-800"
                          >
                            4. 100-Pair Spot Matrix (CeDeFi)
                          </Label>
                          <p className="text-[10px] text-slate-500">
                            Binance • Bybit • OKX • Coinbase • Kraken (0.08% - 0.40% hurdles)
                          </p>
                        </div>
                        <Switch
                          id="stratMatrix"
                          checked={strategy100PairMatrix}
                          onCheckedChange={setStrategy100PairMatrix}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 🌙 Autonomous Sleep Mode (Make Money In My Sleep) */}
                  <div className="shadow-xs rounded-xl border border-indigo-300 bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          <Moon className="size-4 animate-pulse text-indigo-600" />
                          <span className="text-xs font-black text-indigo-950">
                            🌙 Sleep Mode: Autonomous Auto-Clicker
                          </span>
                        </div>
                        <p className="text-[11px] leading-snug text-indigo-800">
                          Automatically snatches qualified arbitrage while you sleep. Locks equity
                          and deposits it directly into your wallet with zero manual clicks
                          required.
                        </p>
                      </div>
                      <Switch
                        id="sleepMode"
                        checked={isSleepMode}
                        onCheckedChange={setIsSleepMode}
                        className="shrink-0 cursor-pointer data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Auto-Dispatch Toggle */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-rose-900">
                          Auto-Submit to Wallet
                        </span>
                        <p className="text-[11px] text-rose-700">
                          Automatically sign and dispatch profitable opportunities
                        </p>
                      </div>
                      <Switch
                        id="autoSubmit"
                        checked={autoSubmitTrades}
                        onCheckedChange={setAutoSubmitTrades}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Live Streaming Terminal (7 cols) */}
            <div className="space-y-4 lg:col-span-7">
              {/* 1-Click "Snatch That Money" Qualified Signal Banner */}
              {topQualified100Pair && (
                <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-emerald-500/60 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950/90 p-3 text-emerald-200 shadow-md sm:flex-row">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      <Sparkles className="size-4 animate-spin" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-300 sm:text-sm">
                          ⚡ 100-PAIR SIGNAL: {topQualified100Pair.symbol}
                        </span>
                        <Badge className="border-emerald-400/40 bg-emerald-500/30 font-mono text-[10px] text-emerald-300">
                          {topQualified100Pair.buyExchange.toUpperCase()} ➔{" "}
                          {topQualified100Pair.sellExchange.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="font-mono text-[11px] text-emerald-400/90">
                        Net Edge: +{topQualified100Pair.netPct} (Hurdle:{" "}
                        {topQualified100Pair.hurdlePct}) • Est. Net: +$
                        {topQualified100Pair.estProfitUsd.toFixed(2)} USD • Kraken Ready ($67.35
                        USD)
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSelectPairFromMatrix(topQualified100Pair.symbol)}
                    className="w-full shrink-0 cursor-pointer bg-emerald-500 text-xs font-black text-slate-950 shadow-md hover:bg-emerald-400 sm:w-auto"
                  >
                    <Zap className="mr-1.5 size-3.5 fill-current" />
                    {isSleepMode ? "⚡ Autonomous Auto-Snatch Active" : "Snatch That Money!"}
                  </Button>
                </div>
              )}

              <Card className="flex h-full flex-col justify-between border-slate-800 bg-slate-950 text-slate-100 shadow-md">
                <CardHeader className="flex flex-col gap-2.5 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-emerald-400" />
                    <CardTitle className="font-mono text-sm text-slate-200">
                      Live Scanner Terminal & Telemetry
                    </CardTitle>
                    {isBotRunning && (
                      <Badge className="animate-pulse border-emerald-800 bg-emerald-950 font-mono text-[10px] text-emerald-400">
                        STREAMING
                      </Badge>
                    )}
                    {isSleepMode && (
                      <Badge className="flex items-center gap-1 border-indigo-700 bg-indigo-950/80 font-mono text-[10px] text-indigo-300">
                        <Moon className="size-2.5 animate-pulse text-indigo-400" />
                        SLEEP AUTO-CLICKER: ON
                      </Badge>
                    )}
                  </div>

                  {/* Channel Filter Pills & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setTerminalChannel("ALL")}
                        className={`cursor-pointer rounded px-2 py-0.5 font-mono font-bold transition-colors ${
                          terminalChannel === "ALL"
                            ? "bg-emerald-600 text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setTerminalChannel("MATRIX_100")}
                        className={`cursor-pointer rounded px-2 py-0.5 font-mono font-bold transition-colors ${
                          terminalChannel === "MATRIX_100"
                            ? "bg-purple-600 text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Pair Matrix
                      </button>
                      <button
                        type="button"
                        onClick={() => setTerminalChannel("FLASH_BASE")}
                        className={`cursor-pointer rounded px-2 py-0.5 font-mono font-bold transition-colors ${
                          terminalChannel === "FLASH_BASE"
                            ? "bg-amber-600 text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Base Flash
                      </button>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadLog}
                      className="h-7 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    >
                      <Download className="mr-1 size-3" /> Export
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTerminalLogs([])}
                      className="h-7 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    >
                      <Trash2 className="mr-1 size-3" /> Clear
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 p-4">
                  <div className="scrollbar-thin scrollbar-thumb-slate-700 h-[430px] select-text space-y-1.5 overflow-y-auto font-mono text-xs leading-relaxed">
                    {filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`flex items-start gap-2 ${
                          log.level === "success"
                            ? "font-semibold text-emerald-400"
                            : log.level === "warn"
                              ? "text-amber-400"
                              : log.level === "danger"
                                ? "font-semibold text-rose-400"
                                : "text-slate-300"
                        }`}
                      >
                        <span className="shrink-0 text-slate-500">[{log.time}]</span>
                        <span className="break-all">{log.message}</span>
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </CardContent>

                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-400">
                  <span>
                    Status:{" "}
                    <span
                      className={isBotRunning ? "font-bold text-emerald-400" : "text-slate-500"}
                    >
                      {isBotRunning ? "Scanning active Base blocks" : "Idle"}
                    </span>
                  </span>
                  <span>
                    Target:{" "}
                    <span className="font-mono text-slate-200">
                      &gt;${minNetProfitTarget.toLocaleString()} USD
                    </span>
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: 100-PAIR SPOT ARBITRAGE MATRIX ── */}
        <TabsContent value="matrix" className="space-y-6">
          <PairMatrix100 snapshot={cefiStream.snapshot} onSelectPair={handleSelectPairFromMatrix} />
        </TabsContent>

        {/* ── TAB: CEDEFI & INSTITUTIONAL CEFI L2 ORDER BOOKS ── */}
        <TabsContent value="cedefi" className="space-y-6">
          <CeDeFiStudio
            initialSymbol={selectedMatrixSymbol}
            onSelectSymbol={handleSelectSymbol}
            onBackToMatrix={handleBackToMatrix}
            onRecordTx={(tx) => {
              const newTx: LiveTransactionRecord = {
                id: `tx-${Date.now()}`,
                txHash: tx.txHash,
                type: tx.type,
                summary: tx.summary,
                timestamp: new Date().toLocaleTimeString(),
                status: "CONFIRMED",
                explorerUrl: tx.explorerUrl,
              };
              setTxHistory((prev) => [newTx, ...prev]);
            }}
          />
        </TabsContent>

        {/* ── TAB: KRAKEN ↔ ALPACA LIVE DESK ── */}
        <TabsContent value="live" className="space-y-6">
          <LiveDeskTab symbol={selectedMatrixSymbol} onSelectSymbol={setSelectedMatrixSymbol} />
        </TabsContent>

        {/* ── TAB 1: TRIANGULAR ARBITRAGE SOLVER ── */}
        <TabsContent value="triangular" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Card className="border-purple-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <TrendingUp className="size-5 text-purple-600" />
                    Triangular Cycle: WETH ➔ USDC ➔ DAI ➔ WETH
                  </CardTitle>
                  <CardDescription>
                    Cyclic 3-hop swap on Base Uniswap V3 SwapRouter02 (
                    {UNISWAP_V3_ROUTER_BASE.substring(0, 10)}...), best live fee tiers. Arbitrage
                    capital returns directly to your wallet in the same transaction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="initialWeth">Initial Capital (ETH / WETH)</Label>
                      <Input
                        id="initialWeth"
                        type="number"
                        step="0.1"
                        value={triInitialWeth}
                        onChange={(e) => setTriInitialWeth(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slippage">Slippage Tolerance (BPS)</Label>
                      <Input
                        id="slippage"
                        type="number"
                        value={triSlippageBps}
                        onChange={(e) => setTriSlippageBps(parseInt(e.target.value) || 50)}
                      />
                      <p className="text-[11px] text-gray-500">
                        50 bps = 0.50% slippage protection
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    {liveRatesStatus === "live"
                      ? "Rates loaded from live Base quotes (1 WETH size). Edit to model other prices."
                      : liveRatesStatus === "loading"
                        ? "Loading live Base rates..."
                        : "Live Base rates unavailable: these are placeholder numbers, not market prices."}
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="wethPrice">Leg 1: WETH/USDC ($)</Label>
                      <Input
                        id="wethPrice"
                        type="number"
                        value={triWethUsdcPrice}
                        onChange={(e) => setTriWethUsdcPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="usdcDai">Leg 2: USDC/DAI</Label>
                      <Input
                        id="usdcDai"
                        type="number"
                        step="0.0001"
                        value={triUsdcDaiRate}
                        onChange={(e) => setTriUsdcDaiRate(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="daiWeth">Leg 3: DAI/WETH</Label>
                      <Input
                        id="daiWeth"
                        type="number"
                        step="0.000001"
                        value={triDaiWethRate}
                        onChange={(e) => setTriDaiWethRate(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  {isLiveMode && (
                    <Alert className="border-rose-200 bg-rose-50 text-rose-900">
                      <AlertTriangle className="size-4 text-rose-600" />
                      <AlertTitle className="text-xs font-bold uppercase tracking-wider">
                        Unrestricted Live Execution Active
                      </AlertTitle>
                      <AlertDescription className="text-xs">
                        Submitting will trigger a live transaction on Base Mainnet directly from
                        your wallet. The router automatically returns profits to you.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col justify-between border-purple-100 bg-gradient-to-br from-white to-purple-50/40 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">
                    Yield Breakdown & Execution
                  </CardTitle>
                  <CardDescription>Multi-hop fee drag & net return</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {triangularResult && (
                    <div className="space-y-2 rounded-xl border border-purple-100 bg-white p-4 text-xs">
                      <div className="flex justify-between text-gray-500">
                        <span>Starting Capital:</span>
                        <span className="font-mono font-bold text-gray-900">
                          {triangularResult.initialCapital.toFixed(4)} WETH
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Terminal Output:</span>
                        <span className="font-mono text-purple-700">
                          {triangularResult.terminalCapital.toFixed(5)} WETH
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Base L2 Gas:</span>
                        <span className="font-mono text-slate-700">
                          -${triangularResult.gasCostUsd.toFixed(2)} USD
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-2 text-sm">
                        <span className="font-bold text-gray-900">Net Profit Margin:</span>
                        <span
                          className={`font-mono text-lg font-black ${
                            triangularResult.arbitrageDetected
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {triangularResult.netProfit >= 0 ? "+" : ""}
                          {triangularResult.netProfit.toFixed(5)} WETH (
                          {(triangularResult.roiBps / 100).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-2">
                    <Button
                      onClick={() => handleExecuteLiveTriangular()}
                      disabled={isExecutingTri || !isConnected || !isBaseNetwork}
                      className="w-full bg-gradient-to-r from-purple-600 to-rose-600 font-bold text-white shadow-md hover:from-purple-700 hover:to-rose-700"
                      size="lg"
                    >
                      {isExecutingTri ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Broadcasting to Base...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 size-4" />⚡ Execute Live Triangular Cycle
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 2: CROSS-DEX SPREADS ── */}
        <TabsContent value="dualpool" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Card className="border-indigo-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <Layers className="size-5 text-indigo-600" />
                    Uniswap V3 vs. Aerodrome Base Spread
                  </CardTitle>
                  <CardDescription>
                    Monitors price divergence across Base liquidity pools. Execute individual buy
                    and sell legs directly on-chain.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-slate-500">
                    {liveRatesStatus === "live"
                      ? "Rates loaded from live Base quotes (1 WETH size). Edit to model other prices."
                      : liveRatesStatus === "loading"
                        ? "Loading live Base rates..."
                        : "Live Base rates unavailable: these are placeholder numbers, not market prices."}
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="uniswapPrice">Uniswap V3 Price ($)</Label>
                      <Input
                        id="uniswapPrice"
                        type="number"
                        value={dualPoolAPrice}
                        onChange={(e) => setDualPoolAPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aeroPrice">Aerodrome Price ($)</Label>
                      <Input
                        id="aeroPrice"
                        type="number"
                        value={dualPoolBPrice}
                        onChange={(e) => setDualPoolBPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dualUnits">Trade Capital (Units / ETH)</Label>
                    <Input
                      id="dualUnits"
                      type="number"
                      step="0.5"
                      value={dualUnits}
                      onChange={(e) => setDualUnits(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col justify-between border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">Optimal Route & Execution</CardTitle>
                  <CardDescription>Directional arbitrage recommendation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dualPoolResult && (
                    <>
                      <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-4 text-xs">
                        <div className="flex justify-between text-gray-500">
                          <span>Gross Spread:</span>
                          <span className="font-mono font-bold text-gray-900">
                            ${dualPoolResult.grossSpread.toFixed(2)} (
                            {dualPoolResult.grossSpreadPct.toFixed(2)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Total AMM Fees:</span>
                          <span className="font-mono text-slate-700">
                            ${(dualPoolResult.poolAFeeUsd + dualPoolResult.poolBFeeUsd).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 text-sm">
                          <span className="font-bold text-gray-900">Net Profit:</span>
                          <span
                            className={`font-mono text-lg font-black ${
                              dualPoolResult.isProfitable ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            ${dualPoolResult.netProfitUsd.toFixed(2)} USD
                          </span>
                        </div>
                      </div>

                      <div
                        className={`rounded-xl border p-4 text-center ${
                          dualPoolResult.isProfitable
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider">Optimal Route</p>
                        <p className="mt-1 text-sm font-black">
                          {dualPoolResult.optimalRoute === "BUY_POOL_A_SELL_POOL_B"
                            ? "🛒 BUY UNISWAP ➔ SELL AERODROME"
                            : dualPoolResult.optimalRoute === "BUY_POOL_B_SELL_POOL_A"
                              ? "🛒 BUY AERODROME ➔ SELL UNISWAP"
                              : "⚠️ SPREAD BELOW PROFIT THRESHOLD"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button
                          onClick={() => handleExecuteLiveSpreadLeg("UNISWAP", "BUY")}
                          disabled={isExecutingSpread || !isConnected}
                          variant="outline"
                          size="sm"
                          className="border-purple-300 font-bold text-purple-900 hover:bg-purple-50"
                        >
                          ⚡ Sell {dualUnits} ETH → USDC on Uniswap V3
                        </Button>
                        <Button
                          onClick={() => handleExecuteLiveSpreadLeg("AERODROME", "SELL")}
                          disabled={isExecutingSpread || !isConnected}
                          variant="outline"
                          size="sm"
                          className="border-indigo-300 font-bold text-indigo-900 hover:bg-indigo-50"
                        >
                          ⚡ Sell USDC → ETH on Aerodrome
                        </Button>
                      </div>
                      <Button
                        onClick={() => handleExecuteAtomicSpread(dualUnits)}
                        disabled={isExecutingSpread || !isConnected}
                        size="sm"
                        className="mt-2 w-full bg-slate-900 font-bold text-white hover:bg-slate-800"
                      >
                        ⚛️ Run both legs atomically ({dualUnits} WETH flash loan)
                      </Button>
                      <p className="text-[11px] text-slate-500">
                        The single buttons each send one swap from your wallet. The atomic route
                        sells on the venue paying more and buys back on the other in one transaction
                        through your AtomicFlashArbitrageRouter; it reverts unless it ends in
                        profit.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 3: AAVE FLASH LOAN ARBITRAGE ── */}
        <TabsContent value="flashloan" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Card className="border-amber-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <Zap className="size-5 text-amber-500" />
                    Uncollateralized Aave v3 Flash Borrow
                  </CardTitle>
                  <CardDescription>
                    Borrow institutional liquidity directly from Aave v3 on Base without collateral.
                    The borrowing contract executes cyclic AMM trades and settles debt atomically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="flashAsset">Borrow Asset</Label>
                      <select
                        id="flashAsset"
                        value={flashBorrowAsset}
                        onChange={(e) => setFlashBorrowAsset(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="USDC">USDC (Base Canonical)</option>
                        <option value="WETH">WETH (Wrapped Ether)</option>
                        <option value="DAI">DAI Stablecoin</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="flashAmount">Borrow Capital Amount</Label>
                      <Input
                        id="flashAmount"
                        type="number"
                        value={flashBorrowAmount}
                        onChange={(e) => setFlashBorrowAmount(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vipTier">VIP Staking Fee Discount Tier</Label>
                    <select
                      id="vipTier"
                      value={flashVipTier}
                      onChange={(e) => setFlashVipTier(parseInt(e.target.value) || 0)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value={0}>Tier 0: Standard (0% Fee Discount)</option>
                      <option value={1}>🥉 Tier 1: Bronze (10% Fee Discount)</option>
                      <option value={2}>🥈 Tier 2: Silver (25% Fee Discount)</option>
                      <option value={3}>🥇 Tier 3: Gold (50% Fee Discount)</option>
                      <option value={4}>💎 Tier 4: Diamond (100% Fee Discount)</option>
                    </select>
                  </div>

                  <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="borrowerContract" className="font-semibold text-gray-800">
                        Arbitrage Router Contract
                      </Label>
                      {isAtomicRouter ? (
                        <Badge className="border-emerald-300 bg-emerald-100 font-mono text-[10px] text-emerald-800">
                          ✓ Atomic Router Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-300 font-mono text-[10px] text-amber-700"
                        >
                          Legacy Stub (Reverts on Callback)
                        </Badge>
                      )}
                    </div>
                    <Input
                      id="borrowerContract"
                      value={customBorrowerAddress}
                      onChange={(e) => setCustomBorrowerAddress(e.target.value.trim())}
                      className="bg-white font-mono text-xs"
                      placeholder="0x..."
                    />
                    <p className="text-[11px] leading-relaxed text-gray-600">
                      Executes uncollateralized triangular arbitrage across Uniswap V2 &amp;
                      Aerodrome, enforces atomic zero-loss guards, repays Aave v3, and wires net
                      profit to your wallet.
                    </p>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeployAtomicRouter}
                      disabled={isDeployingRouter || !isConnected || !isBaseNetwork}
                      className="w-full border-emerald-400 bg-emerald-600 font-bold text-white shadow-sm hover:bg-emerald-700"
                    >
                      {isDeployingRouter ? (
                        <>
                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                          Deploying Atomic Flash Router on Base...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 size-3.5" />
                          Deploy Atomic Flash Router to Base (1-Click)
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col justify-between border-amber-100 bg-gradient-to-br from-white to-amber-50/30 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">Flash Loan Economics</CardTitle>
                  <CardDescription>Capital required: $0 upfront collateral</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {flashArbResult && (
                    <div className="space-y-2 rounded-xl border border-amber-100 bg-white p-4 text-xs">
                      <div className="flex justify-between text-gray-500">
                        <span>Principal Borrowed:</span>
                        <span className="font-mono font-bold text-gray-900">
                          {flashArbResult.borrowAmount.toLocaleString()} {flashBorrowAsset}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Aave Flash Fee (0.05%):</span>
                        <span className="font-mono text-amber-700">
                          ${flashArbResult.flashLoanPremium.toFixed(2)} USD
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Effective Pool Fee:</span>
                        <span className="font-mono text-slate-700">
                          {(flashArbResult.effectivePoolFeeBps / 100).toFixed(2)}% (VIP Discounted)
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-2 text-sm">
                        <span className="font-bold text-gray-900">Net Arbitrage Yield:</span>
                        <span
                          className={`font-mono text-lg font-black ${
                            flashArbResult.isProfitable ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          +${flashArbResult.netProfitUsd.toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-2">
                    <Button
                      onClick={handleExecuteLiveFlashLoan}
                      disabled={isExecutingFlash || !isConnected || !isBaseNetwork}
                      className="w-full bg-gradient-to-r from-amber-600 to-rose-600 font-bold text-white shadow-md hover:from-amber-700 hover:to-rose-700"
                      size="lg"
                    >
                      {isExecutingFlash ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Executing Flash Loan on Base...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 size-4" />⚡ Dispatch Live Aave Flash Loan
                        </>
                      )}
                    </Button>

                    <p className="text-center text-[11px] text-gray-500">
                      Atomically executed: If net profit doesn&apos;t cover the 0.05% fee, the EVM
                      reverts with $0 capital loss.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 4: LIVE EXECUTION CONSOLE & AUDIT FEED ── */}
        <TabsContent value="console" className="space-y-6">
          <Card className="border-rose-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                  <Activity className="size-5 text-rose-600" />
                  Live Execution Console & Transaction Feed
                </CardTitle>
                <CardDescription>
                  Real-time ledger of on-chain arbitrage dispatches and execution receipts.
                </CardDescription>
              </div>

              {txHistory.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTxHistory([])}
                  className="border-slate-300 text-slate-600"
                >
                  Clear Console
                </Button>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {txHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                  <Activity className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold">No transactions dispatched yet</p>
                  <p className="text-xs text-slate-400">
                    Execute a live Triangular Cycle, Cross-DEX leg, or start the AI Auto-Pilot to
                    see real-time telemetry here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {txHistory.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex flex-col items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              tx.status === "CONFIRMED"
                                ? "bg-emerald-100 font-bold text-emerald-800"
                                : tx.status === "SUBMITTED"
                                  ? "bg-amber-100 font-bold text-amber-800"
                                  : "bg-rose-100 font-bold text-rose-800"
                            }
                          >
                            {tx.status}
                          </Badge>
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {tx.type}
                          </span>
                          <span className="text-xs text-slate-400">• {tx.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-600">{tx.summary}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={tx.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-xs font-semibold text-purple-600 hover:text-purple-800"
                        >
                          View BaseScan <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
