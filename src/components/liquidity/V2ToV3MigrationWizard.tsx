// src/components/liquidity/V2ToV3MigrationWizard.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
  Unlock,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Address,
  erc20Abi,
  formatUnits,
  type Hash,
  maxUint256,
  parseAbi,
  parseUnits,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNISWAP_V2_PAIR_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { getUniswapV2Router } from "@/config/contracts";
import { quoteForInput } from "@/lib/amm/liquidity-input";
import { positiveAmount } from "@/lib/amm/own-dex";
import {
  buildV3MintCall,
  NONFUNGIBLE_POSITION_MANAGER_BASE,
  quoteV3FullRangeCounterparty,
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_FACTORY_BASE,
  UNISWAP_V3_POOL_ABI,
  V3_FEE_TIERS,
  WETH_BASE,
} from "@/lib/amm/uniswap-v3";

export interface KnownMigrationPair {
  readonly id: string;
  readonly name: string;
  readonly tokenSymbol: string;
  readonly tokenAddress: Address;
  readonly v2PairAddress: Address; // zeroAddress when V3-native
  readonly decimals: number;
  readonly defaultFeeTier: number;
  readonly tag?: string;
  readonly stakingEligible?: boolean;
}

export const KNOWN_V3_PAIRS: readonly KnownMigrationPair[] = [
  {
    id: "mrwd-weth",
    name: "MRWD / WETH",
    tokenSymbol: "MRWD",
    tokenAddress: "0xC17227AAa33C54634B6cE7AD0bf33A156563c179",
    v2PairAddress: zeroAddress,
    decimals: 18,
    defaultFeeTier: 3000,
    tag: "Q1 LP Staking",
    stakingEligible: true,
  },
  {
    id: "sd-weth",
    name: "SD / WETH",
    tokenSymbol: "SD",
    tokenAddress: "0x051c758521971f5c5a84edaf18eea12854375469",
    v2PairAddress: "0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917",
    decimals: 18,
    defaultFeeTier: 10000,
    tag: "V2 + V3 Live",
  },
  {
    id: "fba-weth",
    name: "FBA / WETH",
    tokenSymbol: "FBA",
    tokenAddress: "0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263",
    v2PairAddress: "0x916ed75C0636Ddd7404DB79B7dc5CF80e8446c47",
    decimals: 18,
    defaultFeeTier: 10000,
    tag: "V2 Migration",
  },
  {
    id: "dsnak-weth",
    name: "DSNAK / WETH",
    tokenSymbol: "DSNAK",
    tokenAddress: "0x3F6eB1ddBFc665A8760BC77d00125bA486871CfB",
    v2PairAddress: zeroAddress,
    decimals: 18,
    defaultFeeTier: 10000,
    tag: "V3 Live",
  },
  {
    id: "usdc-weth",
    name: "USDC / WETH",
    tokenSymbol: "USDC",
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    v2PairAddress: "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C",
    decimals: 6,
    defaultFeeTier: 500,
    tag: "Core Pair",
  },
];

const GAS_BUFFER_WEI = parseUnits("0.0005", 18);

function formatCompact(value: bigint, decimals: number, maxFraction = 4): string {
  const num = Number(formatUnits(value, decimals));
  if (!Number.isFinite(num) || num === 0) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num < 0.0001) return "<0.0001";
  return num.toLocaleString(undefined, { maximumFractionDigits: maxFraction });
}

interface V2ToV3MigrationWizardProps {
  externalPairId?: string | null;
  onPairChange?: (pairId: string) => void;
}

export function V2ToV3MigrationWizard({
  externalPairId,
  onPairChange,
}: V2ToV3MigrationWizardProps = {}) {
  const { address: userAddress, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();

  const [selectedPairId, setSelectedPairId] = useState<string>(() => {
    if (externalPairId && KNOWN_V3_PAIRS.some((p) => p.id === externalPairId)) {
      return externalPairId;
    }
    return "sd-weth";
  });
  const activePair = useMemo(
    () => KNOWN_V3_PAIRS.find((p) => p.id === selectedPairId) ?? KNOWN_V3_PAIRS[0]!,
    [selectedPairId]
  );

  const [feeTier, setFeeTier] = useState<number>(() => activePair.defaultFeeTier);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stepNotice, setStepNotice] = useState<string>("");
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [depositToken, setDepositToken] = useState("");
  const [depositWeth, setDepositWeth] = useState("");
  const [autoSyncRatio, setAutoSyncRatio] = useState(true);
  const [v2RemovedInSession, setV2RemovedInSession] = useState(false);

  // Sync external quick-pool selection from parent
  useEffect(() => {
    if (!externalPairId) return;
    const match = KNOWN_V3_PAIRS.find((p) => p.id === externalPairId);
    if (match && match.id !== selectedPairId) {
      setSelectedPairId(match.id);
      setFeeTier(match.defaultFeeTier);
      setDepositToken("");
      setDepositWeth("");
      setV2RemovedInSession(false);
    }
  }, [externalPairId, selectedPairId]);

  // Live on-chain pool + user state
  const [v2LpBalance, setV2LpBalance] = useState<bigint>(0n);
  const [v2TotalSupply, setV2TotalSupply] = useState<bigint>(0n);
  const [v2Reserves, setV2Reserves] = useState<{ reserve0: bigint; reserve1: bigint }>({
    reserve0: 0n,
    reserve1: 0n,
  });
  const [v2Token0, setV2Token0] = useState<Address>(zeroAddress);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [wethBalance, setWethBalance] = useState<bigint>(0n);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [v3PoolExists, setV3PoolExists] = useState<boolean>(false);
  const [v3PoolAddress, setV3PoolAddress] = useState<Address | null>(null);
  const [v3SqrtPriceX96, setV3SqrtPriceX96] = useState<bigint>(0n);
  const [v3ActiveLiquidity, setV3ActiveLiquidity] = useState<bigint>(0n);

  const hasV2Pair = activePair.v2PairAddress !== zeroAddress;
  const v2Router = useMemo(() => getUniswapV2Router(8453), []);
  const scope = useRef("");
  const walletScope = `${userAddress ?? "public"}:${chainId ?? base.id}:${selectedPairId}:${feeTier}`;
  scope.current = walletScope;

  const assertWallet = async () => {
    if (
      !walletClient ||
      scope.current !== walletScope ||
      (await walletClient.getChainId()) !== base.id ||
      (await walletClient.getAddresses())[0]?.toLowerCase() !== userAddress?.toLowerCase()
    ) {
      throw new Error("Wallet or migration selection changed. Review the amounts again.");
    }
  };

  const openWalletConnect = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("shaggy:open-wallet-connect", { detail: { view: "list" } })
    );
  }, []);

  const refreshData = useCallback(async () => {
    if (!publicClient) return;
    const captured = scope.current;
    setRefreshing(true);
    try {
      // 1. Public Base pool state (always fetched even when wallet is disconnected!)
      const v3Pool = await publicClient.readContract({
        address: UNISWAP_V3_FACTORY_BASE,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: "getPool",
        args: [activePair.tokenAddress, WETH_BASE, feeTier],
      });

      let nextV2Token0: Address = zeroAddress;
      let nextV2Reserves = { reserve0: 0n, reserve1: 0n };
      let nextV2TotalLp = 0n;

      if (hasV2Pair) {
        const pair = activePair.v2PairAddress;
        const [t0, t1, reserves, totalLp] = await Promise.all([
          publicClient.readContract({
            address: pair,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token0",
          }),
          publicClient.readContract({
            address: pair,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token1",
          }),
          publicClient.readContract({
            address: pair,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves",
          }),
          publicClient.readContract({
            address: pair,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "totalSupply",
          }),
        ]);
        const expectedTokens = [WETH_BASE.toLowerCase(), activePair.tokenAddress.toLowerCase()];
        if (
          !expectedTokens.includes(t0.toLowerCase()) ||
          !expectedTokens.includes(t1.toLowerCase()) ||
          t0 === t1
        ) {
          throw new Error("V2 pair tokens do not match the selected migration pair");
        }
        nextV2Token0 = t0;
        nextV2Reserves = { reserve0: reserves[0], reserve1: reserves[1] };
        nextV2TotalLp = totalLp;
      }

      let nextSqrtPrice = 0n;
      let nextV3Liquidity = 0n;
      const poolActive = v3Pool !== zeroAddress;
      if (poolActive) {
        const [slot0, poolLiq] = await Promise.all([
          publicClient.readContract({
            address: v3Pool,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: "slot0",
          }),
          publicClient.readContract({
            address: v3Pool,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: "liquidity",
          }),
        ]);
        nextSqrtPrice = slot0[0];
        nextV3Liquidity = poolLiq;
      }

      // 2. Connected wallet balances on Base
      let userLp = 0n;
      let userTok = 0n;
      let userWeth = 0n;
      let userEth = 0n;
      if (userAddress) {
        const [lpRes, tokRes, wethRes, ethRes] = await Promise.all([
          hasV2Pair
            ? publicClient.readContract({
                address: activePair.v2PairAddress,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [userAddress],
              })
            : Promise.resolve(0n),
          publicClient.readContract({
            address: activePair.tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [userAddress],
          }),
          publicClient.readContract({
            address: WETH_BASE,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [userAddress],
          }),
          publicClient.getBalance({ address: userAddress }),
        ]);
        userLp = lpRes;
        userTok = tokRes;
        userWeth = wethRes;
        userEth = ethRes;
      }

      if (scope.current !== captured) return;
      setV2Token0(nextV2Token0);
      setV2Reserves(nextV2Reserves);
      setV2TotalSupply(nextV2TotalLp);
      setV2LpBalance(userLp);
      setTokenBalance(userTok);
      setWethBalance(userWeth);
      setEthBalance(userEth);
      setV3PoolExists(poolActive && nextSqrtPrice > 0n);
      setV3PoolAddress(poolActive ? v3Pool : null);
      setV3SqrtPriceX96(nextSqrtPrice);
      setV3ActiveLiquidity(nextV3Liquidity);
    } catch (e) {
      console.error("Failed to refresh migration data:", e);
    } finally {
      if (scope.current === captured) {
        setRefreshing(false);
      }
    }
  }, [publicClient, userAddress, activePair, feeTier, hasV2Pair]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Pool-level V2 reserves sorted into WETH + Token
  const v2PoolReserves = useMemo(() => {
    if (!hasV2Pair || v2Token0 === zeroAddress) {
      return { wethReserve: 0n, tokenReserve: 0n };
    }
    const isToken0Weth = v2Token0.toLowerCase() === WETH_BASE.toLowerCase();
    return {
      wethReserve: isToken0Weth ? v2Reserves.reserve0 : v2Reserves.reserve1,
      tokenReserve: isToken0Weth ? v2Reserves.reserve1 : v2Reserves.reserve0,
    };
  }, [hasV2Pair, v2Token0, v2Reserves]);

  // Derived user shares in V2
  const userShareOfV2 = useMemo(() => {
    if (v2TotalSupply === 0n || v2LpBalance === 0n) return 0;
    return Number((v2LpBalance * 10000n) / v2TotalSupply) / 100;
  }, [v2LpBalance, v2TotalSupply]);

  const underlyingAmounts = useMemo(() => {
    if (v2TotalSupply === 0n || v2LpBalance === 0n) {
      return { ethAmount: 0n, tokenAmount: 0n };
    }
    const ethAmount = (v2LpBalance * v2PoolReserves.wethReserve) / v2TotalSupply;
    const tokenAmount = (v2LpBalance * v2PoolReserves.tokenReserve) / v2TotalSupply;
    return { ethAmount, tokenAmount };
  }, [v2TotalSupply, v2LpBalance, v2PoolReserves]);

  // Live V3 spot rate: 1 WETH = X Token
  const v3TokensPerEth = useMemo(() => {
    if (!v3PoolExists || v3SqrtPriceX96 <= 0n) return null;
    const quoted = quoteV3FullRangeCounterparty({
      inputToken: WETH_BASE,
      otherToken: activePair.tokenAddress,
      inputAmount: parseUnits("1", 18),
      sqrtPriceX96: v3SqrtPriceX96,
    });
    if (quoted <= 0n) return null;
    return formatCompact(quoted, activePair.decimals, 4);
  }, [v3PoolExists, v3SqrtPriceX96, activePair]);

  // Bidirectional input handlers with automatic live V3 pool ratio sync
  const handleTokenDepositChange = useCallback(
    (value: string) => {
      setDepositToken(value);
      if (!autoSyncRatio || !v3PoolExists || v3SqrtPriceX96 <= 0n) return;
      if (!value) {
        setDepositWeth("");
        return;
      }
      try {
        const parsed = parseUnits(value, activePair.decimals);
        if (parsed <= 0n) return;
        const neededWeth = quoteV3FullRangeCounterparty({
          inputToken: activePair.tokenAddress,
          otherToken: WETH_BASE,
          inputAmount: parsed,
          sqrtPriceX96: v3SqrtPriceX96,
        });
        if (neededWeth > 0n) {
          setDepositWeth(quoteForInput(neededWeth, 18));
        }
      } catch {
        // preserve manual typing while incomplete decimal
      }
    },
    [autoSyncRatio, v3PoolExists, v3SqrtPriceX96, activePair]
  );

  const handleWethDepositChange = useCallback(
    (value: string) => {
      setDepositWeth(value);
      if (!autoSyncRatio || !v3PoolExists || v3SqrtPriceX96 <= 0n) return;
      if (!value) {
        setDepositToken("");
        return;
      }
      try {
        const parsed = parseUnits(value, 18);
        if (parsed <= 0n) return;
        const neededToken = quoteV3FullRangeCounterparty({
          inputToken: WETH_BASE,
          otherToken: activePair.tokenAddress,
          inputAmount: parsed,
          sqrtPriceX96: v3SqrtPriceX96,
        });
        if (neededToken > 0n) {
          setDepositToken(quoteForInput(neededToken, activePair.decimals));
        }
      } catch {
        // preserve manual typing
      }
    },
    [autoSyncRatio, v3PoolExists, v3SqrtPriceX96, activePair]
  );

  const maxSpendableWethAndEth = useMemo(() => {
    const spendableEth = ethBalance > GAS_BUFFER_WEI ? ethBalance - GAS_BUFFER_WEI : 0n;
    return wethBalance + spendableEth;
  }, [wethBalance, ethBalance]);

  const handleMaxToken = useCallback(() => {
    if (tokenBalance <= 0n) return;
    handleTokenDepositChange(formatUnits(tokenBalance, activePair.decimals));
  }, [tokenBalance, activePair.decimals, handleTokenDepositChange]);

  const handleMaxWeth = useCallback(() => {
    if (maxSpendableWethAndEth <= 0n) return;
    handleWethDepositChange(formatUnits(maxSpendableWethAndEth, 18));
  }, [maxSpendableWethAndEth, handleWethDepositChange]);

  const handleMatchV2Ratio = useCallback(() => {
    if (v2PoolReserves.tokenReserve <= 0n || v2PoolReserves.wethReserve <= 0n) return;
    if (depositToken && positiveAmount(depositToken, activePair.decimals)) {
      const parsed = parseUnits(depositToken, activePair.decimals);
      const wethOut = (parsed * v2PoolReserves.wethReserve) / v2PoolReserves.tokenReserve;
      setDepositWeth(quoteForInput(wethOut, 18));
    } else if (tokenBalance > 0n) {
      const wethOut = (tokenBalance * v2PoolReserves.wethReserve) / v2PoolReserves.tokenReserve;
      setDepositToken(formatUnits(tokenBalance, activePair.decimals));
      setDepositWeth(quoteForInput(wethOut, 18));
    }
  }, [v2PoolReserves, depositToken, activePair.decimals, tokenBalance]);

  // Step 1: Remove Liquidity from V2
  const handleRemoveV2 = async () => {
    if (!walletClient || !publicClient || !userAddress || chainId !== base.id) {
      toast.error("Connect wallet on Base Mainnet");
      return;
    }
    if (!hasV2Pair || v2LpBalance === 0n) {
      toast.error("No V2 LP tokens found to remove");
      return;
    }
    setBusy(true);
    setLastTxHash(null);
    try {
      const pair = activePair.v2PairAddress;
      setStepNotice("Checking V2 pair approval...");

      const allowance = await publicClient.readContract({
        address: pair,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress, v2Router],
      });

      if (allowance < v2LpBalance) {
        setStepNotice("Please approve LP tokens for Uniswap V2 Router in wallet...");
        await assertWallet();
        const approveTx = await walletClient.writeContract({
          address: pair,
          abi: erc20Abi,
          functionName: "approve",
          args: [v2Router, maxUint256],
          chain: base,
          account: userAddress,
        });
        setLastTxHash(approveTx);
        setStepNotice("Waiting for LP approval confirmation on Base...");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
        if (receipt.status !== "success") throw new Error("Approval reverted");
      }

      setStepNotice("Confirm removing liquidity in your wallet...");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins
      const slippageBps = 9950n; // 0.5% max slippage floor
      const minToken = (underlyingAmounts.tokenAmount * slippageBps) / 10000n;
      const minEth = (underlyingAmounts.ethAmount * slippageBps) / 10000n;

      const { request } = await publicClient.simulateContract({
        address: v2Router,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "removeLiquidityETH",
        args: [activePair.tokenAddress, v2LpBalance, minToken, minEth, userAddress, deadline],
        account: userAddress,
      });

      await assertWallet();
      const removeTx = await walletClient.writeContract({ ...request, chain: base });
      setLastTxHash(removeTx);
      setStepNotice("Removing liquidity on Base...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: removeTx });
      if (receipt.status !== "success") throw new Error("Removal transaction reverted");

      setV2RemovedInSession(true);
      toast.success("Successfully removed liquidity from Uniswap V2!");
      setStepNotice("Liquidity removed. Ready for Step 2 (Uniswap V3 initialization & mint)!");
      await refreshData();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to remove liquidity from V2");
      setStepNotice("");
    } finally {
      setBusy(false);
    }
  };

  // Step 2: Initialize & Supply into Uniswap V3
  const handleSupplyV3 = async () => {
    if (!walletClient || !publicClient || !userAddress || chainId !== base.id) {
      toast.error("Connect wallet on Base Mainnet");
      return;
    }
    if (tokenBalance === 0n) {
      toast.error(`You have 0 ${activePair.tokenSymbol}. Acquire tokens on Swap or withdraw V2 LP.`);
      return;
    }
    setBusy(true);
    setLastTxHash(null);
    try {
      if (!positiveAmount(depositToken, activePair.decimals) || !positiveAmount(depositWeth, 18)) {
        throw new Error("Enter positive token and WETH deposit amounts");
      }
      const neededWeth = parseUnits(depositWeth, 18);
      const tokenDesired = parseUnits(depositToken, activePair.decimals);
      if (tokenDesired > tokenBalance) {
        throw new Error(`Deposit exceeds your ${activePair.tokenSymbol} balance`);
      }

      // Check WETH balance and wrap native ETH shortfall automatically
      if (wethBalance < neededWeth) {
        const wrapShortfall = neededWeth - wethBalance;
        if (ethBalance < wrapShortfall + GAS_BUFFER_WEI) {
          throw new Error("Insufficient ETH balance to wrap into WETH and pay gas");
        }
        setStepNotice(`Wrapping ${formatUnits(wrapShortfall, 18).slice(0, 8)} ETH into WETH...`);
        const wrapAbi = parseAbi(["function deposit() payable"]);
        await assertWallet();
        const wrapTx = await walletClient.writeContract({
          address: WETH_BASE,
          abi: wrapAbi,
          functionName: "deposit",
          value: wrapShortfall,
          chain: base,
          account: userAddress,
        });
        setLastTxHash(wrapTx);
        const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapTx });
        if (wrapReceipt.status !== "success") throw new Error("WETH wrapping reverted");
      }

      // Approve Position Manager for Token
      setStepNotice(`Checking ${activePair.tokenSymbol} allowance for Uniswap V3...`);
      const tokenAllowance = await publicClient.readContract({
        address: activePair.tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress, NONFUNGIBLE_POSITION_MANAGER_BASE],
      });

      if (tokenAllowance < tokenDesired) {
        setStepNotice(`Approve ${activePair.tokenSymbol} for Uniswap V3 Position Manager...`);
        await assertWallet();
        const approveTokenTx = await walletClient.writeContract({
          address: activePair.tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [NONFUNGIBLE_POSITION_MANAGER_BASE, tokenDesired],
          chain: base,
          account: userAddress,
        });
        setLastTxHash(approveTokenTx);
        const approval = await publicClient.waitForTransactionReceipt({ hash: approveTokenTx });
        if (approval.status !== "success") throw new Error("Token approval reverted");
      }

      // Approve Position Manager for WETH
      setStepNotice("Checking WETH allowance for Uniswap V3...");
      const wethAllowance = await publicClient.readContract({
        address: WETH_BASE,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress, NONFUNGIBLE_POSITION_MANAGER_BASE],
      });

      if (wethAllowance < neededWeth) {
        setStepNotice("Approve WETH for Uniswap V3 Position Manager...");
        await assertWallet();
        const approveWethTx = await walletClient.writeContract({
          address: WETH_BASE,
          abi: erc20Abi,
          functionName: "approve",
          args: [NONFUNGIBLE_POSITION_MANAGER_BASE, neededWeth],
          chain: base,
          account: userAddress,
        });
        setLastTxHash(approveWethTx);
        const approval = await publicClient.waitForTransactionReceipt({ hash: approveWethTx });
        if (approval.status !== "success") throw new Error("WETH approval reverted");
      }

      // Mint Full Range Position
      setStepNotice("Minting Full-Range Uniswap V3 position NFT...");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const mintCall = buildV3MintCall(
        WETH_BASE,
        activePair.tokenAddress,
        neededWeth,
        tokenDesired,
        feeTier,
        userAddress,
        deadline,
        v3PoolExists ? v3SqrtPriceX96 : undefined
      );
      const { request: mintReq } = await publicClient.simulateContract({
        ...mintCall,
        account: userAddress,
      });

      await assertWallet();
      const mintTx = await walletClient.writeContract({ ...mintReq, chain: base });
      setLastTxHash(mintTx);
      setStepNotice("Confirming Uniswap V3 position mint on Base...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: mintTx });
      if (receipt.status !== "success") throw new Error("Mint transaction reverted");

      toast.success("Successfully minted Uniswap V3 position on Base!");
      setStepNotice("Position Minted! You now hold a live Uniswap V3 Position NFT on Base.");
      setDepositToken("");
      setDepositWeth("");
      await refreshData();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to supply into Uniswap V3");
      setStepNotice("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/30 shadow-md">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl font-bold text-gray-900">
                Uniswap V2 ➔ V3 Migration &amp; Supply Assistant
              </CardTitle>
              <Badge className="border-indigo-300 bg-indigo-100 font-semibold text-indigo-800">
                Base Mainnet
              </Badge>
              {activePair.stakingEligible && (
                <Link
                  to="/stake"
                  className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-900 hover:bg-purple-200"
                >
                  <Sparkles className="size-3" /> Q1 $MRWD Staking Pool ↗
                </Link>
              )}
            </div>
            <CardDescription className="mt-0.5 text-xs text-gray-500">
              Withdraw legacy V2 LP or supply directly into Uniswap V3 on Base with automatic
              live pool ratio quoting and ETH-to-WETH wrapping.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData()}
            disabled={busy || refreshing}
            className="border-gray-200 text-xs"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${busy || refreshing ? "animate-spin" : ""}`} />{" "}
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Token Pair & Fee Tier Selector */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Target Liquidity Pair</Label>
            <Select
              value={selectedPairId}
              onValueChange={(val) => {
                const next = KNOWN_V3_PAIRS.find((p) => p.id === val);
                setSelectedPairId(val);
                if (next) setFeeTier(next.defaultFeeTier);
                setDepositToken("");
                setDepositWeth("");
                setV2RemovedInSession(false);
                onPairChange?.(val);
              }}
              disabled={busy}
            >
              <SelectTrigger className="w-full bg-white font-medium">
                <SelectValue placeholder="Select pair" />
              </SelectTrigger>
              <SelectContent>
                {KNOWN_V3_PAIRS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.tag ? `· ${p.tag}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Uniswap V3 Fee Tier</Label>
            <Select
              value={String(feeTier)}
              onValueChange={(val) => {
                setFeeTier(Number(val));
                setDepositToken("");
                setDepositWeth("");
              }}
              disabled={busy}
            >
              <SelectTrigger className="w-full bg-white font-medium">
                <SelectValue placeholder="Select fee tier" />
              </SelectTrigger>
              <SelectContent>
                {V3_FEE_TIERS.map((t) => (
                  <SelectItem key={t.fee} value={String(t.fee)}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Live On-Chain Pool & Wallet Telemetry */}
        <div className="shadow-xs rounded-xl border border-purple-100 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-800">
                {activePair.name} On-Chain Telemetry
              </span>
              {v3PoolExists ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-800">
                  V3 {feeTier / 10000}% Pool Live
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-800"
                >
                  V3 {feeTier / 10000}% Uninitialized
                </Badge>
              )}
              {hasV2Pair && v2PoolReserves.wethReserve > 0n && (
                <Badge variant="outline" className="text-[10px] text-slate-600">
                  V2 TVL: {formatCompact(v2PoolReserves.wethReserve, 18, 4)} WETH +{" "}
                  {formatCompact(v2PoolReserves.tokenReserve, activePair.decimals, 2)}{" "}
                  {activePair.tokenSymbol}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasV2Pair && (
                <a
                  href={`https://basescan.org/address/${activePair.v2PairAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs text-indigo-600 hover:underline"
                >
                  V2 Pair <ExternalLink className="ml-1 size-3" />
                </a>
              )}
              {v3PoolAddress && (
                <a
                  href={`https://basescan.org/address/${v3PoolAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline"
                >
                  V3 Pool <ExternalLink className="ml-1 size-3" />
                </a>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-gray-500">
                {hasV2Pair ? "Your V2 LP Balance" : "V3 Pool Spot Rate"}
              </p>
              {hasV2Pair ? (
                <>
                  <p className="font-mono text-base font-bold text-gray-900">
                    {isConnected ? `${formatCompact(v2LpBalance, 18, 6)} LP` : "Connect Wallet"}
                  </p>
                  <p className="text-[10px] font-medium text-purple-600">
                    {isConnected
                      ? `${userShareOfV2.toFixed(4)}% V2 pool ownership`
                      : "Live V2 reserves loaded"}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-mono text-base font-bold text-gray-900">
                    {v3TokensPerEth ? `1 ETH = ${v3TokensPerEth} ${activePair.tokenSymbol}` : "—"}
                  </p>
                  <p className="text-[10px] font-medium text-emerald-700">
                    {v3ActiveLiquidity > 0n
                      ? "Concentrated V3 liquidity active"
                      : "Direct V3 pool on Base"}
                  </p>
                </>
              )}
            </div>

            <div>
              <p className="text-[11px] text-gray-500">
                {hasV2Pair ? `V2 Underlying ${activePair.tokenSymbol}` : `${activePair.tokenSymbol} Balance`}
              </p>
              <p className="font-mono text-base font-bold text-gray-900">
                {hasV2Pair
                  ? formatCompact(underlyingAmounts.tokenAmount, activePair.decimals, 2)
                  : isConnected
                    ? formatCompact(tokenBalance, activePair.decimals, 4)
                    : "—"}
              </p>
              <p className="text-[10px] text-gray-500">
                Wallet held:{" "}
                {isConnected ? formatCompact(tokenBalance, activePair.decimals, 4) : "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-gray-500">
                {hasV2Pair ? "V2 Underlying WETH / ETH" : "Wallet ETH + WETH"}
              </p>
              <p className="font-mono text-base font-bold text-gray-900">
                {hasV2Pair
                  ? `${formatCompact(underlyingAmounts.ethAmount, 18, 6)} ETH`
                  : isConnected
                    ? `${formatCompact(ethBalance + wethBalance, 18, 5)} ETH`
                    : "—"}
              </p>
              <p className="text-[10px] text-gray-500">
                {isConnected
                  ? `${formatCompact(ethBalance, 18, 4)} ETH · ${formatCompact(wethBalance, 18, 4)} WETH`
                  : v3TokensPerEth
                    ? `V3 Spot: 1 ETH ≈ ${v3TokensPerEth} ${activePair.tokenSymbol}`
                    : "Connect wallet for balances"}
              </p>
            </div>
          </div>
        </div>

        {/* Step-by-Step Migration & Supply Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* STEP 1: REMOVE FROM V2 */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-800">
                  Step 1
                </Badge>
                {!hasV2Pair ? (
                  <span className="inline-flex items-center text-xs font-medium text-slate-500">
                    V3-Native Pair (Skip to Step 2)
                  </span>
                ) : v2RemovedInSession && v2LpBalance === 0n ? (
                  <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="mr-1 size-3.5" /> Completed
                  </span>
                ) : isConnected && v2LpBalance > 0n ? (
                  <span className="inline-flex items-center text-xs font-semibold text-purple-700">
                    {formatCompact(v2LpBalance, 18, 4)} LP Ready
                  </span>
                ) : isConnected ? (
                  <span className="text-xs text-slate-500">0 V2 LP Held</span>
                ) : (
                  <span className="text-xs text-slate-400">Optional if holding tokens</span>
                )}
              </div>
              <h4 className="mt-2 text-sm font-bold text-gray-900">
                Remove Liquidity from Uniswap V2
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                {hasV2Pair
                  ? `Withdraws your ${activePair.tokenSymbol} and ETH from the Uniswap V2 pair contract back into your wallet with a 0.5% slippage guard.`
                  : `${activePair.name} trades natively on Uniswap V3 on Base — no legacy V2 withdrawal is needed. Proceed directly to Step 2.`}
              </p>
            </div>

            {!isConnected ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full border-purple-200 text-purple-800 hover:bg-purple-50"
                onClick={openWalletConnect}
              >
                <Wallet className="mr-2 size-4" /> Connect Wallet to Check V2 LP
              </Button>
            ) : (
              <Button
                className="mt-4 w-full bg-purple-600 text-white hover:bg-purple-700"
                disabled={busy || !hasV2Pair || v2LpBalance === 0n || chainId !== base.id}
                onClick={() => void handleRemoveV2()}
              >
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Unlock className="mr-2 size-4" />
                )}
                {!hasV2Pair
                  ? "V3-Native Pool (Use Step 2)"
                  : v2LpBalance === 0n
                    ? "No V2 LP to Withdraw"
                    : "Withdraw All V2 Liquidity"}
              </Button>
            )}
          </div>

          {/* STEP 2: SUPPLY INTO V3 */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-800">
                  Step 2
                </Badge>
                <div className="flex items-center gap-2">
                  {v3PoolExists && (
                    <button
                      type="button"
                      onClick={() => setAutoSyncRatio((prev) => !prev)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                        autoSyncRatio
                          ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      <Link2 className="size-3" />
                      {autoSyncRatio ? "Ratio Auto-Synced" : "Manual Ratio"}
                    </button>
                  )}
                  {v3PoolExists ? (
                    <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                      <CheckCircle2 className="mr-1 size-3.5" /> V3 Pool Live
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-700">New Pool Init</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-900">
                  {v3PoolExists
                    ? "Supply Full-Range Uniswap V3 Liquidity"
                    : "Initialize & Supply into Uniswap V3"}
                </h4>
                <p className="mt-1 text-xs text-gray-500">
                  {v3PoolExists
                    ? `Amounts auto-quote against the live ${activePair.name} V3 slot0 price (${
                        v3TokensPerEth ? `1 ETH ≈ ${v3TokensPerEth} ${activePair.tokenSymbol}` : "on-chain"
                      }) with a 0.5% min consumption guard. Any WETH shortfall wraps from ETH.`
                    : "Initializes a new Base V3 pool at your deposit ratio and mints a Full-Range NFT atomically. Any WETH shortfall wraps from ETH."}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="v3-token-amount" className="text-xs">
                    {activePair.tokenSymbol} to deposit
                  </Label>
                  {isConnected && tokenBalance > 0n && (
                    <button
                      type="button"
                      onClick={handleMaxToken}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      MAX ({formatCompact(tokenBalance, activePair.decimals, 2)})
                    </button>
                  )}
                </div>
                <Input
                  id="v3-token-amount"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={depositToken}
                  onChange={(event) => handleTokenDepositChange(event.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="v3-weth-amount" className="text-xs">
                    WETH / ETH to deposit
                  </Label>
                  <div className="flex items-center gap-2">
                    {!v3PoolExists && v2PoolReserves.wethReserve > 0n && (
                      <button
                        type="button"
                        onClick={handleMatchV2Ratio}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-800"
                      >
                        <ArrowRightLeft className="size-3" /> Match V2 Price
                      </button>
                    )}
                    {isConnected && maxSpendableWethAndEth > 0n && (
                      <button
                        type="button"
                        onClick={handleMaxWeth}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        MAX ({formatCompact(maxSpendableWethAndEth, 18, 4)})
                      </button>
                    )}
                  </div>
                </div>
                <Input
                  id="v3-weth-amount"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={depositWeth}
                  onChange={(event) => handleWethDepositChange(event.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            {!isConnected ? (
              <Button
                type="button"
                className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-white hover:from-indigo-700 hover:to-purple-700"
                onClick={openWalletConnect}
              >
                <Wallet className="mr-2 size-4" /> Connect Wallet to Supply V3
              </Button>
            ) : (
              <Button
                className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-white hover:from-indigo-700 hover:to-purple-700"
                disabled={
                  busy ||
                  tokenBalance === 0n ||
                  chainId !== base.id ||
                  !positiveAmount(depositToken, activePair.decimals) ||
                  !positiveAmount(depositWeth, 18)
                }
                onClick={() => void handleSupplyV3()}
              >
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                {tokenBalance === 0n
                  ? `Acquire ${activePair.tokenSymbol} to Supply`
                  : v3PoolExists
                    ? "Supply into Uniswap V3"
                    : "Initialize & Supply Uniswap V3"}
              </Button>
            )}
          </div>
        </div>

        {/* Live Status and Transaction Notification */}
        {stepNotice && (
          <Alert className="border-indigo-200 bg-indigo-50/80 text-indigo-950">
            <AlertCircle className="size-4 text-indigo-600" />
            <AlertTitle className="text-xs font-semibold">Migration Status</AlertTitle>
            <AlertDescription className="text-xs">
              <p>{stepNotice}</p>
              {lastTxHash && (
                <a
                  href={`https://basescan.org/tx/${lastTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center font-semibold text-indigo-700 underline"
                >
                  View BaseScan Transaction <ExternalLink className="ml-1 size-3" />
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}

        {v3PoolAddress && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Live Uniswap V3 Pool ({feeTier / 10000}%):</strong>{" "}
                <code className="font-mono text-[11px]">{v3PoolAddress}</code>
              </span>
              <div className="flex items-center gap-3">
                {activePair.stakingEligible && (
                  <Link to="/stake" className="font-bold text-purple-800 underline hover:text-purple-950">
                    Stake NFT for $MRWD ↗
                  </Link>
                )}
                <a
                  href={`https://basescan.org/address/${v3PoolAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline hover:text-emerald-700"
                >
                  BaseScan ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
