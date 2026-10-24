// src/components/liquidity/V2ToV3MigrationWizard.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Unlock,
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
import { positiveAmount } from "@/lib/amm/own-dex";
import {
  buildV3MintCall,
  NONFUNGIBLE_POSITION_MANAGER_BASE,
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_FACTORY_BASE,
  V3_FEE_TIERS,
  WETH_BASE,
} from "@/lib/amm/uniswap-v3";

interface KnownMigrationPair {
  readonly id: string;
  readonly name: string;
  readonly tokenSymbol: string;
  readonly tokenAddress: Address;
  readonly v2PairAddress: Address;
  readonly decimals: number;
}

const KNOWN_PAIRS: readonly KnownMigrationPair[] = [
  {
    id: "fba-weth",
    name: "FBA / WETH",
    tokenSymbol: "FBA",
    tokenAddress: "0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263",
    v2PairAddress: "0x916ed75C0636Ddd7404DB79B7dc5CF80e8446c47",
    decimals: 18,
  },
  {
    id: "sd-weth",
    name: "SD / WETH",
    tokenSymbol: "SD",
    tokenAddress: "0x051c758521971f5c5a84edaf18eea12854375469",
    v2PairAddress: "0xC3D1e0b1CD05081bD7Af4cf87f681512E3E90917",
    decimals: 18,
  },
];

export function V2ToV3MigrationWizard() {
  const { address: userAddress, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();

  const [selectedPairId, setSelectedPairId] = useState<string>("fba-weth");
  const [feeTier, setFeeTier] = useState<number>(10000); // 1.0% default
  const [busy, setBusy] = useState(false);
  const [stepNotice, setStepNotice] = useState<string>("");
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [depositToken, setDepositToken] = useState("");
  const [depositWeth, setDepositWeth] = useState("");

  // Live on-chain pool info
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

  const activePair = useMemo(
    () => KNOWN_PAIRS.find((p) => p.id === selectedPairId) ?? KNOWN_PAIRS[0]!,
    [selectedPairId]
  );

  const v2Router = useMemo(() => getUniswapV2Router(8453), []);
  const scope = useRef("");
  const walletScope = `${userAddress}:${chainId}:${selectedPairId}:${feeTier}`;
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

  const refreshData = useCallback(async () => {
    setV2LpBalance(0n);
    setTokenBalance(0n);
    setWethBalance(0n);
    setEthBalance(0n);
    setV3PoolExists(false);
    setV3PoolAddress(null);
    if (!publicClient || !userAddress || chainId !== base.id) return;
    const captured = scope.current;
    try {
      const pair = activePair.v2PairAddress;
      const [t0, t1, reserves, totalLp, userLp, userTok, userWeth, userEth, v3Pool] =
        await Promise.all([
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
          publicClient.readContract({
            address: pair,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [userAddress],
          }),
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
          publicClient.readContract({
            address: UNISWAP_V3_FACTORY_BASE,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: "getPool",
            args: [activePair.tokenAddress, WETH_BASE, feeTier],
          }),
        ]);

      if (scope.current !== captured) return;
      const expectedTokens = [WETH_BASE.toLowerCase(), activePair.tokenAddress.toLowerCase()];
      if (
        !expectedTokens.includes(t0.toLowerCase()) ||
        !expectedTokens.includes(t1.toLowerCase()) ||
        t0 === t1
      ) {
        throw new Error("V2 pair tokens do not match the selected migration pair");
      }
      setV2Token0(t0);
      setV2Reserves({ reserve0: reserves[0], reserve1: reserves[1] });
      setV2TotalSupply(totalLp);
      setV2LpBalance(userLp);
      setTokenBalance(userTok);
      setWethBalance(userWeth);
      setEthBalance(userEth);
      const poolActive = v3Pool !== zeroAddress;
      setV3PoolExists(poolActive);
      setV3PoolAddress(poolActive ? v3Pool : null);
    } catch (e) {
      console.error("Failed to refresh migration data:", e);
    }
  }, [publicClient, userAddress, chainId, activePair, feeTier]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Derived user shares in V2
  const userShareOfV2 = useMemo(() => {
    if (v2TotalSupply === 0n || v2LpBalance === 0n) return 0;
    return Number((v2LpBalance * 10000n) / v2TotalSupply) / 100;
  }, [v2LpBalance, v2TotalSupply]);

  const underlyingAmounts = useMemo(() => {
    if (v2TotalSupply === 0n || v2LpBalance === 0n) {
      return { ethAmount: 0n, tokenAmount: 0n };
    }
    const isToken0Weth = v2Token0.toLowerCase() === WETH_BASE.toLowerCase();
    const wethReserve = isToken0Weth ? v2Reserves.reserve0 : v2Reserves.reserve1;
    const tokenReserve = isToken0Weth ? v2Reserves.reserve1 : v2Reserves.reserve0;

    const ethAmount = (v2LpBalance * wethReserve) / v2TotalSupply;
    const tokenAmount = (v2LpBalance * tokenReserve) / v2TotalSupply;
    return { ethAmount, tokenAmount };
  }, [v2TotalSupply, v2LpBalance, v2Token0, v2Reserves]);

  // Step 1: Remove Liquidity from V2
  const handleRemoveV2 = async () => {
    if (!walletClient || !publicClient || !userAddress || chainId !== base.id) {
      toast.error("Connect wallet on Base Mainnet");
      return;
    }
    if (v2LpBalance === 0n) {
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
      toast.error(`You have 0 ${activePair.tokenSymbol}. Complete Step 1 first or acquire tokens.`);
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
      if (tokenDesired > tokenBalance) throw new Error("Deposit exceeds your token balance");

      // Check WETH balance
      if (wethBalance < neededWeth) {
        const wrapShortfall = neededWeth - wethBalance;
        if (ethBalance < wrapShortfall + parseUnits("0.0005", 18)) {
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
        deadline
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
      setStepNotice("Migration Complete! You now hold a live Uniswap V3 Position NFT on Base.");
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
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-bold text-gray-900">
                Uniswap V2 ➔ V3 Migration Assistant
              </CardTitle>
              <Badge className="border-indigo-300 bg-indigo-100 font-semibold text-indigo-800">
                Base Mainnet
              </Badge>
            </div>
            <CardDescription className="text-xs text-gray-500">
              Seamlessly withdraw your V2 liquidity and initialize/supply into Uniswap V3 on Base
              without buggy external websites.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData()}
            disabled={busy}
            className="border-gray-200 text-xs"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Token Pair & Fee Tier Selector */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Target Migration Pair</Label>
            <Select
              value={selectedPairId}
              onValueChange={(val) => {
                setSelectedPairId(val);
                setDepositToken("");
                setDepositWeth("");
              }}
              disabled={busy}
            >
              <SelectTrigger className="w-full bg-white font-medium">
                <SelectValue placeholder="Select pair" />
              </SelectTrigger>
              <SelectContent>
                {KNOWN_PAIRS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.v2PairAddress.slice(0, 6)}...{p.v2PairAddress.slice(-4)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Uniswap V3 Fee Tier</Label>
            <Select
              value={String(feeTier)}
              onValueChange={(val) => setFeeTier(Number(val))}
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

        {/* Current V2 Pool State Overview */}
        <div className="shadow-xs rounded-xl border border-purple-100 bg-white p-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-bold text-gray-700">Your Uniswap V2 Position</span>
            <a
              href={`https://basescan.org/address/${activePair.v2PairAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs text-indigo-600 hover:underline"
            >
              V2 Pair Contract <ExternalLink className="ml-1 size-3" />
            </a>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-gray-500">Your LP Balance</p>
              <p className="font-mono text-base font-bold text-gray-900">
                {formatUnits(v2LpBalance, 18).slice(0, 9)} LP
              </p>
              <p className="text-[10px] font-medium text-purple-600">
                {userShareOfV2.toFixed(4)}% pool ownership
              </p>
            </div>

            <div>
              <p className="text-[11px] text-gray-500">Underlying {activePair.tokenSymbol}</p>
              <p className="font-mono text-base font-bold text-gray-900">
                {Number(
                  formatUnits(underlyingAmounts.tokenAmount, activePair.decimals)
                ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-500">
                Wallet held:{" "}
                {Number(formatUnits(tokenBalance, activePair.decimals)).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-gray-500">Underlying WETH / ETH</p>
              <p className="font-mono text-base font-bold text-gray-900">
                {formatUnits(underlyingAmounts.ethAmount, 18).slice(0, 8)} ETH
              </p>
              <p className="text-[10px] text-gray-500">
                Wallet: {formatUnits(ethBalance, 18).slice(0, 6)} ETH
              </p>
            </div>
          </div>
        </div>

        {/* Step-by-Step Migration Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* STEP 1: REMOVE FROM V2 */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-800">
                  Step 1
                </Badge>
                {v2LpBalance === 0n && (
                  <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="mr-1 size-3.5" /> Completed
                  </span>
                )}
              </div>
              <h4 className="mt-2 text-sm font-bold text-gray-900">
                Remove Liquidity from Uniswap V2
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                Withdraws your {activePair.tokenSymbol} and ETH from the V2 pair contract back into
                your wallet so they are ready for Uniswap V3.
              </p>
            </div>

            <Button
              className="mt-4 w-full bg-purple-600 text-white hover:bg-purple-700"
              disabled={busy || v2LpBalance === 0n || !isConnected}
              onClick={() => void handleRemoveV2()}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 size-4" />
              )}
              {v2LpBalance === 0n ? "No V2 LP to Withdraw" : "Withdraw All V2 Liquidity"}
            </Button>
          </div>

          {/* STEP 2: SUPPLY INTO V3 */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-800">
                  Step 2
                </Badge>
                {v3PoolExists && (
                  <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="mr-1 size-3.5" /> V3 Pool Live
                  </span>
                )}
              </div>
              <h4 className="mt-2 text-sm font-bold text-gray-900">
                Initialize & Supply into Uniswap V3
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                Initializes a new pool at your deposit ratio and mints a full-range NFT. For
                existing pools, match the current pool ratio. Both amounts have a 0.5% minimum
                consumption tolerance; an imbalanced deposit will revert. Any WETH shortfall is
                wrapped from ETH.
              </p>
              <Label htmlFor="v3-token-amount">{activePair.tokenSymbol} to deposit</Label>
              <Input
                id="v3-token-amount"
                inputMode="decimal"
                value={depositToken}
                onChange={(event) => setDepositToken(event.target.value)}
                disabled={busy}
              />
              <Label htmlFor="v3-weth-amount">WETH to deposit</Label>
              <Input
                id="v3-weth-amount"
                inputMode="decimal"
                value={depositWeth}
                onChange={(event) => setDepositWeth(event.target.value)}
                disabled={busy}
              />
            </div>

            <Button
              className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-white hover:from-indigo-700 hover:to-purple-700"
              disabled={
                busy ||
                tokenBalance === 0n ||
                !isConnected ||
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
              {v3PoolExists ? "Supply into Uniswap V3" : "Initialize & Supply Uniswap V3"}
            </Button>
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
            <div className="flex items-center justify-between">
              <span>
                <strong>Live Uniswap V3 Pool:</strong>{" "}
                <code className="font-mono">{v3PoolAddress}</code>
              </span>
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
        )}
      </CardContent>
    </Card>
  );
}
