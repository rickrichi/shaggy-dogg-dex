// src/components/liquidity/V3LiquidityManager.tsx
import { useState } from "react";
import { Link } from "react-router-dom";

import { Coins, ExternalLink, Layers, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStakedPortfolio } from "@/hooks/useStakedPortfolio";
import {
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  NONFUNGIBLE_POSITION_MANAGER_BASE,
} from "@/lib/amm/uniswap-v3";

import type { PositionCustody, V3Position } from "@/lib/staked-positions";

const CUSTODY_LABEL: Record<PositionCustody, string> = {
  wallet: "In wallet",
  staker: "Staked",
  timelock: "Timelocked",
};

export function V3LiquidityManager() {
  const { address: userAddress, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const portfolio = useStakedPortfolio(userAddress);
  const [busyTokenId, setBusyTokenId] = useState<string | null>(null);

  const positions = portfolio.data?.positions ?? [];
  const loading = portfolio.isFetching;

  const handleCollect = async (pos: V3Position) => {
    if (
      !walletClient ||
      !publicClient ||
      !userAddress ||
      chainId !== base.id ||
      busyTokenId !== null
    )
      return;
    setBusyTokenId(pos.tokenId);
    try {
      const max128 = (1n << 128n) - 1n;
      const { request } = await publicClient.simulateContract({
        address: NONFUNGIBLE_POSITION_MANAGER_BASE,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: "collect",
        args: [
          {
            tokenId: BigInt(pos.tokenId),
            recipient: userAddress,
            amount0Max: max128,
            amount1Max: max128,
          },
        ],
        account: userAddress,
      });

      if (
        (await walletClient.getChainId()) !== base.id ||
        (await walletClient.getAddresses())[0]?.toLowerCase() !== userAddress.toLowerCase()
      ) {
        throw new Error("Wallet changed. Refresh your positions.");
      }
      const tx = await walletClient.writeContract({ ...request, chain: base });
      toast.info("Collecting fees from Uniswap V3 position...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("Collect reverted");

      toast.success(`Collected fees for NFT #${pos.tokenId}!`);
      await portfolio.refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to collect fees");
    } finally {
      setBusyTokenId(null);
    }
  };

  return (
    <Card className="border-indigo-100 bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Layers className="size-5 text-indigo-600" />
              Your Uniswap V3 Positions
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Every position you hold, stake, or lock on Base Mainnet. Collected WETH remains WETH.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void portfolio.refetch()}
            disabled={loading || !isConnected}
            className="text-xs"
          >
            <RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {portfolio.data?.incomplete && (
          <p role="status" className="text-xs font-semibold text-amber-800">
            Some position reads failed, so this list may be incomplete.
          </p>
        )}
        {positions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
            <Coins className="mx-auto size-8 text-gray-400" />
            {!isConnected ? (
              <p className="mt-2 text-sm font-semibold text-gray-700">
                Connect a wallet to see your positions
              </p>
            ) : portfolio.isError ? (
              <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
                Could not load your positions. Please refresh.
              </p>
            ) : portfolio.isPending || portfolio.isFetching ? (
              <p className="mt-2 text-sm font-semibold text-gray-700">Finding your positions…</p>
            ) : (
              <>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  No Uniswap V3 Positions Found
                </p>
                <p className="text-xs text-gray-500">
                  Use the Migration Assistant to supply liquidity.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((p) => {
              const isFullRange = p.tickLower <= -887000 && p.tickUpper >= 887000;
              return (
                <div
                  key={p.tokenId}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/30 to-white p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">
                        NFT #{p.tokenId}
                      </span>
                      <Badge className="border-indigo-200 bg-indigo-50 text-[10px] text-indigo-700">
                        {p.fee / 10000}% Fee
                      </Badge>
                      {isFullRange && (
                        <Badge className="border-purple-200 bg-purple-50 text-[10px] text-purple-700">
                          Full Range
                        </Badge>
                      )}
                      <Badge className="border-slate-200 bg-slate-50 text-[10px] text-slate-700">
                        {CUSTODY_LABEL[p.custody]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-gray-700">
                      {p.token0Symbol} / {p.token1Symbol}
                    </p>
                    <p className="text-xs text-gray-600">
                      Liquidity units: <span className="font-mono">{p.liquidity}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {p.custody === "wallet" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-indigo-300 text-xs text-indigo-700 hover:bg-indigo-50"
                        disabled={busyTokenId !== null || !isConnected || chainId !== base.id}
                        onClick={() => void handleCollect(p)}
                      >
                        {busyTokenId === p.tokenId ? (
                          <Loader2 className="mr-1 size-3 animate-spin" />
                        ) : null}
                        Collect Fees
                      </Button>
                    )}
                    {p.custody === "staker" && (
                      <Link to="/stake" className="text-xs font-semibold text-indigo-700 underline">
                        Manage on Stake
                      </Link>
                    )}
                    {p.custody === "timelock" && (
                      <span className="text-xs text-gray-500">Harvest in the locker below</span>
                    )}
                    <a
                      href={`https://basescan.org/token/${NONFUNGIBLE_POSITION_MANAGER_BASE}?a=${p.tokenId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-xs text-gray-500 hover:text-gray-800"
                    >
                      BaseScan <ExternalLink className="ml-1 size-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
