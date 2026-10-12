// src/hooks/useUserActivity.ts
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

import {
  CHAIN_CONFIG,
  getChainConfig,
  getEnvString,
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId,
} from "@/config/chains";
import { useTokenPrice } from "@/hooks/useTokenPrice";

export type TransactionStatus = "completed" | "pending" | "failed";
export type AlchemyTransferCategory = "external" | "erc20" | "erc721" | "erc1155";

export interface UserTransaction {
  hash: string;
  blockNumber: number;
  timeStamp: number; // seconds
  from: string;
  to: string;
  amountDisplay: number;
  tokenSymbol: string;
  category: AlchemyTransferCategory;
  chainId: SupportedChainId;
  chainName: string;
  direction: "inbound" | "outbound";
}

export interface UserActivityStats {
  totalSwaps: number;
  totalVolumeEth: number;
  totalVolumeUsd: number;
  activeChains: number;
}

interface AlchemyTransfer {
  hash: string;
  blockNum: string;
  from: string;
  to: string;
  value?: unknown;
  asset: string;
  category: AlchemyTransferCategory;
  erc20Metadata?: { symbol?: string; decimals?: number };
  metadata: { blockTimestamp: string };
}

function parseTransferValue(input: unknown): { amount: number; unit: "display" } | { amount: bigint; unit: "base" } {
  if (typeof input === "number" && Number.isFinite(input)) {
    return { amount: input, unit: "display" };
  }
  if (typeof input === "string" && input.trim().length > 0 && !input.startsWith("0x")) {
    const n = Number(input);
    if (Number.isFinite(n)) return { amount: n, unit: "display" };
  }
  if (typeof input === "string" && /^0x[0-9a-fA-F]+$/.test(input)) {
    return { amount: BigInt(input), unit: "base" };
  }
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.hex === "string" && /^0x[0-9a-fA-F]+$/.test(obj.hex)) {
      return { amount: BigInt(obj.hex), unit: "base" };
    }
    if (typeof obj.value === "number" && Number.isFinite(obj.value)) {
      return { amount: obj.value, unit: "display" };
    }
  }
  return { amount: 0, unit: "display" };
}

export function useUserActivity() {
  const { address, isConnected } = useAccount();
  const { price: ethPrice } = useTokenPrice("ETH", "usd");

  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserActivityStats>({
    totalSwaps: 0,
    totalVolumeEth: 0,
    totalVolumeUsd: 0,
    activeChains: 0,
  });

  const fetchTransactions = useCallback(async () => {
    if (!address) {
      setTransactions([]);
      setStats({ totalSwaps: 0, totalVolumeEth: 0, totalVolumeUsd: 0, activeChains: 0 });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const categories: AlchemyTransferCategory[] = ["erc20", "external"];
      const chainResults = await Promise.all(
        SUPPORTED_CHAIN_IDS.map(async (chainId) => {
          try {
            const chainConfig = getChainConfig(chainId);
            const alchemyUrl = getEnvString(chainConfig.envKey);

            const [outboundRes, inboundRes] = await Promise.all([
              fetch(alchemyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: `out-${chainId}`,
                  method: "alchemy_getAssetTransfers",
                  params: [
                    {
                      fromAddress: address,
                      category: categories,
                      withMetadata: true,
                      maxCount: "0xC8",
                      order: "desc",
                    },
                  ],
                }),
              }),
              fetch(alchemyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: `in-${chainId}`,
                  method: "alchemy_getAssetTransfers",
                  params: [
                    {
                      toAddress: address,
                      category: categories,
                      withMetadata: true,
                      maxCount: "0xC8",
                      order: "desc",
                    },
                  ],
                }),
              }),
            ]);

            if (!outboundRes.ok || !inboundRes.ok) return [];

            const outboundData = await outboundRes.json();
            const inboundData = await inboundRes.json();

            const rawTransfers: AlchemyTransfer[] = [
              ...(outboundData?.result?.transfers ?? []),
              ...(inboundData?.result?.transfers ?? []),
            ];

            const uniqueTransfers = Array.from(
              new Map(rawTransfers.map((t) => [t.hash, t])).values()
            );

            return uniqueTransfers.map((t): UserTransaction => {
              const symbol =
                t.category === "erc20" ? t.erc20Metadata?.symbol ?? t.asset : t.asset;
              const parsed = parseTransferValue(t.value);
              let amountDisplay = 0;
              if (parsed.unit === "base") {
                const decimals =
                  t.category === "erc20" ? t.erc20Metadata?.decimals ?? 18 : 18;
                amountDisplay = Number(formatUnits(parsed.amount, decimals));
              } else {
                amountDisplay = parsed.amount;
              }

              const isOutbound = t.from.toLowerCase() === address.toLowerCase();

              return {
                hash: t.hash,
                blockNumber: parseInt(t.blockNum || "0x0", 16),
                timeStamp: Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000),
                from: t.from,
                to: t.to,
                amountDisplay,
                tokenSymbol: symbol || "ETH",
                category: t.category,
                chainId,
                chainName: chainConfig.name,
                direction: isOutbound ? "outbound" : "inbound",
              };
            });
          } catch (e) {
            console.warn(`Activity fetch warning for chain ${chainId}:`, e);
            return [];
          }
        })
      );

      const allTxs = chainResults.flat().sort((a, b) => b.timeStamp - a.timeStamp);
      setTransactions(allTxs);

      // Distinct chains with activity
      const activeChainsCount = new Set(allTxs.map((t) => t.chainId)).size;

      // Volume calculation
      const volumeEth = allTxs.reduce((sum, tx) => {
        if (
          tx.direction === "outbound" &&
          (tx.tokenSymbol === "ETH" ||
            tx.tokenSymbol === "WETH" ||
            tx.tokenSymbol === "MATIC" ||
            tx.tokenSymbol === "AVAX")
        ) {
          return sum + tx.amountDisplay;
        }
        return sum;
      }, 0);

      const effectiveEthPrice = ethPrice && ethPrice > 0 ? ethPrice : 2500;
      const volumeUsd = volumeEth * effectiveEthPrice;

      setStats({
        totalSwaps: allTxs.length,
        totalVolumeEth: volumeEth,
        totalVolumeUsd: volumeUsd,
        activeChains: activeChainsCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load transactions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [address, ethPrice]);

  useEffect(() => {
    if (isConnected && address) {
      void fetchTransactions();
    }
  }, [isConnected, address, fetchTransactions]);

  return {
    transactions,
    stats,
    loading,
    error,
    refresh: fetchTransactions,
  };
}
