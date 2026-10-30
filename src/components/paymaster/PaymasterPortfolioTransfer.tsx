import { useEffect, useMemo, useState } from "react";

import { ArrowRightLeft, Coins, Lock, Send } from "lucide-react";
import { createSmartAccountClient } from "permissionless";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hex,
  http,
  isAddress,
  parseAbi,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSwapDropdownTokens, type Token } from "@/config/tokens";
import { usePortfolio } from "@/hooks/usePortfolio";
import { quoteSmartRoutes, routeSwapCall } from "@/lib/amm/smart-routing";
import { calculateMinimumAmountOut } from "@/lib/amm/swap-protection";
import { MRWD_ON_BASE, rewardTokenAbi } from "@/lib/paymaster/client";

const MUTT_PRO_STAKING_ON_BASE = "0x67dBC193bF510225EBf189ab25dC3b34a32c1766" as const;

const stakingAbi = parseAbi([
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
  "function relockAll()",
  "function withdrawMatured() returns (uint256 amount)",
  "function token() view returns (address)",
]);

interface ProgramConfig {
  ready: boolean;
  chainId: number;
  paymaster: Address | null;
  entryPoint: Address;
  accountImplementation: Address;
  muttProStaking?: Address;
  eligibilityMode?: "open_portfolio" | "allowlist";
  supportedOperations?: string[];
  walletEligible: boolean;
}

interface TokenChoice {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
}

type OperationType = "transfer" | "swap" | "stake";
type StakeActionType = "stake" | "unstake" | "relockAll" | "withdrawMatured";

function decimal(value: bigint | undefined): string {
  return (value ?? 0n).toString();
}

export function PaymasterPortfolioTransfer() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { tokens, refetch } = usePortfolio();

  const [config, setConfig] = useState<ProgramConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [operationType, setOperationType] = useState<OperationType>("transfer");

  // Token selection (shared across Transfer / Swap / Stake)
  const [selected, setSelected] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customToken, setCustomToken] = useState<TokenChoice | null>(null);

  // Transfer state
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  // Swap state
  const baseSwapTokens = useMemo(() => getSwapDropdownTokens(base.id), []);
  const [buyTokenSelection, setBuyTokenSelection] = useState<string>(MRWD_ON_BASE);
  const [customBuyAddress, setCustomBuyAddress] = useState("");
  const [customBuyToken, setCustomBuyToken] = useState<TokenChoice | null>(null);
  const [slippagePct, setSlippagePct] = useState("1.0");
  const [swapQuoteInfo, setSwapQuoteInfo] = useState<{
    venue: string;
    estimatedOut: string;
    buySymbol: string;
  } | null>(null);
  const [quotingSwap, setQuotingSwap] = useState(false);

  // Staking state
  const [stakingVaultChoice, setStakingVaultChoice] = useState<"mutt_pro" | "custom">("mutt_pro");
  const [customStakingVault, setCustomStakingVault] = useState("");
  const [stakeAction, setStakeAction] = useState<StakeActionType>("stake");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);

  useEffect(() => {
    const query = address ? `?wallet=${address}` : "";
    let active = true;
    fetch(`/api/paymaster/config${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Program configuration is unavailable.");
        return response.json() as Promise<ProgramConfig>;
      })
      .then((value) => {
        if (active) {
          setConfig(value);
          setConfigError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setConfigError(cause instanceof Error ? cause.message : "Program unavailable.");
      });
    return () => {
      active = false;
    };
  }, [address]);

  const choices = useMemo(
    () =>
      tokens
        .filter(
          (token) =>
            token.chainId === base.id &&
            token.address !== "0x0000000000000000000000000000000000000000" &&
            BigInt(token.balance) > 0n
        )
        .map((token) => ({
          address: token.address as Address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          balance: BigInt(token.balance),
        })),
    [tokens]
  );

  useEffect(() => {
    if (!publicClient || !isAddress(customAddress)) {
      setCustomToken(null);
      return;
    }
    let active = true;
    const tokenAddress = getAddress(customAddress);
    Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "balanceOf",
        args: [address ?? tokenAddress],
      }),
    ])
      .then(([symbol, decimals, balance]) => {
        if (active) {
          setCustomToken({
            address: tokenAddress,
            symbol,
            name: symbol,
            decimals,
            balance,
          });
        }
      })
      .catch(() => {
        if (active) setCustomToken(null);
      });
    return () => {
      active = false;
    };
  }, [address, customAddress, publicClient]);

  useEffect(() => {
    if (!publicClient || !isAddress(customBuyAddress)) {
      setCustomBuyToken(null);
      return;
    }
    let active = true;
    const tokenAddress = getAddress(customBuyAddress);
    Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: rewardTokenAbi,
        functionName: "decimals",
      }),
    ])
      .then(([symbol, decimals]) => {
        if (active) {
          setCustomBuyToken({
            address: tokenAddress,
            symbol,
            name: symbol,
            decimals,
            balance: 0n,
          });
        }
      })
      .catch(() => {
        if (active) setCustomBuyToken(null);
      });
    return () => {
      active = false;
    };
  }, [customBuyAddress, publicClient]);

  const token =
    selected === "custom"
      ? customToken
      : (choices.find((choice) => choice.address.toLowerCase() === selected.toLowerCase()) ?? null);

  const resolvedBuyToken: Token | null = useMemo(() => {
    if (buyTokenSelection === "custom") {
      if (!customBuyToken) return null;
      return {
        address: customBuyToken.address,
        symbol: customBuyToken.symbol,
        name: customBuyToken.name,
        decimals: customBuyToken.decimals,
        chainId: base.id,
        kind: "erc20",
      };
    }
    const found = baseSwapTokens.find(
      (item) => item.address.toLowerCase() === buyTokenSelection.toLowerCase()
    );
    return found ?? null;
  }, [baseSwapTokens, buyTokenSelection, customBuyToken]);

  // Live Swap Quote preview when on Swap tab
  useEffect(() => {
    setSwapQuoteInfo(null);
    if (operationType !== "swap" || !publicClient || !token || !resolvedBuyToken || !amount.trim()) {
      return;
    }
    let units = 0n;
    try {
      units = parseUnits(amount.trim(), token.decimals);
    } catch {
      return;
    }
    if (units <= 0n) return;
    if (
      resolvedBuyToken.address !== "native" &&
      resolvedBuyToken.address.toLowerCase() === token.address.toLowerCase()
    ) {
      return;
    }
    let active = true;
    setQuotingSwap(true);
    const sellTokenObj: Token = {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      chainId: base.id,
      kind: "erc20",
    };
    quoteSmartRoutes(publicClient, sellTokenObj, resolvedBuyToken, units)
      .then((res) => {
        if (!active) return;
        if (res.best) {
          setSwapQuoteInfo({
            venue: res.best.route.venue,
            estimatedOut: formatUnits(res.best.output, resolvedBuyToken.decimals),
            buySymbol: resolvedBuyToken.symbol,
          });
        }
      })
      .catch(() => {
        if (active) setSwapQuoteInfo(null);
      })
      .finally(() => {
        if (active) setQuotingSwap(false);
      });
    return () => {
      active = false;
    };
  }, [operationType, publicClient, token, resolvedBuyToken, amount]);

  const activeStakingAddress: Address | null = useMemo(() => {
    if (stakingVaultChoice === "mutt_pro") return MUTT_PRO_STAKING_ON_BASE;
    return isAddress(customStakingVault.trim()) ? getAddress(customStakingVault.trim()) : null;
  }, [stakingVaultChoice, customStakingVault]);

  const canSubmit = useMemo(() => {
    if (
      !isConnected ||
      !address ||
      !publicClient ||
      !walletClient ||
      !config?.ready ||
      !config.walletEligible ||
      !config.paymaster ||
      pending
    ) {
      return false;
    }
    if (operationType === "transfer") {
      return Boolean(token && recipient.trim() && amount.trim());
    }
    if (operationType === "swap") {
      return Boolean(token && resolvedBuyToken && amount.trim());
    }
    if (operationType === "stake") {
      if (!activeStakingAddress) return false;
      if (stakeAction === "relockAll" || stakeAction === "withdrawMatured") return true;
      return Boolean(amount.trim());
    }
    return false;
  }, [
    isConnected,
    address,
    publicClient,
    walletClient,
    config,
    pending,
    operationType,
    token,
    recipient,
    amount,
    resolvedBuyToken,
    activeStakingAddress,
    stakeAction,
  ]);

  async function executeSponsoredOperation() {
    setError("");
    setTxHash(null);
    if (!address || !walletClient || !publicClient || !config?.paymaster) return;
    setPending(true);
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
        throw new Error("Base is selected. Review your operation, then submit it again.");
      }

      const calls: { to: Address; value: bigint; data: Hex }[] = [];

      if (operationType === "transfer") {
        if (!token) throw new Error("Choose a portfolio token to transfer.");
        if (!isAddress(recipient.trim())) throw new Error("Enter a valid recipient address.");
        const to = getAddress(recipient.trim());
        if (to.toLowerCase() === address.toLowerCase()) {
          throw new Error("Recipient must be another address.");
        }
        const units = parseUnits(amount.trim(), token.decimals);
        if (units <= 0n || units > token.balance) {
          throw new Error("Enter an amount within your token balance.");
        }
        calls.push({
          to: token.address,
          value: 0n,
          data: encodeFunctionData({
            abi: rewardTokenAbi,
            functionName: "transfer",
            args: [to, units],
          }),
        });
      } else if (operationType === "swap") {
        if (!token) throw new Error("Choose a portfolio token to swap.");
        if (!resolvedBuyToken) throw new Error("Choose an output token.");
        const units = parseUnits(amount.trim(), token.decimals);
        if (units <= 0n || units > token.balance) {
          throw new Error("Enter an amount within your token balance.");
        }
        const sellTokenObj: Token = {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          chainId: base.id,
          kind: "erc20",
        };
        const routeResult = await quoteSmartRoutes(
          publicClient,
          sellTokenObj,
          resolvedBuyToken,
          units
        );
        if (!routeResult.best) {
          throw new Error("No liquid DEX route found on Base for this token pair.");
        }
        const slippageBps = BigInt(
          Math.max(10, Math.min(2000, Math.round((Number(slippagePct) || 1) * 100)))
        );
        const minimumOut = calculateMinimumAmountOut(routeResult.best.output, slippageBps);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        const swapCallSpec = routeSwapCall(
          routeResult.best.route,
          sellTokenObj,
          resolvedBuyToken,
          units,
          minimumOut,
          address,
          deadline
        );
        const currentAllowance = await publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, routeResult.best.route.router],
        });
        if (currentAllowance < units) {
          calls.push({
            to: token.address,
            value: 0n,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [routeResult.best.route.router, units],
            }),
          });
        }
        calls.push({
          to: swapCallSpec.address,
          value: 0n,
          data: encodeFunctionData({
            abi: swapCallSpec.abi,
            functionName: swapCallSpec.functionName,
            args: swapCallSpec.args,
          }),
        });
      } else if (operationType === "stake") {
        if (!activeStakingAddress) throw new Error("Enter a valid Base staking contract address.");
        const vaultTokenAddress = await publicClient
          .readContract({
            address: activeStakingAddress,
            abi: stakingAbi,
            functionName: "token",
          })
          .catch(() => null);
        if (!vaultTokenAddress || !isAddress(vaultTokenAddress)) {
          throw new Error("Could not verify `token()` on that staking contract.");
        }
        if (stakeAction === "stake") {
          const decimals = await publicClient.readContract({
            address: vaultTokenAddress,
            abi: rewardTokenAbi,
            functionName: "decimals",
          });
          const balance = await publicClient.readContract({
            address: vaultTokenAddress,
            abi: rewardTokenAbi,
            functionName: "balanceOf",
            args: [address],
          });
          const units = parseUnits(amount.trim(), decimals);
          if (units <= 0n || units > balance) {
            throw new Error("Enter a stake amount within your token balance.");
          }
          const allowance = await publicClient.readContract({
            address: vaultTokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, activeStakingAddress],
          });
          if (allowance < units) {
            calls.push({
              to: vaultTokenAddress,
              value: 0n,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [activeStakingAddress, units],
              }),
            });
          }
          calls.push({
            to: activeStakingAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: stakingAbi,
              functionName: "stake",
              args: [units],
            }),
          });
        } else if (stakeAction === "unstake") {
          const decimals = await publicClient.readContract({
            address: vaultTokenAddress,
            abi: rewardTokenAbi,
            functionName: "decimals",
          });
          const units = parseUnits(amount.trim(), decimals);
          if (units <= 0n) throw new Error("Enter a positive unstake amount.");
          calls.push({
            to: activeStakingAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: stakingAbi,
              functionName: "unstake",
              args: [units],
            }),
          });
        } else if (stakeAction === "relockAll") {
          calls.push({
            to: activeStakingAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: stakingAbi,
              functionName: "relockAll",
            }),
          });
        } else {
          calls.push({
            to: activeStakingAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: stakingAbi,
              functionName: "withdrawMatured",
            }),
          });
        }
      }

      const code = await publicClient.getBytecode({ address });
      const expectedCode = `0xef0100${config.accountImplementation.slice(2).toLowerCase()}`;
      if (code && code !== "0x" && code.toLowerCase() !== expectedCode) {
        throw new Error("This wallet is delegated to a different smart account implementation.");
      }
      const authorization =
        code && code !== "0x"
          ? undefined
          : await walletClient.signAuthorization({
              account: walletClient.account,
              address: config.accountImplementation,
              chainId: base.id,
              nonce: await publicClient.getTransactionCount({ address }),
            });
      const account = await to7702SimpleSmartAccount({
        client: publicClient,
        owner: walletClient,
      });
      const smartClient = createSmartAccountClient({
        account,
        chain: base,
        bundlerTransport: http(`${window.location.origin}/api/paymaster/bundler`),
        paymaster: {
          getPaymasterStubData: async () => ({
            paymaster: config.paymaster!,
            paymasterData: `0x${"00".repeat(71)}` as Hex,
            paymasterVerificationGasLimit: 140_000n,
            paymasterPostOpGasLimit: 110_000n,
          }),
          getPaymasterData: async (operation) => {
            const response = await fetch("/api/paymaster/sign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sender: operation.sender,
                nonce: decimal(operation.nonce),
                callData: operation.callData,
                factory: operation.factory,
                factoryData: operation.factoryData,
                callGasLimit: decimal(operation.callGasLimit),
                verificationGasLimit: decimal(operation.verificationGasLimit),
                preVerificationGas: decimal(operation.preVerificationGas),
                maxFeePerGas: decimal(operation.maxFeePerGas),
                maxPriorityFeePerGas: decimal(operation.maxPriorityFeePerGas),
                paymasterVerificationGasLimit: decimal(
                  operation.paymasterVerificationGasLimit ?? 140_000n
                ),
                paymasterPostOpGasLimit: decimal(operation.paymasterPostOpGasLimit ?? 110_000n),
                authorization: authorization && {
                  address: authorization.address,
                  chainId: authorization.chainId,
                  nonce: String(authorization.nonce),
                  r: authorization.r,
                  s: authorization.s,
                  yParity: authorization.yParity,
                },
              }),
            });
            const result = (await response.json()) as { error?: string; paymasterData?: Hex };
            if (!response.ok || !result.paymasterData) {
              throw new Error(result.error ?? "Sponsorship declined.");
            }
            return {
              paymaster: config.paymaster!,
              paymasterData: result.paymasterData,
              paymasterVerificationGasLimit: operation.paymasterVerificationGasLimit ?? 140_000n,
              paymasterPostOpGasLimit: operation.paymasterPostOpGasLimit ?? 110_000n,
            };
          },
        },
      });
      const hash = await smartClient.sendTransaction({
        calls,
        authorization,
      });
      setTxHash(hash);
      refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sponsored operation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-indigo-100 bg-white shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Sponsored Portfolio Operations</CardTitle>
            <CardDescription className="mt-1">
              Transfer, swap, or stake any ERC-20 token you hold on Base. The paymaster covers ETH
              network gas and rewards your wallet with <strong>100 MRWD</strong> upon a successful
              operation. No MRWD is ever charged as a fee.
            </CardDescription>
          </div>
          {config && (
            <Badge
              variant="outline"
              className={
                config.eligibilityMode === "open_portfolio"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-indigo-200 bg-indigo-50 text-indigo-800"
              }
            >
              {config.eligibilityMode === "open_portfolio"
                ? "Open to All Base Portfolio Holders"
                : "Allowlist Mode"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isConnected && (
          <p className="text-sm text-slate-600">
            Connect your wallet to load your Base portfolio tokens and execute sponsored actions.
          </p>
        )}
        {isConnected && chainId !== base.id && (
          <p className="text-sm text-amber-800">Switch to Base to load your portfolio tokens.</p>
        )}
        {configError && (
          <p role="alert" className="text-sm text-rose-700">
            {configError}
          </p>
        )}
        {config && !config.ready && (
          <p className="text-sm text-amber-800">
            Sponsorship is awaiting the funded paymaster, signer, and bundler configuration.
          </p>
        )}
        {config?.ready && !config.walletEligible && (
          <p className="text-sm text-amber-800">
            This wallet is not currently eligible under the active allowlist policy.
          </p>
        )}

        <Tabs
          value={operationType}
          onValueChange={(val) => {
            setOperationType(val as OperationType);
            setError("");
            setTxHash(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="transfer" className="flex items-center gap-1.5">
              <Send className="size-3.5" /> Transfer Token
            </TabsTrigger>
            <TabsTrigger value="swap" className="flex items-center gap-1.5">
              <ArrowRightLeft className="size-3.5" /> Swap Token
            </TabsTrigger>
            <TabsTrigger value="stake" className="flex items-center gap-1.5">
              <Lock className="size-3.5" /> Stake / Vault
            </TabsTrigger>
          </TabsList>

          {/* Shared Portfolio Token Selector for Transfer & Swap */}
          {(operationType === "transfer" || operationType === "swap") && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-token">Portfolio token (Base ERC-20)</Label>
                <select
                  id="paymaster-token"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Choose a Base token from your portfolio</option>
                  {choices.map((choice) => (
                    <option key={choice.address} value={choice.address}>
                      {choice.symbol} · {formatUnits(choice.balance, choice.decimals)}
                    </option>
                  ))}
                  <option value="custom">Enter any Base ERC-20 contract…</option>
                </select>
              </div>
              {selected === "custom" && (
                <div className="space-y-1.5">
                  <Label htmlFor="paymaster-custom-token">Base token contract</Label>
                  <Input
                    id="paymaster-custom-token"
                    value={customAddress}
                    onChange={(event) => setCustomAddress(event.target.value)}
                    placeholder="0x…"
                  />
                  {customToken && (
                    <p className="text-xs text-slate-600">
                      {customToken.symbol} balance:{" "}
                      {formatUnits(customToken.balance, customToken.decimals)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <TabsContent value="transfer" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-recipient">Recipient address</Label>
                <Input
                  id="paymaster-recipient"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-amount">
                  Amount {token ? `(${token.symbol})` : ""}
                </Label>
                <Input
                  id="paymaster-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="swap" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-swap-amount">
                  Sell Amount {token ? `(${token.symbol})` : ""}
                </Label>
                <Input
                  id="paymaster-swap-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-buy-token">Buy Token (Base DEX Route)</Label>
                <select
                  id="paymaster-buy-token"
                  value={buyTokenSelection}
                  onChange={(event) => setBuyTokenSelection(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  {baseSwapTokens.map((item) => (
                    <option key={`${item.symbol}-${item.address}`} value={item.address}>
                      {item.symbol} — {item.name}
                    </option>
                  ))}
                  <option value="custom">Custom output ERC-20 address…</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-slippage">Max Slippage (%)</Label>
                <Input
                  id="paymaster-slippage"
                  value={slippagePct}
                  onChange={(event) => setSlippagePct(event.target.value)}
                  inputMode="decimal"
                  placeholder="1.0"
                />
              </div>
            </div>
            {buyTokenSelection === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-custom-buy">Custom output ERC-20 contract</Label>
                <Input
                  id="paymaster-custom-buy"
                  value={customBuyAddress}
                  onChange={(event) => setCustomBuyAddress(event.target.value)}
                  placeholder="0x…"
                />
              </div>
            )}
            {quotingSwap && (
              <p className="text-xs text-slate-500">
                Scanning Base Uniswap V3, Uniswap V2, and Aerodrome routes…
              </p>
            )}
            {swapQuoteInfo && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5 text-xs text-indigo-950">
                <span>
                  Best route via <strong>{swapQuoteInfo.venue}</strong> (Approve + Swap batched
                  atomically if needed)
                </span>
                <span className="font-mono font-bold">
                  Est. Output: {Number(swapQuoteInfo.estimatedOut).toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                  {swapQuoteInfo.buySymbol}
                </span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="stake" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-staking-vault">Staking Contract</Label>
                <select
                  id="paymaster-staking-vault"
                  value={stakingVaultChoice}
                  onChange={(event) =>
                    setStakingVaultChoice(event.target.value as "mutt_pro" | "custom")
                  }
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="mutt_pro">
                    MuttProStaking (MRWD · {MUTT_PRO_STAKING_ON_BASE.slice(0, 10)}…)
                  </option>
                  <option value="custom">Launchpad FeeDiscountStaking / Custom Vault…</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-stake-action">Staking Action</Label>
                <select
                  id="paymaster-stake-action"
                  value={stakeAction}
                  onChange={(event) => setStakeAction(event.target.value as StakeActionType)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="stake">Stake Tokens (Auto-batches Approve + Stake)</option>
                  {stakingVaultChoice === "mutt_pro" ? (
                    <>
                      <option value="relockAll">Relock All Deposits (MuttProStaking)</option>
                      <option value="withdrawMatured">
                        Withdraw Matured Deposits (MuttProStaking)
                      </option>
                    </>
                  ) : (
                    <option value="unstake">Unstake Tokens (FeeDiscountStaking)</option>
                  )}
                </select>
              </div>
              {(stakeAction === "stake" || stakeAction === "unstake") && (
                <div className="space-y-1.5">
                  <Label htmlFor="paymaster-stake-amount">Amount</Label>
                  <Input
                    id="paymaster-stake-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.0"
                  />
                </div>
              )}
            </div>
            {stakingVaultChoice === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="paymaster-custom-vault">
                  Launchpad FeeDiscountStaking Contract Address
                </Label>
                <Input
                  id="paymaster-custom-vault"
                  value={customStakingVault}
                  onChange={(event) => setCustomStakingVault(event.target.value)}
                  placeholder="0x… staking contract deployed via Launchpad"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="max-w-xl text-xs text-slate-600">
            <Coins className="mr-1 inline size-3.5 text-emerald-700" />
            Your wallet may ask you to authorize EIP-7702 account code on its first sponsored
            operation so your existing Base portfolio address can batch approvals and receive MRWD
            rewards directly.
          </p>
          <Button
            onClick={() => void executeSponsoredOperation()}
            disabled={!canSubmit}
            className="bg-indigo-700 hover:bg-indigo-800"
          >
            {pending
              ? "Waiting for wallet & bundler…"
              : operationType === "transfer"
                ? "Send with sponsored gas (+100 MRWD)"
                : operationType === "swap"
                  ? "Swap with sponsored gas (+100 MRWD)"
                  : "Execute staking with sponsored gas (+100 MRWD)"}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        {txHash && (
          <p className="text-sm text-emerald-700">
            Sponsored operation submitted:{" "}
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://basescan.org/tx/${txHash}`}
            >
              {txHash.slice(0, 10)}…
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
