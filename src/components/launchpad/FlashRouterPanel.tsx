// src/components/launchpad/FlashRouterPanel.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Zap } from "lucide-react";
import { toast } from "sonner";
import { type Address, erc20Abi, formatUnits, parseAbi } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useReadContracts, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";

const ROUTER_ABI = parseAbi([
  "function admin() view returns (address)",
  "function isOperator(address) view returns (bool)",
  "function rescueTokens(address token, address to, uint256 amount)",
]);

const USDC = CANONICAL_BASE_CONTRACTS.USDC;
/** The router the Arbitrage page's flash loan tab reads when it opens. */
const ACTIVE_ROUTER_KEY = "shaggy_dogg_atomic_router";

interface FlashRouterPanelProps {
  routerAddress: Address;
}

/**
 * Admin controls for a launched flash arbitrage router. Stays hidden for everyone else, and for
 * launches that deployed the older AaveFlashBorrower, which has no isOperator.
 */
export function FlashRouterPanel({ routerAddress }: FlashRouterPanelProps) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { data: wallet } = useWalletClient();
  const navigate = useNavigate();
  const [withdrawing, setWithdrawing] = useState(false);

  const router = { address: routerAddress, abi: ROUTER_ABI, chainId: base.id } as const;
  const { data, refetch } = useReadContracts({
    contracts: [
      { ...router, functionName: "admin" },
      { ...router, functionName: "isOperator", args: [routerAddress] },
      {
        address: USDC,
        abi: erc20Abi,
        chainId: base.id,
        functionName: "balanceOf",
        args: [routerAddress],
      },
    ],
  });
  const admin = data?.[0]?.result;
  const isRouter = data?.[1]?.status === "success";
  const usdc = data?.[2]?.result;

  if (!address || !admin || !isRouter || admin.toLowerCase() !== address.toLowerCase()) return null;

  const withdraw = async () => {
    if (chainId !== base.id) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }
    if (!wallet || !client || !usdc) return;
    setWithdrawing(true);
    try {
      const { request } = await client.simulateContract({
        ...router,
        functionName: "rescueTokens",
        args: [USDC, address, usdc],
        account: address,
      });
      const hash = await wallet.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Withdrawal reverted");
      toast.success(`Withdrew ${formatUnits(usdc, 6)} USDC from the router.`);
      await refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  const useOnArbitragePage = () => {
    localStorage.setItem(ACTIVE_ROUTER_KEY, routerAddress);
    navigate("/launchpad/arbitrage/flashloan");
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/40 p-2.5 text-xs">
      <p className="flex items-center gap-1 font-bold text-slate-900">
        <Zap className="size-3 text-amber-600" /> Flash arbitrage router
      </p>
      <p className="text-slate-600">
        USDC held: <strong>{usdc === undefined ? "—" : formatUnits(usdc, 6)}</strong>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          onClick={useOnArbitragePage}
          className="bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
        >
          Use for arbitrage
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void withdraw()}
          disabled={withdrawing || !usdc}
          className="text-xs font-semibold"
        >
          {withdrawing ? "Withdrawing..." : "Withdraw USDC"}
        </Button>
      </div>
    </div>
  );
}
