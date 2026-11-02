// src/components/launchpad/LaunchedVaultPanel.tsx
import { useState } from "react";

import { Vault } from "lucide-react";
import { toast } from "sonner";
import { type Address, erc20Abi, formatUnits, maxUint256, parseAbi, parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useReadContracts, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { positiveAmount } from "@/lib/amm/own-dex";
import { bufferedGas } from "@/lib/gas";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";

const VAULT_ABI = parseAbi([
  "function underlyingAsset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function sharesOf(address) view returns (uint256)",
  "function performanceFeeBps() view returns (uint16)",
  "function deposit(uint256) returns (uint256)",
  "function withdraw(uint256) returns (uint256)",
  "function paused() view returns (bool)",
  "function admin() view returns (address)",
  "function setPaused(bool)",
  "function emergencyWithdrawFromAave(uint256) returns (uint256)",
  "function emergencyWithdrawFromComet(uint256) returns (uint256)",
]);

export type VaultMarket = "aave" | "compound";

const MARKET = {
  aave: { name: "Aave", recover: "emergencyWithdrawFromAave" },
  compound: { name: "Compound", recover: "emergencyWithdrawFromComet" },
} as const;

type VaultAction = "deposit" | "withdraw" | "pause" | "resume" | "recover";

const USDC = CANONICAL_BASE_CONTRACTS.USDC;
const USDC_DECIMALS = 6;
const zeroAddress: Address = "0x0000000000000000000000000000000000000000";
const fmtUsdc = (units: bigint) =>
  Number(formatUnits(units, USDC_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });

interface LaunchedVaultPanelProps {
  vaultAddress: Address;
  label: string;
  /** Lending market behind the vault; picks the admin's recovery call. */
  market: VaultMarket;
}

/**
 * Deposit and withdraw for one launched USDC vault (YieldStakingVault or CompoundYieldVault, which
 * share these functions). Stays hidden for vaults from retired cards, which lack underlyingAsset.
 * Builds with a pause show its state to everyone and pause / recovery controls to the vault admin;
 * recovery only moves funds from the lending market back into the vault, never to the admin.
 */
export function LaunchedVaultPanel({ vaultAddress, label, market }: LaunchedVaultPanelProps) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { data: wallet } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<VaultAction | null>(null);

  const vault = { address: vaultAddress, abi: VAULT_ABI, chainId: base.id } as const;
  const { data, refetch } = useReadContracts({
    // Sibling vault panels spend the same USDC, so none can rely on its own refetch alone.
    query: { refetchInterval: 15_000 },
    contracts: [
      { ...vault, functionName: "underlyingAsset" },
      { ...vault, functionName: "totalAssets" },
      { ...vault, functionName: "totalShares" },
      { ...vault, functionName: "sharesOf", args: [address ?? zeroAddress] },
      { ...vault, functionName: "performanceFeeBps" },
      {
        address: USDC,
        abi: erc20Abi,
        chainId: base.id,
        functionName: "balanceOf",
        args: [address ?? zeroAddress],
      },
      // Older vault builds have no pause; these reads then fail and the controls stay hidden.
      { ...vault, functionName: "paused" },
      { ...vault, functionName: "admin" },
    ],
  });
  const asset = data?.[0]?.result;
  const totalAssets = data?.[1]?.result;
  const totalShares = data?.[2]?.result;
  const shares = data?.[3]?.result;
  const feeBps = data?.[4]?.result;
  const usdcBalance = data?.[5]?.result;
  const paused = data?.[6]?.result;
  const vaultAdmin = data?.[7]?.result;

  if (
    asset?.toLowerCase() !== USDC.toLowerCase() ||
    totalAssets === undefined ||
    totalShares === undefined ||
    shares === undefined ||
    feeBps === undefined
  ) {
    return null;
  }

  const positionValue = totalShares > 0n ? (shares * totalAssets) / totalShares : 0n;
  const depositUnits = positiveAmount(amount, USDC_DECIMALS)
    ? parseUnits(amount.trim(), USDC_DECIMALS)
    : 0n;

  const isAdmin =
    paused !== undefined &&
    !!address &&
    !!vaultAdmin &&
    vaultAdmin.toLowerCase() === address.toLowerCase();
  const { name: marketName, recover } = MARKET[market];

  const send = async (action: VaultAction) => {
    if (!address || !wallet || !client) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (chainId !== base.id) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }
    const value =
      action === "deposit" ? depositUnits : action === "withdraw" ? shares : maxUint256;
    if (value <= 0n) return;
    if (action === "deposit" && usdcBalance !== undefined && value > usdcBalance) {
      toast.error(`This wallet holds ${fmtUsdc(usdcBalance)} USDC.`);
      return;
    }
    setBusy(action);
    try {
      if (action === "deposit") {
        const allowance = await client.readContract({
          address: USDC,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, vaultAddress],
        });
        if (allowance < value) {
          const { request } = await client.simulateContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "approve",
            args: [vaultAddress, value],
            account: address,
          });
          const approval = await wallet.writeContract(request);
          const approved = await client.waitForTransactionReceipt({ hash: approval });
          if (approved.status !== "success") throw new Error("Approval reverted");
        }
      }
      let hash: `0x${string}`;
      if (action === "pause" || action === "resume") {
        const call = {
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: "setPaused",
          args: [action === "pause"],
          account: address,
        } as const;
        const { request } = await client.simulateContract(call);
        const gas = bufferedGas(await client.estimateContractGas(call));
        hash = await wallet.writeContract({ ...request, gas });
      } else {
        const call = {
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: action === "recover" ? recover : action,
          args: [value],
          account: address,
        } as const;
        const { request } = await client.simulateContract(call);
        const gas = bufferedGas(await client.estimateContractGas(call));
        hash = await wallet.writeContract({ ...request, gas });
      }
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Vault transaction reverted");
      toast.success(
        {
          deposit: `Deposited into ${label}.`,
          withdraw: `Withdrew from ${label}.`,
          pause: `Paused new deposits into ${label}.`,
          resume: `Resumed deposits into ${label}.`,
          recover: `Moved ${label}'s funds from ${marketName} into the vault.`,
        }[action]
      );
      setAmount("");
      await refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Vault transaction failed");
    } finally {
      setBusy(null);
    }
  };

  const inputId = `vault-amount-${vaultAddress}`;
  return (
    <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 font-bold text-slate-900">
          <Vault className="size-3 text-indigo-600" /> {label}
        </p>
        <p className="text-slate-500">{feeBps / 100}% fee on yield</p>
      </div>
      <p className="text-slate-600">
        Your position: <strong>{fmtUsdc(positionValue)} USDC</strong>
      </p>
      {paused && (
        <p role="status" className="rounded bg-amber-50 p-1.5 font-semibold text-amber-800">
          Deposits are paused by the vault admin. Withdrawals still work.
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-slate-500">
          Deposit USDC
          {usdcBalance !== undefined && ` (wallet: ${fmtUsdc(usdcBalance)})`}
        </label>
        <Input
          id={inputId}
          value={amount}
          inputMode="decimal"
          placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy !== null}
          className="h-8 bg-white text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          onClick={() => void send("deposit")}
          disabled={busy !== null || depositUnits === 0n || paused === true}
          className="bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700"
        >
          {busy === "deposit" ? "Depositing..." : "Deposit"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void send("withdraw")}
          disabled={busy !== null || shares === 0n}
          className="text-xs font-semibold"
        >
          {busy === "withdraw" ? "Withdrawing..." : "Withdraw all"}
        </Button>
      </div>
      {isAdmin && (
        <div className="space-y-1.5 border-t border-indigo-100 pt-2">
          <p className="font-semibold text-slate-700">Vault admin</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void send(paused ? "resume" : "pause")}
            disabled={busy !== null}
            className="w-full text-xs font-semibold"
          >
            {busy === "pause"
              ? "Pausing..."
              : busy === "resume"
                ? "Resuming..."
                : paused
                  ? "Resume deposits"
                  : "Pause deposits"}
          </Button>
          {paused && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void send("recover")}
                disabled={busy !== null}
                className="w-full text-xs font-semibold"
              >
                {busy === "recover"
                  ? "Moving funds..."
                  : `Move all funds from ${marketName} into the vault`}
              </Button>
              <p className="text-slate-500">
                Recovery keeps the USDC in this vault for depositors to withdraw; nothing is sent
                to the admin.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
