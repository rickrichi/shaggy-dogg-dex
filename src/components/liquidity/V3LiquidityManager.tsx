// src/components/liquidity/V3LiquidityManager.tsx
import { useCallback, useEffect, useState } from "react";

import {
  Coins,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { type Address, formatUnits, type Hash, parseAbi } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  NONFUNGIBLE_POSITION_MANAGER_BASE,
  WETH_BASE,
} from "@/lib/amm/uniswap-v3";

interface V3Position {
  readonly tokenId: bigint;
  readonly token0: Address;
  readonly token1: Address;
  readonly fee: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: bigint;
  readonly tokensOwed0: bigint;
  readonly tokensOwed1: bigint;
}

export function V3LiquidityManager() {
  const { address: userAddress, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();

  const [positions, setPositions] = useState<readonly V3Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyTokenId, setBusyTokenId] = useState<bigint | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!publicClient || !userAddress || chainId !== base.id) return;
    setLoading(true);
    try {
      const balance = await publicClient.readContract({
        address: NONFUNGIBLE_POSITION_MANAGER_BASE,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [userAddress],
      });

      const count = Number(balance);
      if (count === 0) {
        setPositions([]);
        setLoading(false);
        return;
      }

      // Read each token of owner by index
      const tokenIds = await Promise.all(
        Array.from({ length: Math.min(count, 10) }, (_, i) =>
          publicClient.readContract({
            address: NONFUNGIBLE_POSITION_MANAGER_BASE,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [userAddress, BigInt(i)],
          })
        )
      );

      // Read position details
      const posDetails = await Promise.all(
        tokenIds.map(async (id) => {
          const res = await publicClient.readContract({
            address: NONFUNGIBLE_POSITION_MANAGER_BASE,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: "positions",
            args: [id],
          });
          return {
            tokenId: id,
            token0: res[2],
            token1: res[3],
            fee: res[4],
            tickLower: res[5],
            tickUpper: res[6],
            liquidity: res[7],
            tokensOwed0: res[10],
            tokensOwed1: res[11],
          };
        })
      );

      setPositions(posDetails);
    } catch (e) {
      console.error("Failed to fetch V3 positions:", e);
    } finally {
      setLoading(false);
    }
  }, [publicClient, userAddress, chainId]);

  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  const handleCollect = async (pos: V3Position) => {
    if (!walletClient || !publicClient || !userAddress) return;
    setBusyTokenId(pos.tokenId);
    try {
      const max128 = (1n << 128n) - 1n;
      const { request } = await publicClient.simulateContract({
        address: NONFUNGIBLE_POSITION_MANAGER_BASE,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: "collect",
        args: [
          {
            tokenId: pos.tokenId,
            recipient: userAddress,
            amount0Max: max128,
            amount1Max: max128,
          },
        ],
        account: userAddress,
      });

      const tx = await walletClient.writeContract({ ...request, chain: base });
      toast.info("Collecting fees from Uniswap V3 position...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("Collect reverted");

      toast.success(`Collected fees for NFT #${pos.tokenId.toString()}!`);
      await fetchPositions();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to collect fees");
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
              Concentrated liquidity positions represented as NFTs on Base Mainnet.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchPositions()}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {positions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
            <Coins className="mx-auto size-8 text-gray-400" />
            <p className="mt-2 text-sm font-semibold text-gray-700">No Uniswap V3 Positions Found</p>
            <p className="text-xs text-gray-500">
              Use the Migration Assistant or V3 Position Creator to supply liquidity.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((p) => {
              const isFullRange = p.tickLower <= -887000 && p.tickUpper >= 887000;
              return (
                <div
                  key={p.tokenId.toString()}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/30 to-white p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">
                        NFT #{p.tokenId.toString()}
                      </span>
                      <Badge className="border-indigo-200 bg-indigo-50 text-[10px] text-indigo-700">
                        {p.fee / 10000}% Fee
                      </Badge>
                      {isFullRange && (
                        <Badge className="border-purple-200 bg-purple-50 text-[10px] text-purple-700">
                          Full Range
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      Tokens: {p.token0.slice(0, 6)}...{p.token0.slice(-4)} / {p.token1.slice(0, 6)}...{p.token1.slice(-4)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Liquidity units: <span className="font-mono">{p.liquidity.toString()}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-indigo-300 text-xs text-indigo-700 hover:bg-indigo-50"
                      disabled={busyTokenId === p.tokenId}
                      onClick={() => void handleCollect(p)}
                    >
                      {busyTokenId === p.tokenId ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : null}
                      Collect Fees
                    </Button>
                    <a
                      href={`https://basescan.org/token/${NONFUNGIBLE_POSITION_MANAGER_BASE}?a=${p.tokenId.toString()}`}
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
