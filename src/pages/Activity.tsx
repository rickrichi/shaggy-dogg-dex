import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ArrowLeftRight, ExternalLink, Clock, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { useState, useEffect, useCallback } from 'react';
import { formatUnits } from 'viem';
import type { MouseEvent, ReactNode } from 'react';

// ========================================================
// Chains & Config (shared module)
// ========================================================
import {
  SUPPORTED_CHAIN_IDS,
  CHAIN_CONFIG,
  isSupportedChain,
  getChainConfig,
  getEnvString,
} from '@/config/chains';
import type { SupportedChainId } from '@/config/chains';

// ========================================================
// Domain Types
// ========================================================

type TransactionStatus = 'completed' | 'pending' | 'failed';
type AlchemyTransferCategory = 'external' | 'erc20' | 'erc721' | 'erc1155';

interface ActivityStats {
  totalSwaps: number;
  totalVolume: string; // ETH-equivalent for coarse UI
  gasSpent: string;    // aggregated across chains (future: compute)
}

// UI transaction model (post-transform, multi-chain)
interface Transaction {
  hash: string;
  blockNumber: number;
  timeStamp: number; // seconds
  from: string;
  to: string;
  amountDisplay: number; // normalized, human-readable units for UI/aggregation
  tokenSymbol: string;
  category: AlchemyTransferCategory;
  isError: '0' | '1';
  gasUsed: string;
  gasPrice: string;
  rawValue?: string;        // optional for debugging/inspection (omit when absent)
  chainId: SupportedChainId; // chain context
  chainName: string;         // for UI display
  direction: 'inbound' | 'outbound';
}

// ========================================================
// Alchemy API Shapes
// ========================================================

interface AlchemyErc20Metadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logo?: string;
}

interface AlchemyTransferMetadata {
  blockTimestamp: string; // ISO string
}

interface AlchemyValueObject {
  hex?: string;
  value?: unknown;
}

interface AlchemyTransfer {
  hash: string;
  blockNum: string; // hex string (e.g., "0x1234")
  from: string;
  to: string;
  value?: number | string | AlchemyValueObject | unknown;
  asset: string;
  category: AlchemyTransferCategory;
  erc20Metadata?: AlchemyErc20Metadata;
  metadata: AlchemyTransferMetadata;
}

interface AlchemyTransfersResult { transfers?: unknown[] }
interface AlchemyTransfersResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: AlchemyTransfersResult;
}

// ========================================================
// Type Guards & Utils
// ========================================================

const isString = (value: unknown): value is string => typeof value === 'string';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHexString = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v);

const isAlchemyValueObject = (value: unknown): value is AlchemyValueObject =>
  typeof value === 'object' && value !== null && (
    'hex' in (value as Record<string, unknown>) ||
    'value' in (value as Record<string, unknown>)
  );

const isAlchemyTransfer = (t: unknown): t is AlchemyTransfer => {
  if (typeof t !== 'object' || t === null) return false;
  const o = t as Record<string, unknown>;
  const categoryOk =
    o.category === 'external' || o.category === 'erc20' || o.category === 'erc721' || o.category === 'erc1155';
  const metadataOk =
    typeof o.metadata === 'object' &&
    o.metadata !== null &&
    isString((o.metadata as Record<string, unknown>).blockTimestamp);
  return (
    isString(o.hash) &&
    isString(o.blockNum) &&
    isString(o.from) &&
    isString(o.to) &&
    isString(o.asset) &&
    categoryOk &&
    metadataOk
  );
};

const isAlchemyTransfersResponse = (data: unknown): data is AlchemyTransfersResponse => {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Record<string, unknown>;
  if (!('result' in o)) return false;
  const r = (o.result as unknown) as Record<string, unknown> | undefined;
  if (typeof r !== 'object' || r === null) return false;
  const transfers = (r.transfers as unknown) as unknown[] | undefined;
  return transfers === undefined || Array.isArray(transfers);
};

// Heterogeneous Alchemy `value` parsing → precise unit info.
type ParsedValue =
  | { unit: 'display'; amount: number }
  | { unit: 'base'; amount: bigint };

function parseTransferValue(input: unknown): ParsedValue {
  // Common case: display-unit number/string (e.g., 0.01 or "0.01")
  if (isFiniteNumber(input)) {
    return { amount: input, unit: 'display' };
  }
  if (isString(input) && input.trim().length > 0 && !isHexString(input)) {
    const n = Number(input);
    if (Number.isFinite(n)) return { amount: n, unit: 'display' };
  }

  // Base-unit hex
  if (isHexString(input)) {
    return { amount: BigInt(input), unit: 'base' };
  }

  // Object wrappers that may include hex or a nested numeric
  if (isAlchemyValueObject(input)) {
    if (isHexString(input.hex)) return { amount: BigInt(input.hex), unit: 'base' };
    if (isFiniteNumber(input.value)) return { amount: input.value, unit: 'display' };
  }

  // Unknown shapes: default to 0 display to avoid UI crashes
  return { amount: 0, unit: 'display' };
}

function formatDisplayAmount(amount: number, symbol?: string): string {
  const display = Math.abs(amount) >= 1
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : amount.toPrecision(6);
  return symbol ? `${display} ${symbol}` : display;
}

// ========================================================
// Component
// ========================================================

export default function Activity() {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId(); // may be undefined depending on wagmi version / connection state

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ActivityStats>({ totalSwaps: 0, totalVolume: '0', gasSpent: '0' });

  // Enhanced transformer with chain context
  const transformAlchemyTransferWithChain = useCallback((
    transfer: AlchemyTransfer,
    userAddress: string,
    targetChainId: SupportedChainId,
    chainName: string
  ): Transaction => {
    const symbol = transfer.category === 'erc20'
      ? (transfer.erc20Metadata?.symbol ?? transfer.asset)
      : transfer.asset;

    const parsed = parseTransferValue(transfer.value);

    let amountDisplay: number;
    if (parsed.unit === 'base') {
      const decimals = transfer.category === 'erc20'
        ? (transfer.erc20Metadata?.decimals ?? 18)
        : 18;
      // viem's formatUnits returns a string; convert to number for UI aggregation.
      amountDisplay = Number(formatUnits(parsed.amount, decimals));
    } else {
      amountDisplay = parsed.amount;
    }

    const isOutbound = transfer.from.toLowerCase() === userAddress.toLowerCase();

    return {
      hash: transfer.hash,
      blockNumber: parseInt(transfer.blockNum, 16),
      timeStamp: Math.floor(new Date(transfer.metadata.blockTimestamp).getTime() / 1000),
      from: transfer.from,
      to: transfer.to,
      amountDisplay,
      tokenSymbol: symbol,
      category: transfer.category,
      isError: '0', // not available in this endpoint; could be refined with tx receipts per chain
      gasUsed: '0', // placeholder until gas aggregation is implemented
      gasPrice: '0',
      ...(typeof transfer.value === 'string' ? { rawValue: transfer.value } : {}), // exactOptionalPropertyTypes-safe
      chainId: targetChainId,
      chainName,
      direction: isOutbound ? 'outbound' : 'inbound'
    };
  }, []);

  // Chain-specific transaction fetcher
  const fetchChainTransactions = useCallback(async (
    targetChainId: SupportedChainId,
    userAddress: string
  ): Promise<Transaction[]> => {
    try {
      const chainConfig = getChainConfig(targetChainId);
      const alchemyUrl = getEnvString(chainConfig.envKey);

      const categories: AlchemyTransferCategory[] = ['erc20', 'external', 'erc721', 'erc1155'];

      // Parallel bidirectional queries for comprehensive coverage
      const [outboundResponse, inboundResponse] = await Promise.all([
        fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `out-${targetChainId}`,
            method: 'alchemy_getAssetTransfers',
            params: [{
              fromAddress: userAddress,
              category: categories,
              withMetadata: true,
              maxCount: '0xC8', // 200 transactions
              order: 'desc'
            }]
          })
        }),
        fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `in-${targetChainId}`,
            method: 'alchemy_getAssetTransfers',
            params: [{
              toAddress: userAddress,
              category: categories,
              withMetadata: true,
              maxCount: '0xC8',
              order: 'desc'
            }]
          })
        })
      ]);

      if (!outboundResponse.ok || !inboundResponse.ok) {
        console.warn(`Chain ${chainConfig.name} query failed:`, outboundResponse.status, inboundResponse.status);
        return []; // Graceful degradation
      }

      const [outboundJson, inboundJson]: [unknown, unknown] = await Promise.all([
        outboundResponse.json(),
        inboundResponse.json()
      ]);

      const toTransfers = (data: unknown): AlchemyTransfer[] => {
        if (!isAlchemyTransfersResponse(data)) return [];
        const list = data.result?.transfers ?? [];
        return list.filter(isAlchemyTransfer);
      };

      // Merge and deduplicate
      const allTransfers = [...toTransfers(outboundJson), ...toTransfers(inboundJson)];
      const uniqueTransfers = Array.from(new Map(allTransfers.map((tr) => [tr.hash, tr])).values());

      return uniqueTransfers.map((transfer) =>
        transformAlchemyTransferWithChain(transfer, userAddress, targetChainId, chainConfig.name)
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`Failed to fetch transactions for chain ${targetChainId}:`, message);
      return []; // Graceful failure - don't break entire aggregation
    }
  }, [transformAlchemyTransferWithChain]);

  // Main multi-chain aggregation function (no index math → no TS2538)
  const fetchTransactions = useCallback(async (): Promise<void> => {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      // Pair results with chainId to avoid relying on array indices
      const perChain = await Promise.all(
        SUPPORTED_CHAIN_IDS.map(async (chainId) => {
          try {
            const txs = await fetchChainTransactions(chainId, address);
            return { chainId, ok: true as const, txs };
          } catch (error) {
            return { chainId, ok: false as const, error: error as unknown };
          }
        })
      );

      const allTransactions: Transaction[] = [];
      const failedChains: string[] = [];

      for (const r of perChain) {
        const chainName = CHAIN_CONFIG[r.chainId].name; // r.chainId is a SupportedChainId
        if (r.ok) {
          allTransactions.push(...r.txs);
        } else {
          failedChains.push(chainName);
          console.warn(`✗ ${chainName}:`, r.error);
        }
      }

      // Sort all transactions by timestamp (most recent first)
      const sortedTransactions = allTransactions.sort((a, b) => b.timeStamp - a.timeStamp);
      setTransactions(sortedTransactions);

      // Calculate coarse stats
      const outboundTransactions = sortedTransactions.filter((tx) => tx.direction === 'outbound');
      const totalVolume = outboundTransactions.reduce((sum, tx) => {
        // Normalize to ETH-equivalent for rough volume calculation
        // In production, you'd want proper price conversion per asset
        if (tx.tokenSymbol === 'ETH' || tx.tokenSymbol === 'MATIC' || tx.tokenSymbol === 'AVAX') {
          return sum + tx.amountDisplay;
        }
        return sum; // Skip token volumes for now
      }, 0);

      setStats({
        totalSwaps: sortedTransactions.length,
        totalVolume: totalVolume.toFixed(6),
        gasSpent: '0'
      });

      if (failedChains.length > 0) {
        setError(`Some chains unavailable: ${failedChains.join(', ')}. Showing available data.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Multi-chain aggregation failed:', message);
      setError(`Failed to fetch multi-chain data: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [address, fetchChainTransactions]);

  useEffect(() => {
    if (isConnected && address) void fetchTransactions();
  }, [address, isConnected, fetchTransactions]);

  const handleRefresh = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    void fetchTransactions();
  };

  const getTransactionStatus = (t: Transaction): TransactionStatus => {
    if (t.isError === '1') return 'failed';
    return 'completed';
  };

  const getStatusColor = (s: TransactionStatus): string => {
    switch (s) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
    }
  };

  const formatTimeAgo = (ts: number): ReactNode => {
    const now = Math.floor(Date.now() / 1000);
    const secondsAgo = now - ts;

    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
    if (secondsAgo < 2592000) return `${Math.floor(secondsAgo / 86400)}d ago`;

    const date = new Date(ts * 1000);
    return date.toLocaleDateString();
  };

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold text-amber-800 mb-2">Wallet Not Connected</h3>
            <p className="text-amber-700">Please connect your MetaMask wallet to view your trading activity.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Safely handle activeChainId that could be undefined; narrow before indexing
  const currentChain: SupportedChainId | null =
    typeof activeChainId === 'number' && isSupportedChain(activeChainId) ? activeChainId : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          Multi-Chain Trading Activity
        </h1>
        <p className="text-gray-600">Your complete transaction history across all supported networks</p>
        <Button onClick={handleRefresh} disabled={loading} variant="outline" size="sm" className="mt-2" type="button">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh All Chains
        </Button>
      </div>

      {/* Show warning if user is on unsupported chain */}
      {typeof activeChainId === 'number' && !isSupportedChain(activeChainId) && (
        <Card className="border-2 border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <p className="text-yellow-800">
                You're connected to an unsupported chain (ID: {activeChainId}).{' '}
                Switch to one of the supported networks: {SUPPORTED_CHAIN_IDS.join(', ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : transactions.length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Volume (ETH Equiv)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.totalVolume}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Active Chains</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                new Set(transactions.map((tx) => tx.chainId)).size
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Recent Transactions (All Chains)</h2>

        {loading ? (
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-purple-600" />
              <p className="text-gray-600">Loading your multi-chain transaction history...</p>
            </CardContent>
          </Card>
        ) : transactions.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-200 bg-gray-50">
            <CardContent className="p-8 text-center">
              <ArrowLeftRight className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No transactions yet</h3>
              <p className="text-gray-600">Your transaction history will appear here once you start trading.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => {
              const status = getTransactionStatus(tx);
              const explorerUrl = getChainConfig(tx.chainId).explorerUrl; // safe index via SupportedChainId
              const isActiveChain = currentChain !== null && tx.chainId === currentChain;

              return (
                <Card
                  key={`${tx.chainId}-${tx.hash}`}
                  className={`border-2 transition-colors bg-white/80 backdrop-blur-sm ${
                    isActiveChain ? 'border-purple-500 shadow-lg' : 'border-purple-100 hover:border-purple-200'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 flex items-center justify-center">
                          <ArrowLeftRight className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-900">
                              {tx.direction === 'outbound' ? '-' : '+'}
                              {formatDisplayAmount(tx.amountDisplay, tx.tokenSymbol)}
                            </span>
                            <Badge className={getStatusColor(status)}>{status}</Badge>
                            <Badge variant="outline" className="text-xs">
                              {tx.category}
                            </Badge>
                            {/* Chain identification badge */}
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              {tx.chainName.toUpperCase()}
                              {isActiveChain && ' (Active)'}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatTimeAgo(tx.timeStamp)}</span>
                            </div>
                            <span>Block: {tx.blockNumber}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500 font-mono">
                          {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                        </span>
                        <a
                          href={`${explorerUrl}/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <ExternalLink className="h-4 w-4 text-gray-400 cursor-pointer hover:text-purple-600" />
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
