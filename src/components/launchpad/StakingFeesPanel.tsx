// src/components/launchpad/StakingFeesPanel.tsx
import { useState } from "react";

import { Coins } from "lucide-react";
import { toast } from "sonner";
import { type Address, formatUnits, parseAbi } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useReadContracts, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";

const STAKING_FEES_ABI = parseAbi([
  "function accruedFees() view returns (uint256)",
  "function admin() view returns (address)",
  "function withdrawFees(address to, uint256 amount)",
]);

interface StakingFeesPanelProps {
  stakingAddress: Address;
  tokenSymbol: string;
}

/**
 * Lets a launch's staking admin collect its unstake fees. Stays hidden for everyone else, and for
 * contracts launched before withdrawFees existed, where the accruedFees read fails.
 */
export function StakingFeesPanel({ stakingAddress, tokenSymbol }: StakingFeesPanelProps) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const contract = { address: stakingAddress, abi: STAKING_FEES_ABI, chainId: base.id } as const;
  const { data, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "accruedFees" },
      { ...contract, functionName: "admin" },
    ],
  });
  const fees = data?.[0]?.result;
  const admin = data?.[1]?.result;

  if (fees === undefined || !admin || !address) return null;
  if (admin.toLowerCase() !== address.toLowerCase()) return null;

  const handleWithdraw = async () => {
    if (chainId !== base.id) {
      toast.error("Please switch to Base Mainnet to withdraw.");
      return;
    }
    if (!walletClient || !publicClient) {
      toast.error("Wallet client is initializing. Please try again.");
      return;
    }
    try {
      setIsWithdrawing(true);
      const { request } = await publicClient.simulateContract({
        ...contract,
        functionName: "withdrawFees",
        args: [address, fees],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Withdrawal reverted");
      toast.success(`Withdrew ${formatUnits(fees, 18)} ${tokenSymbol} in staking fees.`);
      await refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-xs">
      <div>
        <p className="text-slate-500">Staking fees collected</p>
        <p className="font-bold text-slate-900">
          {formatUnits(fees, 18)} {tokenSymbol}
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => void handleWithdraw()}
        disabled={fees === 0n || isWithdrawing}
        className="bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
      >
        <Coins className="mr-1 size-3" />
        {isWithdrawing ? "Withdrawing..." : "Withdraw"}
      </Button>
    </div>
  );
}
