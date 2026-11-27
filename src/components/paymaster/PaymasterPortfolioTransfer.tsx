import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Fuel,
  Lock,
  Send,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import { createSmartAccountClient } from "permissionless";
import {
  type Address,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  type Hex,
  http,
  isAddress,
  parseAbi,
  parseUnits,
  toHex,
} from "viem";
import { entryPoint07Abi, entryPoint07Address, toSmartAccount } from "viem/account-abstraction";
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
import { quoteSmartRoutes, routeSwapCall, SPONSORED_ROUTE_VENUES } from "@/lib/amm/smart-routing";
import { calculateMinimumAmountOut } from "@/lib/amm/swap-protection";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";
import {
  METAMASK_DESIGNATOR,
  sponsoredAccountProblem,
  SPONSORSHIP_UNAVAILABLE_REASONS,
} from "@/lib/paymaster/accounts";
import {
  SPONSORED_REWARD_PAYMASTER_ABI,
  SPONSORED_REWARD_PAYMASTER_BYTECODE,
} from "@/lib/paymaster/artifact";
import {
  BASE_ENTRYPOINT_V07,
  BASE_ENTRYPOINT_V08,
  MRWD_ON_BASE,
  readPaymasterStatus,
  rewardTokenAbi,
  SIMPLE_7702_ACCOUNT_ON_BASE,
  SPONSORED_REWARD_PAYMASTER_ON_BASE,
} from "@/lib/paymaster/client";

const MUTT_PRO_STAKING_ON_BASE = "0x67dBC193bF510225EBf189ab25dC3b34a32c1766" as const;
const PAYMASTER_STORAGE_KEY = "shaggy-sponsored-reward-paymaster-base-8453";
const SIMPLE_7702_DESIGNATOR = `0xef0100${SIMPLE_7702_ACCOUNT_ON_BASE.slice(2).toLowerCase()}`;

const metamaskDelegatorAbi = parseAbi([
  "function execute(bytes32 mode, bytes executionCalldata) payable",
]);

function packUints(upper: bigint, lower: bigint): Hex {
  return toHex((upper << 128n) | lower, { size: 32 });
}

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
  signerAddress?: Address | null;
  entryPoint: Address;
  entryPointV07?: Address;
  entryPointV08?: Address;
  accountImplementation: Address;
  metamaskAccountImplementation?: Address;
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
  const [buyTokenSelection, setBuyTokenSelection] = useState<string>(CANONICAL_BASE_CONTRACTS.USDC);
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
  const [upgradingPaymaster, setUpgradingPaymaster] = useState(false);
  const [upgradeStep, setUpgradeStep] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [walletBytecode, setWalletBytecode] = useState<Hex | null>(null);
  const [customPaymasterAddress, setCustomPaymasterAddress] = useState<Address | null>(() => {
    try {
      const saved = localStorage.getItem(PAYMASTER_STORAGE_KEY);
      return saved && isAddress(saved) ? getAddress(saved) : null;
    } catch {
      return null;
    }
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    const syncSavedPaymaster = () => {
      try {
        const saved = localStorage.getItem(PAYMASTER_STORAGE_KEY);
        setCustomPaymasterAddress(saved && isAddress(saved) ? getAddress(saved) : null);
      } catch {
        /* ignore storage errors */
      }
    };
    window.addEventListener("storage", syncSavedPaymaster);
    window.addEventListener("paymaster-address-changed", syncSavedPaymaster);
    return () => {
      window.removeEventListener("storage", syncSavedPaymaster);
      window.removeEventListener("paymaster-address-changed", syncSavedPaymaster);
    };
  }, []);

  useEffect(() => {
    if (!publicClient || !address) {
      setWalletBytecode(null);
      return;
    }
    let active = true;
    publicClient
      .getBytecode({ address })
      .then((code) => {
        if (active) setWalletBytecode((code?.toLowerCase() as Hex | undefined) ?? "0x");
      })
      .catch(() => {
        if (active) setWalletBytecode(null);
      });
    return () => {
      active = false;
    };
  }, [address, publicClient]);

  // Fall back to SPONSORED_REWARD_PAYMASTER_ON_BASE so live on-chain status loads immediately on Base
  const activePaymasterAddress: Address = useMemo(
    () => customPaymasterAddress ?? config?.paymaster ?? SPONSORED_REWARD_PAYMASTER_ON_BASE,
    [customPaymasterAddress, config?.paymaster]
  );

  const statusQuery = useQuery({
    queryKey: ["base-paymaster-status", activePaymasterAddress.toLowerCase()],
    queryFn: () => {
      if (!publicClient) throw new Error("Base RPC unavailable");
      return readPaymasterStatus(publicClient, activePaymasterAddress);
    },
    enabled: !!publicClient,
  });
  const paymasterStatus = statusQuery.isError ? undefined : statusQuery.data;
  const rewardLabel = paymasterStatus
    ? `${formatUnits(paymasterStatus.rewardAmount, paymasterStatus.rewardDecimals)} ${paymasterStatus.rewardSymbol}`
    : null;
  const isMetaMaskDelegator = walletBytecode === METAMASK_DESIGNATOR;
  const isSimple7702Delegator = walletBytecode === SIMPLE_7702_DESIGNATOR;
  // Shown before the user tries. No browser wallet can currently complete a sponsored operation;
  // see sponsoredAccountProblem for the reason per wallet type.
  const walletAccountProblem =
    address && walletBytecode !== null ? sponsoredAccountProblem(walletBytecode) : null;
  const needsV07PaymasterUpgrade =
    isMetaMaskDelegator &&
    chainId === base.id &&
    !!paymasterStatus &&
    paymasterStatus.owner.toLowerCase() === address?.toLowerCase() &&
    paymasterStatus.entryPoint.toLowerCase() === BASE_ENTRYPOINT_V08.toLowerCase();

  const connectedWalletTypeLabel = useMemo(() => {
    if (!isConnected || !address) return "Disconnected (Browser Wallet / EOA)";
    if (isMetaMaskDelegator) return "MetaMask 7702 Smart Account";
    if (isSimple7702Delegator) return "Simple 7702 Account (v0.8)";
    if (walletBytecode && walletBytecode !== "0x") return "Custom Delegated / Smart Account";
    return "EOA / Standard Browser Wallet";
  }, [isConnected, address, isMetaMaskDelegator, isSimple7702Delegator, walletBytecode]);

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

  // Audit Fix #7: Do not read balanceOf(tokenAddress) when disconnected (!address)
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
      address
        ? publicClient.readContract({
            address: tokenAddress,
            abi: rewardTokenAbi,
            functionName: "balanceOf",
            args: [address],
          })
        : Promise.resolve(0n),
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

  // Audit Fix #5: Automatically prevent same-token swap selection when user picks a sell token
  useEffect(() => {
    if (
      operationType === "swap" &&
      token &&
      resolvedBuyToken &&
      resolvedBuyToken.address.toLowerCase() === token.address.toLowerCase()
    ) {
      const wethLower = CANONICAL_BASE_CONTRACTS.WETH.toLowerCase();
      const nextTarget =
        token.address.toLowerCase() === wethLower
          ? CANONICAL_BASE_CONTRACTS.USDC
          : CANONICAL_BASE_CONTRACTS.WETH;
      if (buyTokenSelection.toLowerCase() !== nextTarget.toLowerCase()) {
        setBuyTokenSelection(nextTarget);
      }
    }
  }, [operationType, token, resolvedBuyToken, buyTokenSelection]);

  const isSameSwapToken =
    operationType === "swap" &&
    Boolean(
      token &&
        resolvedBuyToken &&
        resolvedBuyToken.address.toLowerCase() === token.address.toLowerCase()
    );

  const handleSelectPercentage = useCallback(
    (pct: 25 | 50 | 75 | 100) => {
      if (!token || token.balance <= 0n) return;
      const portion = pct === 100 ? token.balance : (token.balance * BigInt(pct)) / 100n;
      setAmount(formatUnits(portion, token.decimals));
    },
    [token]
  );

  // Live Swap Quote preview when on Swap tab
  useEffect(() => {
    setSwapQuoteInfo(null);
    if (
      operationType !== "swap" ||
      !publicClient ||
      !token ||
      !resolvedBuyToken ||
      !amount.trim()
    ) {
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
    quoteSmartRoutes(publicClient, sellTokenObj, resolvedBuyToken, units, SPONSORED_ROUTE_VENUES)
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
      return Boolean(token && resolvedBuyToken && !isSameSwapToken && amount.trim());
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
    isSameSwapToken,
    activeStakingAddress,
    stakeAction,
  ]);

  async function upgradePaymasterForMetaMask() {
    setError("");
    setTxHash(null);
    if (!needsV07PaymasterUpgrade || !address || !walletClient || !publicClient) return;
    setUpgradingPaymaster(true);
    try {
      const oldStatus = await readPaymasterStatus(publicClient, activePaymasterAddress);
      if (
        oldStatus.owner.toLowerCase() !== address.toLowerCase() ||
        oldStatus.entryPoint.toLowerCase() !== BASE_ENTRYPOINT_V08.toLowerCase() ||
        oldStatus.deposit !== paymasterStatus.deposit ||
        oldStatus.availableRewards !== paymasterStatus.availableRewards
      ) {
        throw new Error("The paymaster changed. Review its refreshed details before migrating.");
      }
      const signerAddr = config?.signerAddress ?? oldStatus.signer;
      const rewardAmt = oldStatus.rewardAmount;
      const maxCostAmt = parseUnits("0.0001", 18);
      if (oldStatus.deposit > 0n) {
        setUpgradeStep(
          `Step 1/4: Withdrawing ${formatEther(oldStatus.deposit)} ETH deposit from v0.8 paymaster…`
        );
        const withdrawEthHash = await walletClient.writeContract({
          address: oldStatus.address,
          abi: SPONSORED_REWARD_PAYMASTER_ABI,
          functionName: "withdrawDeposit",
          args: [address, oldStatus.deposit],
          account: address,
          chain: base,
        });
        if (
          (await publicClient.waitForTransactionReceipt({ hash: withdrawEthHash })).status !==
          "success"
        )
          throw new Error("Deposit withdrawal reverted.");
      }

      // Step 2: Deploy EntryPoint v0.7 SponsoredRewardPaymaster (compatible with MetaMask 7702)
      setUpgradeStep("Step 2/4: Deploying EntryPoint v0.7 Paymaster for MetaMask Smart Account…");
      const deployHash = await walletClient.deployContract({
        abi: SPONSORED_REWARD_PAYMASTER_ABI,
        bytecode: SPONSORED_REWARD_PAYMASTER_BYTECODE,
        args: [MRWD_ON_BASE, address, signerAddr, rewardAmt, maxCostAmt],
        account: address,
        chain: base,
      });
      const deployReceipt = await publicClient.waitForTransactionReceipt({
        hash: deployHash,
      });
      if (deployReceipt.status !== "success" || !deployReceipt.contractAddress) {
        throw new Error("Deployment receipt did not include a contract address.");
      }
      const newPaymaster = getAddress(deployReceipt.contractAddress);
      try {
        localStorage.setItem(PAYMASTER_STORAGE_KEY, newPaymaster);
        window.dispatchEvent(new Event("paymaster-address-changed"));
      } catch {
        /* ignore storage errors */
      }
      setCustomPaymasterAddress(newPaymaster);

      // Step 3: Move MRWD rewards directly from old v0.8 paymaster to new v0.7 paymaster
      if (oldStatus.availableRewards > 0n) {
        setUpgradeStep(
          `Step 3/4: Moving ${formatUnits(oldStatus.availableRewards, oldStatus.rewardDecimals)} MRWD reward pool to new v0.7 paymaster…`
        );
        const moveRewardsHash = await walletClient.writeContract({
          address: oldStatus.address,
          abi: SPONSORED_REWARD_PAYMASTER_ABI,
          functionName: "withdrawRewards",
          args: [newPaymaster, oldStatus.availableRewards],
          account: address,
          chain: base,
        });
        if (
          (await publicClient.waitForTransactionReceipt({ hash: moveRewardsHash })).status !==
          "success"
        )
          throw new Error("Reward migration reverted.");
      }

      if (oldStatus.deposit > 0n) {
        setUpgradeStep(`Depositing the withdrawn ${formatEther(oldStatus.deposit)} ETH…`);
        const depositHash = await walletClient.writeContract({
          address: newPaymaster,
          abi: SPONSORED_REWARD_PAYMASTER_ABI,
          functionName: "deposit",
          value: oldStatus.deposit,
          account: address,
          chain: base,
        });
        if (
          (await publicClient.waitForTransactionReceipt({ hash: depositHash })).status !== "success"
        )
          throw new Error("Funding the new paymaster reverted.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paymaster v0.7 upgrade failed.");
    } finally {
      setUpgradeStep("");
      await queryClient.invalidateQueries({ queryKey: ["base-paymaster-status"] });
      setUpgradingPaymaster(false);
    }
  }

  async function executeSponsoredOperation() {
    setError("");
    setTxHash(null);
    const targetPaymaster = activePaymasterAddress;
    if (!address || !walletClient || !publicClient || !targetPaymaster) return;
    setPending(true);
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
        throw new Error("Base is selected. Review your operation, then submit it again.");
      }

      const calls: Array<{ to: Address; value: bigint; data: Hex }> = [];

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
        if (resolvedBuyToken.address.toLowerCase() === token.address.toLowerCase()) {
          throw new Error("Choose an output token different from the sell token.");
        }
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
          units,
          SPONSORED_ROUTE_VENUES
        );
        if (!routeResult.best) {
          throw new Error("No liquid DEX route found on Base for this token pair.");
        }
        const slippageBps = BigInt(
          Math.max(10, Math.min(1000, Math.round((Number(slippagePct) || 1) * 100)))
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

      // Only MetaMask's 7702 Smart Account runs on the reward paymaster's EntryPoint (v0.7).
      const code = (await publicClient.getBytecode({ address }))?.toLowerCase();
      const accountProblem = sponsoredAccountProblem(code);
      if (accountProblem) throw new Error(accountProblem);

      const account = await toSmartAccount({
        client: publicClient,
        entryPoint: {
          abi: entryPoint07Abi,
          address: entryPoint07Address,
          version: "0.7",
        },
        async getAddress() {
          return address;
        },
        async getFactoryArgs() {
          return { factory: undefined, factoryData: undefined };
        },
        async encodeCalls(innerCalls) {
          if (innerCalls.length === 1) {
            const single = innerCalls[0]!;
            const packed = encodePacked(
              ["address", "uint256", "bytes"],
              [single.to, single.value ?? 0n, single.data ?? "0x"]
            );
            return encodeFunctionData({
              abi: metamaskDelegatorAbi,
              functionName: "execute",
              args: ["0x0000000000000000000000000000000000000000000000000000000000000000", packed],
            });
          }
          const batchData = encodeAbiParameters(
            [
              {
                type: "tuple[]",
                components: [
                  { name: "target", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "callData", type: "bytes" },
                ],
              },
            ],
            [
              innerCalls.map((item) => ({
                target: item.to,
                value: item.value ?? 0n,
                callData: item.data ?? "0x",
              })),
            ]
          );
          return encodeFunctionData({
            abi: metamaskDelegatorAbi,
            functionName: "execute",
            args: ["0x0100000000000000000000000000000000000000000000000000000000000000", batchData],
          });
        },
        async getStubSignature() {
          return "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
        },
        async signMessage({ message }) {
          return walletClient.signMessage({ account: address, message });
        },
        async signTypedData(typedData) {
          return walletClient.signTypedData({
            ...(typedData as Parameters<typeof walletClient.signTypedData>[0]),
            account: address,
          });
        },
        async signUserOperation(parameters) {
          const senderAddr = parameters.sender ?? address;
          const accountGasLimits = packUints(
            parameters.verificationGasLimit ?? 0n,
            parameters.callGasLimit ?? 0n
          );
          const gasFees = packUints(
            parameters.maxPriorityFeePerGas ?? 0n,
            parameters.maxFeePerGas ?? 0n
          );
          const paymasterAndData: Hex = parameters.paymaster
            ? concat([
                parameters.paymaster,
                toHex(parameters.paymasterVerificationGasLimit ?? 0n, { size: 16 }),
                toHex(parameters.paymasterPostOpGasLimit ?? 0n, { size: 16 }),
                parameters.paymasterData ?? "0x",
              ])
            : "0x";
          return walletClient.signTypedData({
            account: address,
            domain: {
              name: "EIP7702StatelessDeleGator",
              version: "1",
              chainId: parameters.chainId ?? base.id,
              verifyingContract: senderAddr,
            },
            types: {
              PackedUserOperation: [
                { name: "sender", type: "address" },
                { name: "nonce", type: "uint256" },
                { name: "initCode", type: "bytes" },
                { name: "callData", type: "bytes" },
                { name: "accountGasLimits", type: "bytes32" },
                { name: "preVerificationGas", type: "uint256" },
                { name: "gasFees", type: "bytes32" },
                { name: "paymasterAndData", type: "bytes" },
                { name: "entryPoint", type: "address" },
              ],
            },
            primaryType: "PackedUserOperation",
            message: {
              sender: senderAddr,
              nonce: parameters.nonce,
              initCode: "0x",
              callData: parameters.callData,
              accountGasLimits,
              preVerificationGas: parameters.preVerificationGas ?? 0n,
              gasFees,
              paymasterAndData,
              entryPoint: entryPoint07Address,
            },
          });
        },
      });

      const smartClient = createSmartAccountClient({
        account,
        chain: base,
        // Fee estimation needs a public RPC: the bundler proxy only allows ERC-4337 methods.
        client: publicClient,
        bundlerTransport: http(`${window.location.origin}/api/paymaster/bundler`),
        paymaster: {
          getPaymasterStubData: async () => ({
            paymaster: targetPaymaster,
            paymasterData: `0x${"00".repeat(71)}` as Hex,
            paymasterVerificationGasLimit: 140_000n,
            paymasterPostOpGasLimit: 110_000n,
          }),
          getPaymasterData: async (operation) => {
            const response = await fetch("/api/paymaster/sign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                paymaster: targetPaymaster,
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
              }),
            });
            const result = (await response.json()) as { error?: string; paymasterData?: Hex };
            if (!response.ok || !result.paymasterData) {
              throw new Error(result.error ?? "Sponsorship declined.");
            }
            return {
              paymaster: targetPaymaster,
              paymasterData: result.paymasterData,
              paymasterVerificationGasLimit: operation.paymasterVerificationGasLimit ?? 140_000n,
              paymasterPostOpGasLimit: operation.paymasterPostOpGasLimit ?? 110_000n,
            };
          },
        },
      });
      const hash = await smartClient.sendTransaction({ calls });
      setTxHash(hash);
      refetch();
      void queryClient.invalidateQueries({
        queryKey: ["base-paymaster-status", targetPaymaster.toLowerCase()],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sponsored operation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-3xl border border-purple-200/80 bg-white/95 shadow-xl ring-1 ring-purple-500/10 backdrop-blur-xl">
      <div className="h-1 bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600" />
      <CardHeader className="border-b border-slate-100 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
              <Sparkles className="size-3.5" /> Gasless ERC-4337 Execution Terminal
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-950">
              Sponsored Portfolio Operations
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-relaxed text-slate-600">
              Inspect Base portfolio assets and preview transfer, swap, and staking operations.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50/90 px-3 py-1 font-mono text-xs font-bold text-emerald-900"
            >
              {rewardLabel
                ? `+${rewardLabel} / op`
                : statusQuery.isLoading
                  ? "Loading reward…"
                  : "Reward unavailable"}
            </Badge>
            {isMetaMaskDelegator && (
              <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-900">
                <Sparkles className="mr-1 size-3" /> MetaMask Smart Account (EIP-7702 · v0.7)
              </Badge>
            )}
            {config && (
              <Badge
                variant="outline"
                className={
                  config.eligibilityMode === "open_portfolio"
                    ? "border-purple-200 bg-purple-50 text-purple-900"
                    : "border-indigo-200 bg-indigo-50 text-indigo-800"
                }
              >
                {config.eligibilityMode === "open_portfolio"
                  ? "Open to All Base Portfolio Holders"
                  : "Allowlist Mode"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {!isConnected && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-purple-200/80 bg-purple-50/70 px-4 py-3 text-sm text-purple-950">
            <Wallet className="size-4 shrink-0 text-purple-700" />
            <span>Connect your wallet to load your Base portfolio tokens.</span>
          </div>
        )}
        {isConnected && chainId !== base.id && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="size-4 shrink-0 text-amber-700" />
            <span>Switch to Base to load your portfolio tokens.</span>
          </div>
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

        {needsV07PaymasterUpgrade && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-amber-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl space-y-1">
                <p className="flex items-center gap-1.5 font-semibold text-amber-950">
                  <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                  MetaMask Smart Account Detected (ERC-4337 EntryPoint v0.7)
                </p>
                <p className="text-xs leading-relaxed text-amber-900">
                  Your wallet pays transaction fees to deploy and fund the new v0.7 paymaster.
                  Migration moves {formatEther(paymasterStatus.deposit)} ETH from the old paymaster
                  through your wallet into the new deposit and transfers{" "}
                  {formatUnits(paymasterStatus.availableRewards, paymasterStatus.rewardDecimals)}{" "}
                  {paymasterStatus.rewardSymbol} from the old reward pool to the new contract.
                  Browser-wallet sponsorship remains unavailable after migration.
                </p>
                {upgradeStep && (
                  <p className="pt-1 font-mono text-xs font-semibold text-indigo-900">
                    {upgradeStep}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                className="bg-indigo-700 text-white hover:bg-indigo-800"
                disabled={upgradingPaymaster || pending}
                onClick={() => void upgradePaymasterForMetaMask()}
              >
                {upgradingPaymaster
                  ? "Upgrading Paymaster…"
                  : "Upgrade & Migrate Paymaster to v0.7"}
              </Button>
            </div>
          </div>
        )}

        {isMetaMaskDelegator &&
          paymasterStatus &&
          paymasterStatus.entryPoint.toLowerCase() === BASE_ENTRYPOINT_V07.toLowerCase() && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
              <span>
                MetaMask Smart Account (EIP-7702) paired with EntryPoint v0.7 Paymaster (
                <code className="font-mono">{paymasterStatus.address.slice(0, 10)}…</code> ·{" "}
                {formatEther(paymasterStatus.deposit)} ETH gas ·{" "}
                {formatUnits(paymasterStatus.availableRewards, paymasterStatus.rewardDecimals)}{" "}
                {paymasterStatus.rewardSymbol} rewards).
              </span>
            </div>
          )}

        {/* 2026 Smart Account Compatibility & Readiness Diagnostic Card */}
        <div
          role="status"
          className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/50 p-4 text-xs text-amber-950 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 pb-3">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-900">
              <ShieldAlert className="size-4 shrink-0 text-amber-700" />
              ERC-4337 / EIP-7702 Account Abstraction Readiness
            </div>
            <span className="rounded-full border border-amber-300/80 bg-amber-100/80 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900">
              {connectedWalletTypeLabel}
            </span>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5">
              <span className="text-[11px] font-medium text-slate-500">1. Wallet Delegation</span>
              <p className="mt-0.5 font-mono font-semibold text-slate-900">
                {connectedWalletTypeLabel}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5">
              <span className="text-[11px] font-medium text-slate-500">2. Target EntryPoint</span>
              <p className="mt-0.5 font-mono font-semibold text-slate-900">
                v0.7 · {BASE_ENTRYPOINT_V07.slice(0, 6)}…{BASE_ENTRYPOINT_V07.slice(-5)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5">
              <span className="text-[11px] font-medium text-slate-500">
                3. Active Paymaster &amp; Pool
              </span>
              <p className="mt-0.5 font-mono font-semibold text-slate-900">
                {activePaymasterAddress.slice(0, 6)}…{activePaymasterAddress.slice(-4)}
                {paymasterStatus
                  ? ` · ${Number(
                      formatUnits(paymasterStatus.availableRewards, paymasterStatus.rewardDecimals)
                    ).toLocaleString()} ${paymasterStatus.rewardSymbol}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <span>{walletAccountProblem ?? SPONSORSHIP_UNAVAILABLE_REASONS}</span>
          </div>
        </div>

        <Tabs
          value={operationType}
          onValueChange={(val) => {
            setOperationType(val as OperationType);
            setError("");
            setTxHash(null);
          }}
        >
          <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl bg-slate-100/90 p-1">
            <TabsTrigger
              value="transfer"
              className="flex items-center gap-1.5 rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-900 data-[state=active]:shadow-sm sm:text-sm"
            >
              <Send className="size-3.5" /> Transfer Token
            </TabsTrigger>
            <TabsTrigger
              value="swap"
              className="flex items-center gap-1.5 rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-900 data-[state=active]:shadow-sm sm:text-sm"
            >
              <ArrowRightLeft className="size-3.5" /> Swap Token
            </TabsTrigger>
            <TabsTrigger
              value="stake"
              className="flex items-center gap-1.5 rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-900 data-[state=active]:shadow-sm sm:text-sm"
            >
              <Lock className="size-3.5" /> Stake / Vault
            </TabsTrigger>
          </TabsList>

          {/* Shared Portfolio Token Selector for Transfer & Swap */}
          {(operationType === "transfer" || operationType === "swap") && (
            <div className="mt-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label
                      htmlFor="paymaster-token"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Portfolio token (Base ERC-20)
                    </Label>
                    {token && (
                      <span className="font-mono text-xs font-semibold text-purple-800">
                        Balance: {formatUnits(token.balance, token.decimals)} {token.symbol}
                      </span>
                    )}
                  </div>
                  <select
                    id="paymaster-token"
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                    className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
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
                    <Label
                      htmlFor="paymaster-custom-token"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Base token contract
                    </Label>
                    <Input
                      id="paymaster-custom-token"
                      value={customAddress}
                      onChange={(event) => setCustomAddress(event.target.value)}
                      placeholder="0x…"
                      className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm"
                    />
                    {customToken && (
                      <p className="font-mono text-xs text-slate-600">
                        {customToken.symbol} balance:{" "}
                        {formatUnits(customToken.balance, customToken.decimals)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <TabsContent value="transfer" className="mt-4 space-y-4">
            <div className="grid gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="paymaster-recipient"
                  className="text-xs font-semibold text-slate-700"
                >
                  Recipient address
                </Label>
                <Input
                  id="paymaster-recipient"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x…"
                  className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="paymaster-amount"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Amount {token ? `(${token.symbol})` : ""}
                  </Label>
                  {token && token.balance > 0n && (
                    <div className="flex items-center gap-1">
                      {([25, 50, 75, 100] as const).map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleSelectPercentage(pct)}
                          className="rounded-md border border-purple-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800 transition hover:bg-purple-50"
                        >
                          {pct === 100 ? "MAX" : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  id="paymaster-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                  className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm tabular-nums"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="swap" className="mt-4 space-y-4">
            <div className="grid gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="paymaster-swap-amount"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Sell Amount {token ? `(${token.symbol})` : ""}
                  </Label>
                  {token && token.balance > 0n && (
                    <div className="flex items-center gap-1">
                      {([25, 50, 75, 100] as const).map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleSelectPercentage(pct)}
                          className="rounded-md border border-purple-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800 transition hover:bg-purple-50"
                        >
                          {pct === 100 ? "MAX" : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  id="paymaster-swap-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                  className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="paymaster-buy-token"
                  className="text-xs font-semibold text-slate-700"
                >
                  Buy Token (Base DEX Route)
                </Label>
                <select
                  id="paymaster-buy-token"
                  value={buyTokenSelection}
                  onChange={(event) => setBuyTokenSelection(event.target.value)}
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
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
                <Label
                  htmlFor="paymaster-slippage"
                  className="text-xs font-semibold text-slate-700"
                >
                  Max Slippage (%)
                </Label>
                <Input
                  id="paymaster-slippage"
                  value={slippagePct}
                  onChange={(event) => setSlippagePct(event.target.value)}
                  inputMode="decimal"
                  placeholder="1.0"
                  className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm tabular-nums"
                />
              </div>
            </div>
            {buyTokenSelection === "custom" && (
              <div className="space-y-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
                <Label
                  htmlFor="paymaster-custom-buy"
                  className="text-xs font-semibold text-slate-700"
                >
                  Custom output ERC-20 contract
                </Label>
                <Input
                  id="paymaster-custom-buy"
                  value={customBuyAddress}
                  onChange={(event) => setCustomBuyAddress(event.target.value)}
                  placeholder="0x…"
                  className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm"
                />
              </div>
            )}
            {isSameSwapToken && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900">
                Choose an output token different from {token?.symbol} to calculate a Base DEX route.
              </p>
            )}
            {quotingSwap && (
              <p className="text-xs text-slate-500">
                Scanning Base Uniswap V3, Uniswap V2, and Aerodrome routes…
              </p>
            )}
            {swapQuoteInfo && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-purple-200 bg-purple-50/80 px-4 py-3 text-xs text-purple-950">
                <span>
                  Best route via <strong>{swapQuoteInfo.venue}</strong> (Approve + Swap batched
                  atomically if needed)
                </span>
                <span className="font-mono font-bold tabular-nums">
                  Est. Output:{" "}
                  {Number(swapQuoteInfo.estimatedOut) > 0 &&
                  Number(swapQuoteInfo.estimatedOut) < 0.0001
                    ? swapQuoteInfo.estimatedOut
                    : Number(swapQuoteInfo.estimatedOut).toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })}{" "}
                  {swapQuoteInfo.buySymbol}
                </span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="stake" className="mt-4 space-y-4">
            <div className="grid gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="paymaster-staking-vault"
                  className="text-xs font-semibold text-slate-700"
                >
                  Staking Contract
                </Label>
                <select
                  id="paymaster-staking-vault"
                  value={stakingVaultChoice}
                  onChange={(event) => {
                    const nextVault = event.target.value as "mutt_pro" | "custom";
                    setStakingVaultChoice(nextVault);
                    // Audit Fix #6: Reset stakeAction if switching to mutt_pro while "unstake" is selected
                    if (nextVault === "mutt_pro" && stakeAction === "unstake") {
                      setStakeAction("stake");
                    }
                    if (
                      nextVault === "custom" &&
                      (stakeAction === "relockAll" || stakeAction === "withdrawMatured")
                    ) {
                      setStakeAction("stake");
                    }
                  }}
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="mutt_pro">
                    MuttProStaking (MRWD · {MUTT_PRO_STAKING_ON_BASE.slice(0, 10)}…)
                  </option>
                  <option value="custom">Launchpad FeeDiscountStaking / Custom Vault…</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="paymaster-stake-action"
                  className="text-xs font-semibold text-slate-700"
                >
                  Staking Action
                </Label>
                <select
                  id="paymaster-stake-action"
                  value={stakeAction}
                  onChange={(event) => setStakeAction(event.target.value as StakeActionType)}
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
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
                  <Label
                    htmlFor="paymaster-stake-amount"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Amount
                  </Label>
                  <Input
                    id="paymaster-stake-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.0"
                    className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm tabular-nums"
                  />
                </div>
              )}
            </div>
            {stakingVaultChoice === "custom" && (
              <div className="space-y-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
                <Label
                  htmlFor="paymaster-custom-vault"
                  className="text-xs font-semibold text-slate-700"
                >
                  Launchpad FeeDiscountStaking Contract Address
                </Label>
                <Input
                  id="paymaster-custom-vault"
                  value={customStakingVault}
                  onChange={(event) => setCustomStakingVault(event.target.value)}
                  placeholder="0x… staking contract deployed via Launchpad"
                  className="h-10 rounded-xl border-slate-200 bg-white font-mono text-sm"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Coins className="size-3.5 text-emerald-700" />
              Sponsored operations need a smart account on your existing Base address; see the
              notice above for whether your wallet can use one today.
            </span>
            {paymasterStatus && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] text-slate-700">
                <Fuel className="size-3 text-purple-600" />
                Gas Pool: {formatEther(paymasterStatus.deposit)} ETH · Cooldown:{" "}
                {paymasterStatus.cooldownSeconds}s
              </span>
            )}
          </div>
          <Button
            onClick={() => void executeSponsoredOperation()}
            disabled={!canSubmit || walletBytecode === null || walletAccountProblem !== null}
            className="rounded-xl bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 px-5 font-semibold text-white shadow-md hover:from-purple-800 hover:via-fuchsia-700 hover:to-pink-700"
          >
            {pending
              ? "Waiting for wallet & bundler…"
              : operationType === "transfer"
                ? "Send with sponsored gas"
                : operationType === "swap"
                  ? "Swap with sponsored gas"
                  : "Execute staking with sponsored gas"}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        {txHash && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            Sponsored operation submitted:{" "}
            <a
              className="inline-flex items-center gap-1 font-mono underline"
              target="_blank"
              rel="noreferrer"
              href={`https://basescan.org/tx/${txHash}`}
            >
              {txHash.slice(0, 10)}… <ArrowUpRight className="size-3.5" />
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
