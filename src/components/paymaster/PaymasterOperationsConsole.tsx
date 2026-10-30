import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Fuel,
  LockKeyhole,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  type Address,
  formatEther,
  formatUnits,
  getAddress,
  type Hash,
  isAddress,
  parseUnits,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SPONSORED_REWARD_PAYMASTER_ABI,
  SPONSORED_REWARD_PAYMASTER_BYTECODE,
} from "@/lib/paymaster/artifact";
import {
  BASE_ENTRYPOINT_V07,
  BASE_ENTRYPOINT_V08,
  MRWD_ON_BASE,
  SPONSORED_REWARD_PAYMASTER_ON_BASE,
  type PaymasterStatus,
  readPaymasterStatus,
  rewardTokenAbi,
} from "@/lib/paymaster/client";

const storageKey = "shaggy-sponsored-reward-paymaster-base-8453";
const explorer = "https://basescan.org";

function savedAddress(): Address | undefined {
  try {
    const value = localStorage.getItem(storageKey);
    return value && isAddress(value)
      ? getAddress(value)
      : SPONSORED_REWARD_PAYMASTER_ON_BASE;
  } catch {
    return SPONSORED_REWARD_PAYMASTER_ON_BASE;
  }
}

function validAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new Error(`Enter a valid ${label} address.`);
  const result = getAddress(value);
  if (result === zeroAddress) throw new Error(`${label} cannot be the zero address.`);
  return result;
}

function positiveUnits(value: string, decimals: number, label: string): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`Enter a positive ${label} amount.`);
  const amount = parseUnits(value.trim(), decimals);
  if (amount <= 0n) throw new Error(`${label} must be greater than zero.`);
  return amount;
}

function baseLink(kind: "address" | "tx", value: string) {
  return `${explorer}/${kind}/${value}`;
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  unit,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`h-10 border-slate-200 bg-white font-mono text-sm focus-visible:ring-indigo-500 ${unit ? "pr-16" : ""}`}
          autoComplete="off"
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function PaymasterOperationsConsole() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: switchingChain } = useSwitchChain();

  const [contractAddress, setContractAddress] = useState<Address | undefined>(savedAddress);
  const [attachInput, setAttachInput] = useState(() => savedAddress() ?? "");
  const [status, setStatus] = useState<PaymasterStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(savedAddress()));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");
  const [lastHash, setLastHash] = useState<Hash>();

  const [tokenMeta, setTokenMeta] = useState<{
    address: Address;
    symbol: string;
    decimals: number;
    walletBalance?: bigint;
  }>();
  const [tokenError, setTokenError] = useState("");
  const [signerInput, setSignerInput] = useState("0x852Cd18B109Be741d04bBcb98CB2BD766D9A7d70");
  const [deployReward, setDeployReward] = useState("100");
  const [deployMaxCost, setDeployMaxCost] = useState("0.0001");

  const [depositAmount, setDepositAmount] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeDelay, setStakeDelay] = useState("86400");
  const [fundRewardsAmount, setFundRewardsAmount] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [maxCostAmount, setMaxCostAmount] = useState("");
  const [newSigner, setNewSigner] = useState("");
  const [cooldownInput, setCooldownInput] = useState("");
  const [withdrawDepositAmount, setWithdrawDepositAmount] = useState("");
  const [withdrawRewardAmount, setWithdrawRewardAmount] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");

  const actionLock = useRef(false);
  const readSequence = useRef(0);
  const isBaseWallet = isConnected && chainId === base.id && !!walletClient && !!address;
  const isOwner = !!status && !!address && status.owner.toLowerCase() === address.toLowerCase();
  const ownerEnabled = isBaseWallet && isOwner && !pending && !loading;
  const fundEnabled = isBaseWallet && !!status && !pending && !loading;

  const candidateToken = MRWD_ON_BASE;

  useEffect(() => {
    let cancelled = false;
    setTokenMeta(undefined);
    setTokenError("");
    if (!publicClient || !isAddress(candidateToken) || getAddress(candidateToken) === zeroAddress) {
      if (candidateToken) setTokenError("Enter a valid Base ERC-20 contract address.");
      return;
    }
    const token = getAddress(candidateToken);
    void (async () => {
      try {
        const code = await publicClient.getBytecode({ address: token });
        if (!code || code === "0x")
          throw new Error("No token contract exists at that Base address.");
        const [symbol, decimals, walletBalance] = await Promise.all([
          publicClient.readContract({
            address: token,
            abi: rewardTokenAbi,
            functionName: "symbol",
          }),
          publicClient.readContract({
            address: token,
            abi: rewardTokenAbi,
            functionName: "decimals",
          }),
          address
            ? publicClient.readContract({
                address: token,
                abi: rewardTokenAbi,
                functionName: "balanceOf",
                args: [address],
              })
            : Promise.resolve(undefined),
        ]);
        if (!cancelled)
          setTokenMeta({
            address: token,
            symbol,
            decimals,
            ...(walletBalance === undefined ? {} : { walletBalance }),
          });
      } catch (cause) {
        if (!cancelled)
          setTokenError(cause instanceof Error ? cause.message : "Token metadata is unavailable.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateToken, publicClient, address]);

  const refresh = useCallback(
    async (target: Address) => {
      if (!publicClient) {
        setError("Base RPC is unavailable. Try refreshing the page.");
        return;
      }
      const sequence = ++readSequence.current;
      setLoading(true);
      setError("");
      try {
        const next = await readPaymasterStatus(publicClient, target);
        if (sequence === readSequence.current) setStatus(next);
      } catch (cause) {
        if (sequence === readSequence.current) {
          setStatus(null);
          setError(
            cause instanceof Error ? cause.message : "Could not verify this paymaster on Base."
          );
        }
      } finally {
        if (sequence === readSequence.current) setLoading(false);
      }
    },
    [publicClient]
  );

  useEffect(() => {
    if (contractAddress) void refresh(contractAddress);
  }, [contractAddress, refresh]);

  useEffect(() => {
    const syncFromEvent = () => {
      const next = savedAddress();
      if (next) {
        setContractAddress(next);
        setAttachInput(next);
      }
    };
    window.addEventListener("paymaster-address-changed", syncFromEvent);
    return () => window.removeEventListener("paymaster-address-changed", syncFromEvent);
  }, []);

  const requireWallet = async () => {
    if (!publicClient || !walletClient || !address || chainId !== base.id)
      throw new Error("Connect a wallet on Base mainnet before submitting a transaction.");
    const [walletChainId, walletAddresses] = await Promise.all([
      walletClient.getChainId(),
      walletClient.getAddresses(),
    ]);
    if (walletChainId !== base.id || walletAddresses[0]?.toLowerCase() !== address.toLowerCase())
      throw new Error("The wallet account or network changed. Reconnect on Base and try again.");
    return { client: walletClient, rpc: publicClient, account: address };
  };

  const run = async (
    label: string,
    submit: () => Promise<Hash>,
    options: { ownerOnly?: boolean; deployment?: boolean } = {}
  ) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setPending(label);
    setError("");
    setNotice("");
    setLastHash(undefined);
    try {
      if (options.ownerOnly && !isOwner)
        throw new Error("Only the current onchain owner can perform this action.");
      const { rpc } = await requireWallet();
      const hash = await submit();
      setLastHash(hash);
      setNotice(`${label} submitted. Waiting for confirmation on Base.`);
      const receipt = await rpc.waitForTransactionReceipt({ hash, timeout: 180_000 });
      if (receipt.status !== "success")
        throw new Error(`${label} reverted. Inspect the transaction.`);
      if (options.deployment) {
        if (!receipt.contractAddress)
          throw new Error("The deployment receipt has no contract address.");
        const deployed = getAddress(receipt.contractAddress);
        await readPaymasterStatus(rpc, deployed);
        setContractAddress(deployed);
        setAttachInput(deployed);
        try {
          localStorage.setItem(storageKey, deployed);
          window.dispatchEvent(new Event("paymaster-address-changed"));
        } catch {
          /* The verified address remains visible in this session. */
        }
      } else if (contractAddress) {
        await refresh(contractAddress);
      }
      setNotice(`${label} confirmed on Base.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label} failed.`);
      setNotice("");
    } finally {
      actionLock.current = false;
      setPending("");
    }
  };

  const attach = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (!publicClient) throw new Error("Base RPC is unavailable.");
      const target = validAddress(attachInput.trim(), "paymaster");
      const verified = await readPaymasterStatus(publicClient, target);
      ++readSequence.current;
      setContractAddress(target);
      setStatus(verified);
      try {
        localStorage.setItem(storageKey, target);
        window.dispatchEvent(new Event("paymaster-address-changed"));
      } catch {
        /* Attaching still works if storage is unavailable. */
      }
      setNotice("Paymaster verified on Base and attached to this console.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not attach the paymaster.");
    } finally {
      actionLock.current = false;
      setLoading(false);
    }
  };

  const deploy = () =>
    void run(
      "Deploy paymaster",
      async () => {
        const { client, account } = await requireWallet();
        if (!tokenMeta || tokenMeta.address.toLowerCase() !== candidateToken.toLowerCase())
          throw new Error("Wait for the reward token to be verified on Base.");
        const signer = validAddress(signerInput.trim(), "sponsor signer");
        const reward = positiveUnits(deployReward, tokenMeta.decimals, "reward per operation");
        const maxCost = positiveUnits(deployMaxCost, 18, "maximum gas cost");
        return client.deployContract({
          abi: SPONSORED_REWARD_PAYMASTER_ABI,
          bytecode: SPONSORED_REWARD_PAYMASTER_BYTECODE,
          args: [tokenMeta.address, account, signer, reward, maxCost],
          account,
          chain: base,
        });
      },
      { deployment: true }
    );

  const write = (
    label: string,
    functionName:
      | "deposit"
      | "addStake"
      | "setRewardAmount"
      | "setMaxCostPerOp"
      | "setSponsorSigner"
      | "setCooldown"
      | "pause"
      | "unpause"
      | "withdrawDeposit"
      | "withdrawRewards"
      | "unlockStake"
      | "withdrawStake",
    args?: readonly unknown[],
    value?: bigint,
    ownerOnly = true
  ) => {
    void run(
      label,
      async () => {
        const { client, account } = await requireWallet();
        if (!status) throw new Error("Verify the paymaster before submitting a transaction.");
        // The ABI is generated from the deployed contract. Each caller validates its own inputs.
        return client.writeContract({
          address: status.address,
          abi: SPONSORED_REWARD_PAYMASTER_ABI,
          functionName,
          args,
          value,
          account,
          chain: base,
        } as Parameters<typeof client.writeContract>[0]);
      },
      { ownerOnly }
    );
  };

  const submitFunding = (kind: "deposit" | "stake" | "rewards") => {
    try {
      if (!status) throw new Error("Attach a verified paymaster first.");
      if (kind === "deposit") {
        write(
          "Fund ETH gas deposit",
          "deposit",
          undefined,
          positiveUnits(depositAmount, 18, "ETH deposit"),
          false
        );
      } else if (kind === "stake") {
        if (!/^\d+$/.test(stakeDelay.trim()))
          throw new Error("Enter a whole unstake delay in seconds.");
        const delay = Number(stakeDelay);
        if (!Number.isSafeInteger(delay) || delay <= 0 || delay > 0xffffffff)
          throw new Error("Unstake delay must be between 1 and 4,294,967,295 seconds.");
        if (delay < status.unstakeDelaySec)
          throw new Error(
            `Unstake delay cannot be less than the current ${status.unstakeDelaySec} seconds.`
          );
        write("Add ETH stake", "addStake", [delay], positiveUnits(stakeAmount, 18, "ETH stake"));
      } else {
        const amount = positiveUnits(fundRewardsAmount, status.rewardDecimals, status.rewardSymbol);
        void run("Fund reward pool", async () => {
          const { client, account, rpc } = await requireWallet();
          const balance = await rpc.readContract({
            address: status.rewardToken,
            abi: rewardTokenAbi,
            functionName: "balanceOf",
            args: [account],
          });
          if (amount > balance)
            throw new Error(`Wallet balance is below ${fundRewardsAmount} ${status.rewardSymbol}.`);
          return client.writeContract({
            address: status.rewardToken,
            abi: rewardTokenAbi,
            functionName: "transfer",
            args: [status.address, amount],
            account,
            chain: base,
          });
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid funding amount.");
    }
  };

  const updateReward = () => {
    try {
      if (!status) throw new Error("Attach a verified paymaster first.");
      write("Update reward amount", "setRewardAmount", [
        positiveUnits(rewardAmount, status.rewardDecimals, "reward"),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid reward amount.");
    }
  };

  const updateMaxCost = () => {
    try {
      write("Update gas cap", "setMaxCostPerOp", [positiveUnits(maxCostAmount, 18, "gas cap")]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid gas cap.");
    }
  };

  const updateCooldown = () => {
    try {
      if (!/^\d+$/.test(cooldownInput.trim()))
        throw new Error("Enter a whole cooldown duration in seconds.");
      const seconds = Number(cooldownInput);
      if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 604800)
        throw new Error("Cooldown must be between 0 and 604,800 seconds (7 days).");
      write("Update account cooldown", "setCooldown", [seconds]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid cooldown.");
    }
  };

  const withdraw = (kind: "deposit" | "rewards" | "stake") => {
    try {
      if (!status) throw new Error("Attach a verified paymaster first.");
      const recipient = validAddress(withdrawRecipient.trim(), "withdrawal recipient");
      if (kind === "stake") {
        if (!status.withdrawTime || status.withdrawTime * 1000 > Date.now())
          throw new Error("Stake is still locked. Wait for its withdrawal time.");
        write("Withdraw ETH stake", "withdrawStake", [recipient]);
      } else if (kind === "deposit") {
        const amount = positiveUnits(withdrawDepositAmount, 18, "ETH withdrawal");
        if (amount > status.deposit) throw new Error("Withdrawal exceeds the ETH deposit.");
        write("Withdraw ETH deposit", "withdrawDeposit", [recipient, amount]);
      } else {
        const amount = positiveUnits(
          withdrawRewardAmount,
          status.rewardDecimals,
          "reward withdrawal"
        );
        if (amount > status.availableRewards)
          throw new Error("Withdrawal exceeds unreserved reward tokens.");
        write("Withdraw reward tokens", "withdrawRewards", [recipient, amount]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid withdrawal.");
    }
  };

  const ready =
    !!status &&
    !status.paused &&
    status.deposit >= status.maxCostPerOp &&
    status.availableRewards >= status.rewardAmount;
  const stakeUnlocking = !!status && status.withdrawTime > 0;

  return (
    <section className="space-y-5" aria-labelledby="paymaster-console-title">
      <Card className="overflow-hidden border-indigo-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-indigo-700 via-violet-600 to-emerald-500" />
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">
                <ShieldCheck className="size-4" /> Base · ERC-4337{" "}
                {status?.entryPoint.toLowerCase() === BASE_ENTRYPOINT_V07.toLowerCase()
                  ? "v0.7 (MetaMask 7702 + Simple7702)"
                  : "v0.7 / v0.8"}
              </div>
              <CardTitle
                id="paymaster-console-title"
                className="text-2xl font-bold tracking-tight text-slate-950"
              >
                Paymaster operations
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl text-sm leading-relaxed">
                Sponsor ETH gas and reward successful smart-account operations with one configured
                ERC-20 token. Users can select eligible Base portfolio tokens as their action asset;
                that asset is independent of the reward token.
              </CardDescription>
            </div>
            {status && (
              <Badge
                className={
                  ready
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }
              >
                {ready ? "Onchain resources ready" : status.paused ? "Paused" : "Funding needed"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!isConnected && (
            <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
              <Wallet className="size-4 shrink-0" /> Connect a wallet to deploy or fund. You can
              still inspect an existing paymaster.
            </div>
          )}
          {isConnected && chainId !== base.id && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <span>
                Transactions require Base mainnet (chain 8453). Portfolio token choices appear after
                switching.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={switchingChain}
                onClick={() => switchChain({ chainId: base.id })}
              >
                {switchingChain ? "Switching…" : "Switch to Base"}
              </Button>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field
              id="paymaster-attach"
              label="Attach an existing Base paymaster"
              value={attachInput}
              onChange={setAttachInput}
              placeholder="0x… contract address"
            />
            <Button
              variant="outline"
              className="border-indigo-200 text-indigo-800 hover:bg-indigo-50"
              disabled={!!pending || loading}
              onClick={() => void attach()}
            >
              Verify and attach
            </Button>
          </div>
          {contractAddress && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold uppercase tracking-wide text-slate-500">
                  Attached address {status ? "· verified on Base" : "· verification needed"}
                </p>
                <a
                  className="inline-flex max-w-full items-center gap-1 break-all font-mono text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  href={baseLink("address", contractAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {contractAddress} <ArrowUpRight className="size-3 shrink-0" />
                </a>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={loading || !!pending}
                  onClick={() => void refresh(contractAddress)}
                >
                  <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh state
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={loading || !!pending}
                  onClick={() => {
                    ++readSequence.current;
                    setContractAddress(undefined);
                    setStatus(null);
                    setAttachInput("");
                    setError("");
                    setNotice("");
                    try {
                      localStorage.removeItem(storageKey);
                    } catch {
                      /* Session state is already detached. */
                    }
                  }}
                >
                  Detach
                </Button>
              </div>
            </div>
          )}
          {loading && (
            <p role="status" className="text-sm text-slate-600">
              Reading contract and EntryPoint state on Base…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {notice}
            </p>
          )}
          {lastHash && (
            <a
              className="inline-flex items-center gap-1 break-all font-mono text-xs font-semibold text-indigo-700 underline underline-offset-2"
              href={baseLink("tx", lastHash)}
              target="_blank"
              rel="noreferrer"
            >
              Transaction {lastHash}
              <ArrowUpRight className="size-3 shrink-0" />
            </a>
          )}
        </CardContent>
      </Card>

      {status ? (
        <>
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
              <div className="grid divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                    <Fuel className="size-4" /> ETH gas deposit
                  </div>
                  <p className="mt-2 break-all font-mono text-xl font-bold tabular-nums text-slate-950">
                    {formatEther(status.deposit)}{" "}
                    <span className="text-sm font-semibold text-slate-500">ETH</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    EntryPoint balance · pays sponsored gas
                  </p>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                    <LockKeyhole className="size-4" /> ETH stake
                  </div>
                  <p className="mt-2 break-all font-mono text-xl font-bold tabular-nums text-slate-950">
                    {formatEther(status.stake)}{" "}
                    <span className="text-sm font-semibold text-slate-500">ETH</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {status.staked
                      ? stakeUnlocking
                        ? "Unlocking"
                        : "Locked at EntryPoint"
                      : "No stake locked"}
                  </p>
                </div>
                <div className="bg-emerald-50/60 p-5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
                    <Coins className="size-4" /> ERC-20 reward pool
                  </div>
                  <p className="mt-2 break-all font-mono text-xl font-bold tabular-nums text-slate-950">
                    {formatUnits(status.availableRewards, status.rewardDecimals)}{" "}
                    <span className="text-sm font-semibold text-slate-500">
                      {status.rewardSymbol}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    Available · {formatUnits(status.reservedRewards, status.rewardDecimals)}{" "}
                    reserved
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-700">
                <span>
                  EntryPoint{" "}
                  {status.entryPoint.toLowerCase() === BASE_ENTRYPOINT_V07.toLowerCase()
                    ? "v0.7"
                    : "v0.8"}{" "}
                  <a
                    className="break-all font-mono text-indigo-700 underline"
                    href={baseLink("address", status.entryPoint)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {status.entryPoint}
                  </a>
                </span>
                <span>
                  Owner{" "}
                  <a
                    className="break-all font-mono text-indigo-700 underline"
                    href={baseLink("address", status.owner)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {status.owner}
                  </a>
                </span>
                <span>
                  Signer <span className="break-all font-mono">{status.signer}</span>
                </span>
                <span>
                  Reward token{" "}
                  <a
                    className="break-all font-mono text-indigo-700 underline"
                    href={baseLink("address", status.rewardToken)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {status.rewardToken}
                  </a>
                </span>
                {status.pendingOwner !== zeroAddress && (
                  <span>
                    Pending owner <span className="break-all font-mono">{status.pendingOwner}</span>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-slate-950">Fund the paymaster</CardTitle>
                <CardDescription>
                  Each action asks your wallet for confirmation. ETH gas, ETH stake, and reward
                  tokens are separate balances.
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100 pt-0">
                <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field
                    id="fund-gas"
                    label="ETH gas deposit"
                    value={depositAmount}
                    onChange={setDepositAmount}
                    placeholder="0.00"
                    unit="ETH"
                  />
                  <Button
                    disabled={!fundEnabled}
                    className="bg-indigo-700 hover:bg-indigo-800"
                    onClick={() => submitFunding("deposit")}
                  >
                    Deposit ETH
                  </Button>
                </div>
                {isOwner && (
                  <div className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field
                      id="fund-stake"
                      label="Add ETH stake"
                      value={stakeAmount}
                      onChange={setStakeAmount}
                      placeholder="0.00"
                      unit="ETH"
                    />
                    <Field
                      id="stake-delay"
                      label="Unstake delay"
                      value={stakeDelay}
                      onChange={setStakeDelay}
                      placeholder="86400"
                      unit="sec"
                    />
                    <Button
                      variant="outline"
                      disabled={!ownerEnabled}
                      onClick={() => submitFunding("stake")}
                    >
                      Add stake
                    </Button>
                  </div>
                )}
                <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field
                    id="fund-rewards"
                    label={`Fund reward pool (${status.rewardSymbol})`}
                    value={fundRewardsAmount}
                    onChange={setFundRewardsAmount}
                    placeholder="0.00"
                    unit={status.rewardSymbol}
                  />
                  <Button
                    variant="outline"
                    disabled={!fundEnabled}
                    onClick={() => submitFunding("rewards")}
                  >
                    Transfer tokens
                  </Button>
                </div>
                <p className="pt-3 text-xs leading-relaxed text-slate-600">
                  Funding sends {status.rewardSymbol} directly to the paymaster. The token used in a
                  portfolio operation can be different. With MRWD configured, successful operations
                  reward MRWD; users are never charged MRWD for sponsorship.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-slate-950">Sponsorship state</CardTitle>
                <CardDescription>Current contract limits from Base mainnet.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <span className="text-slate-600">Per successful operation</span>
                  <strong className="break-all text-right font-mono text-slate-950">
                    {formatUnits(status.rewardAmount, status.rewardDecimals)} {status.rewardSymbol}
                  </strong>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <span className="text-slate-600">Maximum ETH cost</span>
                  <strong className="break-all text-right font-mono text-slate-950">
                    {formatEther(status.maxCostPerOp)} ETH
                  </strong>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <span className="text-slate-600">Per-account cooldown</span>
                  <strong className="font-mono text-slate-950">{status.cooldownSeconds} sec</strong>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <span className="text-slate-600">Unstake delay</span>
                  <strong className="font-mono text-slate-950">{status.unstakeDelaySec} sec</strong>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  {ready ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                  )}
                  {ready
                    ? "Onchain gas and reward balances meet one operation's configured limits. A sponsor signing service and bundler are still required for user operations."
                    : status.paused
                      ? "Sponsorship is paused onchain."
                      : "At least one onchain resource is below the configured limit. Check gas deposit and available reward tokens."}
                </div>
              </CardContent>
            </Card>
          </div>

          {isOwner && (
            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="border-indigo-100 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950">Owner controls</CardTitle>
                  <CardDescription>
                    Only the current onchain owner can change these parameters.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field
                      id="owner-reward"
                      label={`Reward per successful operation (${status.rewardSymbol})`}
                      value={rewardAmount}
                      onChange={setRewardAmount}
                      placeholder={formatUnits(status.rewardAmount, status.rewardDecimals)}
                      unit={status.rewardSymbol}
                    />
                    <Button variant="outline" disabled={!ownerEnabled} onClick={updateReward}>
                      Set reward
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field
                      id="owner-gas-cap"
                      label="Maximum ETH cost per UserOperation"
                      value={maxCostAmount}
                      onChange={setMaxCostAmount}
                      placeholder={formatEther(status.maxCostPerOp)}
                      unit="ETH"
                    />
                    <Button variant="outline" disabled={!ownerEnabled} onClick={updateMaxCost}>
                      Set gas cap
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field
                      id="owner-cooldown"
                      label="Per-smart-account sponsorship cooldown"
                      value={cooldownInput}
                      onChange={setCooldownInput}
                      placeholder={String(status.cooldownSeconds)}
                      unit="sec"
                    />
                    <Button variant="outline" disabled={!ownerEnabled} onClick={updateCooldown}>
                      Set cooldown
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600">
                    Each smart account must wait this long between approved sponsored operations.
                    Range: 0 to 604,800 seconds (7 days).
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field
                      id="owner-signer"
                      label="Sponsor signer public address"
                      value={newSigner}
                      onChange={setNewSigner}
                      placeholder={status.signer}
                    />
                    <Button
                      variant="outline"
                      disabled={!ownerEnabled}
                      onClick={() => {
                        try {
                          write("Rotate sponsor signer", "setSponsorSigner", [
                            validAddress(newSigner.trim(), "sponsor signer"),
                          ]);
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : "Invalid signer.");
                        }
                      }}
                    >
                      Rotate signer
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600">
                    Signer rotation changes the public address the contract trusts. Configure the
                    matching signing service separately; never enter a private key here.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <span className="text-sm font-medium text-slate-700">
                      {status.paused
                        ? "Sponsorship is paused"
                        : "Sponsorship is accepting approved operations"}
                    </span>
                    <Button
                      variant={status.paused ? "default" : "outline"}
                      className={
                        status.paused
                          ? "bg-indigo-700 hover:bg-indigo-800"
                          : "border-amber-300 text-amber-900 hover:bg-amber-50"
                      }
                      disabled={!ownerEnabled}
                      onClick={() =>
                        write(
                          status.paused ? "Unpause sponsorship" : "Pause sponsorship",
                          status.paused ? "unpause" : "pause"
                        )
                      }
                    >
                      {status.paused ? (
                        "Unpause"
                      ) : (
                        <>
                          <PauseCircle className="mr-1.5 size-4" />
                          Pause
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950">Withdraw & unlock</CardTitle>
                  <CardDescription>
                    Withdrawals send funds to the recipient you enter. Reserved rewards cannot be
                    withdrawn.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field
                    id="withdraw-recipient"
                    label="Recipient address for every withdrawal below"
                    value={withdrawRecipient}
                    onChange={setWithdrawRecipient}
                    placeholder="0x… recipient"
                  />
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field
                      id="withdraw-gas"
                      label={`ETH gas deposit · ${formatEther(status.deposit)} ETH available`}
                      value={withdrawDepositAmount}
                      onChange={setWithdrawDepositAmount}
                      placeholder="0.00"
                      unit="ETH"
                    />
                    <Button
                      variant="outline"
                      disabled={!ownerEnabled || status.deposit === 0n}
                      onClick={() => withdraw("deposit")}
                    >
                      Withdraw ETH
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field
                      id="withdraw-rewards"
                      label={`Reward pool · ${formatUnits(status.availableRewards, status.rewardDecimals)} ${status.rewardSymbol} available`}
                      value={withdrawRewardAmount}
                      onChange={setWithdrawRewardAmount}
                      placeholder="0.00"
                      unit={status.rewardSymbol}
                    />
                    <Button
                      variant="outline"
                      disabled={!ownerEnabled || status.availableRewards === 0n}
                      onClick={() => withdraw("rewards")}
                    >
                      Withdraw tokens
                    </Button>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <LockKeyhole className="size-4 text-violet-700" /> Stake lock
                    </div>
                    <p className="mt-1">
                      {stakeUnlocking
                        ? `Unlock requested. Withdraw after ${new Date(status.withdrawTime * 1000).toLocaleString()}.`
                        : status.staked
                          ? `Locked. Unlock starts the ${status.unstakeDelaySec}-second waiting period.`
                          : "No ETH stake is currently locked."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!ownerEnabled || !status.staked || stakeUnlocking}
                        onClick={() => write("Unlock ETH stake", "unlockStake")}
                      >
                        Unlock stake
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !ownerEnabled ||
                          !stakeUnlocking ||
                          status.withdrawTime * 1000 > Date.now()
                        }
                        onClick={() => withdraw("stake")}
                      >
                        Withdraw stake
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          {!isOwner && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Read-only view. Owner controls are available only to{" "}
              <span className="break-all font-mono">{status.owner}</span> on Base.
            </p>
          )}
        </>
      ) : !loading && !contractAddress ? (
        <Card className="border-indigo-100 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">
              Deploy a sponsored reward paymaster
            </CardTitle>
            <CardDescription>
              MRWD is the reward token. The user's portfolio token is chosen in the transfer form
              above.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenMeta ? (
              <p className="text-xs text-slate-700">
                Verified token: <strong>{tokenMeta.symbol}</strong> · {tokenMeta.decimals} decimals
                {tokenMeta.walletBalance !== undefined
                  ? ` · wallet holds ${formatUnits(tokenMeta.walletBalance, tokenMeta.decimals)}`
                  : ""}
              </p>
            ) : tokenError ? (
              <p role="alert" className="text-xs text-rose-800">
                {tokenError}
              </p>
            ) : (
              <p className="text-xs text-slate-500">Checking token metadata on Base…</p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="deploy-signer"
                label="Sponsor signer public address"
                value={signerInput}
                onChange={setSignerInput}
                placeholder="0x… signing service address"
              />
              <Field
                id="deploy-reward"
                label="Reward per successful operation"
                value={deployReward}
                onChange={setDeployReward}
                placeholder="Enter amount"
                unit={tokenMeta?.symbol ?? "token"}
              />
              <Field
                id="deploy-max-cost"
                label="Maximum ETH cost per UserOperation"
                value={deployMaxCost}
                onChange={setDeployMaxCost}
                placeholder="0.00"
                unit="ETH"
              />
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-xs leading-relaxed text-indigo-950">
              The connected wallet becomes owner. Deployment creates the contract only; fund its ETH
              deposit and reward pool afterward. A separate signing service and bundler are required
              to sponsor user operations.
            </div>
            <Button
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={!isBaseWallet || !!pending || !tokenMeta || !!tokenError}
              onClick={deploy}
            >
              {pending || "Deploy with wallet"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
