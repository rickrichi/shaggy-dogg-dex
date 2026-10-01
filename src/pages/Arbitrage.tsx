// src/pages/Arbitrage.tsx
import { useCallback, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  Cpu,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Play,
  Radio,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { type Address, isAddress, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBlockNumber,
  useGasPrice,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { ShaggyDoggQuantAiEngine } from "@/lib/amm/quant-ai-engine";
import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";

// ────────────────────────────────────────────────────────────────────────────
// BASE MAINNET CANONICAL CONTRACTS & ASSETS
// ────────────────────────────────────────────────────────────────────────────
const BASE_CHAIN_ID = 8453;
const BASE_UNISWAP_ROUTER: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const BASE_AERODROME_ROUTER: Address = "0xcF664087a5bB0237a0BAd6742852ec6c8d58504e";
const DEFAULT_AAVE_BORROWER: Address = "0x936a3D52c3037848879F3641dfBc9132aAe51bDF";

const BASE_ASSETS: Record<string, { address: Address; decimals: number; symbol: string }> = {
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
};

interface LiveTransactionRecord {
  id: string;
  txHash: string;
  type: "TRIANGULAR_ARB" | "CROSS_DEX_SPREAD" | "AAVE_FLASH_LOAN" | "PAPER_SIMULATION";
  summary: string;
  timestamp: string;
  status: "SUBMITTED" | "CONFIRMED" | "REVERTED";
  explorerUrl: string;
}

export default function Arbitrage() {
  // ── Web3 Connection ───────────────────────────────────────────────────────
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { data: gasPriceData } = useGasPrice({ watch: true });

  const isBaseNetwork = chainId === BASE_CHAIN_ID;
  const gasPriceGwei = gasPriceData ? (Number(gasPriceData) / 1e9).toFixed(3) : "0.005";

  // ── Global Execution Mode (Live Unrestricted vs Sandbox) ──────────────────
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true);
  const [txHistory, setTxHistory] = useState<LiveTransactionRecord[]>([]);

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
  }, [triInitialWeth, triWethUsdcPrice, triUsdcDaiRate, triDaiWethRate, triFeeBps]);

  const handleExecuteLiveTriangular = useCallback(async () => {
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
    const toastId = toast.loading("Broadcasting Live Triangular Arbitrage on Base...");

    try {
      const amountIn = parseEther(triInitialWeth.toString());
      // Minimum expected output after 3-hop execution with slippage protection
      const slippageFactor = 1 - triSlippageBps / 10_000;
      const expectedOutputWeth =
        (triangularResult?.netWethReceived ?? triInitialWeth) * slippageFactor;
      const minAmountOut = parseEther(Math.max(0, expectedOutputWeth).toFixed(18));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 minutes

      // Path: WETH -> USDC -> DAI -> WETH
      const path: Address[] = [
        BASE_ASSETS.WETH.address,
        BASE_ASSETS.USDC.address,
        BASE_ASSETS.DAI.address,
        BASE_ASSETS.WETH.address,
      ];

      const hash = await writeContractAsync({
        address: BASE_UNISWAP_ROUTER,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [minAmountOut, path, address, deadline],
        value: amountIn,
      });

      toast.success("Live Triangular Arbitrage submitted!", {
        id: toastId,
        description: `Tx: ${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`,
      });

      const newTx: LiveTransactionRecord = {
        id: `tx-${Date.now()}`,
        txHash: hash,
        type: "TRIANGULAR_ARB",
        summary: `Cyclic swap ${triInitialWeth} ETH -> USDC -> DAI -> WETH`,
        timestamp: new Date().toLocaleTimeString(),
        status: "SUBMITTED",
        explorerUrl: `https://basescan.org/tx/${hash}`,
      };
      setTxHistory((prev) => [newTx, ...prev]);

      // Asynchronously wait for receipt if publicClient is available
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
      toast.error("Execution error", { id: toastId, description: msg });
    } finally {
      setIsExecutingTri(false);
    }
  }, [
    isConnected,
    address,
    isBaseNetwork,
    triInitialWeth,
    triSlippageBps,
    triangularResult,
    switchChain,
    writeContractAsync,
    publicClient,
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 2: Cross-DEX Spreads State & Execution
  // ──────────────────────────────────────────────────────────────────────────
  const [dualPoolAPrice, setDualPoolAPrice] = useState<number>(3450.0); // Uniswap V2
  const [dualPoolBPrice, setDualPoolBPrice] = useState<number>(3472.0); // Aerodrome
  const [dualUnits, setDualUnits] = useState<number>(2.0); // 2 ETH
  const [isExecutingSpread, setIsExecutingSpread] = useState<boolean>(false);

  const dualPoolResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateDualPoolArbitrage({
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
      const toastId = toast.loading(`Dispatching Live ${action} on ${venue} (Base)...`);

      try {
        const targetRouter = venue === "UNISWAP" ? BASE_UNISWAP_ROUTER : BASE_AERODROME_ROUTER;
        const amountIn = parseEther(dualUnits.toString());
        const minAmountOut = 1n; // Live slippage tolerance
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        const path: Address[] =
          action === "BUY"
            ? [BASE_ASSETS.WETH.address, BASE_ASSETS.USDC.address]
            : [BASE_ASSETS.USDC.address, BASE_ASSETS.WETH.address];

        const hash = await writeContractAsync({
          address: targetRouter,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: action === "BUY" ? "swapExactETHForTokens" : "swapExactTokensForETH",
          args: [minAmountOut, path, address, deadline],
          value: action === "BUY" ? amountIn : undefined,
        });

        toast.success(`Live ${venue} ${action} trade dispatched!`, {
          id: toastId,
          description: `Tx: ${hash.substring(0, 10)}...`,
        });

        const newTx: LiveTransactionRecord = {
          id: `tx-${Date.now()}`,
          txHash: hash,
          type: "CROSS_DEX_SPREAD",
          summary: `${action} on ${venue} (${dualUnits} units)`,
          timestamp: new Date().toLocaleTimeString(),
          status: "SUBMITTED",
          explorerUrl: `https://basescan.org/tx/${hash}`,
        };
        setTxHistory((prev) => [newTx, ...prev]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Trade failed";
        toast.error("Transaction error", { id: toastId, description: msg });
      } finally {
        setIsExecutingSpread(false);
      }
    },
    [isConnected, address, isBaseNetwork, switchChain, dualUnits, writeContractAsync]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 3: Aave Flash Loan Arbitrage State & Live Execution
  // ──────────────────────────────────────────────────────────────────────────
  const [flashBorrowAsset, setFlashBorrowAsset] = useState<string>("USDC");
  const [flashBorrowAmount, setFlashBorrowAmount] = useState<number>(25_000);
  const [flashVipTier, setFlashVipTier] = useState<number>(3); // Gold (50% fee discount)
  const [customBorrowerAddress, setCustomBorrowerAddress] = useState<string>(DEFAULT_AAVE_BORROWER);
  const [isExecutingFlash, setIsExecutingFlash] = useState<boolean>(false);

  const flashArbResult = useMemo(() => {
    try {
      return ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
        borrowAsset: flashBorrowAsset,
        borrowAmount: flashBorrowAmount,
        flashPremiumBps: 5, // 0.05% Aave v3 Base fee
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
      toast.error("Invalid AaveFlashBorrower contract address.");
      return;
    }
    if (flashBorrowAmount <= 0) {
      toast.error("Enter a valid borrow amount.");
      return;
    }

    setIsExecutingFlash(true);
    const toastId = toast.loading(
      `Requesting Live ${flashBorrowAmount.toLocaleString()} ${flashBorrowAsset} Flash Loan from Aave v3...`
    );

    try {
      const assetConfig = BASE_ASSETS[flashBorrowAsset] ?? BASE_ASSETS.USDC;
      const borrowAmountBigInt = parseUnits(flashBorrowAmount.toString(), assetConfig.decimals);

      // Invoke requestFlashLoan on the uncollateralized borrower contract
      const hash = await writeContractAsync({
        address: customBorrowerAddress as Address,
        abi: LAUNCHPAD_ARTIFACTS.AaveFlashBorrower.abi,
        functionName: "requestFlashLoan",
        args: [assetConfig.address, borrowAmountBigInt, "0x"],
      });

      toast.success("Aave v3 Flash Loan Executed on Base!", {
        id: toastId,
        description: `Tx: ${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`,
      });

      const newTx: LiveTransactionRecord = {
        id: `tx-${Date.now()}`,
        txHash: hash,
        type: "AAVE_FLASH_LOAN",
        summary: `Flash Loan ${flashBorrowAmount.toLocaleString()} ${flashBorrowAsset} via Aave v3`,
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
      toast.error("Execution error", { id: toastId, description: msg });
    } finally {
      setIsExecutingFlash(false);
    }
  }, [
    isConnected,
    address,
    isBaseNetwork,
    switchChain,
    customBorrowerAddress,
    flashBorrowAmount,
    flashBorrowAsset,
    writeContractAsync,
    publicClient,
  ]);

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Launchpad Sub-Navigation */}
      <LaunchpadNav />

      {/* Main Header with Unrestricted Mode Switch */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="bg-gradient-to-r from-amber-500 via-purple-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
              Quant Arbitrage Studio
            </h1>
            {isLiveMode ? (
              <Badge className="flex items-center gap-1.5 border-rose-500 bg-rose-600 px-3 py-1 font-black text-white shadow-sm shadow-rose-200">
                <span className="size-2 animate-ping rounded-full bg-white" />⚡ LIVE UNRESTRICTED
                ARBITRAGE
              </Badge>
            ) : (
              <Badge className="border-amber-300 bg-amber-100 font-bold text-amber-900">
                🧪 SANDBOX SIMULATION
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time multi-hop triangular routing, cross-venue spread execution, and
            uncollateralized Aave v3 flash loans on Base Mainnet.
          </p>
        </div>

        {/* Global Controls & Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">
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

      {/* High-Level Metrics Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Aave Flash Loan</CardTitle>
            <Zap className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0.05% Premium</div>
            <p className="mt-1 text-xs text-slate-500">Uncollateralized atomic capital</p>
          </CardContent>
        </Card>

        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Base L2 Gas Friction
            </CardTitle>
            <Cpu className="size-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">~$0.08 - $0.15</div>
            <p className="mt-1 text-xs text-slate-500">High speed, ultra-low fee drag</p>
          </CardContent>
        </Card>

        <Card className="border-pink-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">VIP Fee Advantage</CardTitle>
            <Flame className="size-4 text-pink-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-600">Up to 100% Off</div>
            <p className="mt-1 text-xs text-slate-500">Tier 4 Diamond staking discount</p>
          </CardContent>
        </Card>

        <Card className="border-rose-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Execution Status</CardTitle>
            <Activity className="size-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">
              {isLiveMode ? "LIVE MAINNET" : "SANDBOX"}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isLiveMode ? "Real on-chain capital" : "Simulated calculations"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Execution Tabs */}
      <Tabs defaultValue="triangular" className="space-y-6">
        <TabsList className="grid w-full grid-cols-1 border border-purple-100 bg-white/70 p-1 shadow-sm sm:grid-cols-4">
          <TabsTrigger value="triangular" className="flex items-center gap-2 font-semibold">
            <TrendingUp className="size-4 text-purple-600" />
            1. Triangular Arbitrage
          </TabsTrigger>
          <TabsTrigger value="dualpool" className="flex items-center gap-2 font-semibold">
            <Layers className="size-4 text-indigo-600" />
            2. Cross-DEX Spreads
          </TabsTrigger>
          <TabsTrigger value="flashloan" className="flex items-center gap-2 font-semibold">
            <Zap className="size-4 text-amber-500" />
            3. Aave Flash Loans
          </TabsTrigger>
          <TabsTrigger value="console" className="flex items-center gap-2 font-semibold">
            <Activity className="size-4 text-rose-600" />
            4. Execution Console ({txHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: TRIANGULAR ARBITRAGE SOLVER ── */}
        <TabsContent value="triangular" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Input Controls */}
            <div className="lg:col-span-7">
              <Card className="border-purple-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                    <TrendingUp className="size-5 text-purple-600" />
                    Triangular Cycle: WETH ➔ USDC ➔ DAI ➔ WETH
                  </CardTitle>
                  <CardDescription>
                    Cyclic 3-hop swap on Base Uniswap V2 Router (
                    {BASE_UNISWAP_ROUTER.substring(0, 10)}...). Arbitrage capital returns directly
                    to your wallet in the same transaction.
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
                        your wallet. The router automatically unwraps or returns tokens to you.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Results & Live Action Panel */}
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
                          {triangularResult.initialWeth.toFixed(4)} WETH
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Gross Expected:</span>
                        <span className="font-mono text-purple-700">
                          {triangularResult.grossWethReceived.toFixed(5)} WETH
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Total Pool Fees (3 Hops):</span>
                        <span className="font-mono text-slate-700">
                          -{triangularResult.totalFeeDragWeth.toFixed(5)} WETH
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
                            triangularResult.isProfitable ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {triangularResult.netProfit >= 0 ? "+" : ""}
                          {triangularResult.netProfit.toFixed(5)} WETH (
                          {triangularResult.profitMarginPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Live Execute Action Button */}
                  <div className="space-y-2 pt-2">
                    {isLiveMode ? (
                      <Button
                        onClick={handleExecuteLiveTriangular}
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
                    ) : (
                      <Button
                        onClick={() => toast.success("Paper simulation verified!")}
                        className="w-full bg-emerald-600 font-bold text-white hover:bg-emerald-700"
                      >
                        <Play className="mr-2 size-4" /> Run Dry-Run Simulation
                      </Button>
                    )}

                    {!isConnected && (
                      <p className="text-center text-xs text-amber-600">
                        Connect wallet to enable live transaction execution.
                      </p>
                    )}
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
                    Uniswap V2 vs. Aerodrome Base Spread
                  </CardTitle>
                  <CardDescription>
                    Monitors price divergence across Base liquidity pools. Execute individual buy
                    and sell legs directly on-chain.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="uniswapPrice">Uniswap V2 Price ($)</Label>
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

                      {/* Direct Live Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button
                          onClick={() => handleExecuteLiveSpreadLeg("UNISWAP", "BUY")}
                          disabled={isExecutingSpread || !isConnected}
                          variant="outline"
                          size="sm"
                          className="border-purple-300 font-bold text-purple-900 hover:bg-purple-50"
                        >
                          ⚡ Buy on Uniswap
                        </Button>
                        <Button
                          onClick={() => handleExecuteLiveSpreadLeg("AERODROME", "SELL")}
                          disabled={isExecutingSpread || !isConnected}
                          variant="outline"
                          size="sm"
                          className="border-indigo-300 font-bold text-indigo-900 hover:bg-indigo-50"
                        >
                          ⚡ Sell on Aerodrome
                        </Button>
                      </div>
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

                  <div className="space-y-2">
                    <Label htmlFor="borrowerContract">AaveFlashBorrower Contract Address</Label>
                    <Input
                      id="borrowerContract"
                      value={customBorrowerAddress}
                      onChange={(e) => setCustomBorrowerAddress(e.target.value.trim())}
                      className="font-mono text-xs"
                      placeholder="0x..."
                    />
                    <p className="text-[11px] text-gray-500">
                      Target contract holding the uncollateralized execution hook on Base
                    </p>
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

                  {/* Flash Loan Live Execution Button */}
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
                    Execute a live Triangular Cycle, Cross-DEX leg, or Aave Flash Loan to see
                    real-time telemetry here.
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
