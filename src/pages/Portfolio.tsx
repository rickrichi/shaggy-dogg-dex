// src/pages/Portfolio.tsx
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  ArrowLeftRight,
  Check,
  Coins,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  PieChart,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAccount, useChainId } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getChainConfig, isSupportedChain } from "@/config/chains";
import { type Token, usePortfolio } from "@/hooks/usePortfolio";

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { tokens, summary, isLoading, error, refetch } = usePortfolio();

  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const [copied, setCopied] = useState(false);

  const chainName = isSupportedChain(chainId) ? getChainConfig(chainId).name : "Base";
  const explorerUrl = isSupportedChain(chainId)
    ? getChainConfig(chainId).explorerUrl
    : "https://basescan.org";

  const handleCopy = () => {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter tokens based on user preference
  const visibleTokens = tokens.filter((t) => {
    if (!hideZeroBalances) return true;
    const num = Number(t.balanceFormatted);
    return num > 0;
  });

  // Helper for token avatar badge
  const getTokenIcon = (symbol: string) => {
    const upper = symbol.toUpperCase();
    if (upper === "SD" || upper === "AMUTT" || upper === "FBA") return "🐕";
    if (upper === "ETH" || upper === "WETH") return "⟠";
    if (upper === "USDC" || upper === "USDT") return "💵";
    return "🪙";
  };

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 py-10">
        <div className="rounded-2xl border border-purple-200/60 bg-gradient-to-r from-purple-900/10 via-pink-900/10 to-blue-900/10 p-8 text-center backdrop-blur-md">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 shadow-lg">
            <Wallet className="size-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Connect Your Wallet to View Portfolio
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-gray-600 dark:text-gray-300">
            Track your real-time multi-chain holdings, token balances (SD, AMUTT, ETH, USDC), and
            portfolio valuation across all supported EVM networks.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link to="/swap">
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700">
                Go to Swap
                <ArrowLeftRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="border-purple-100 bg-white/75 backdrop-blur-sm dark:bg-gray-800/80">
            <CardHeader className="pb-2">
              <Coins className="size-6 text-purple-600" />
              <CardTitle className="text-base">Real-Time Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Live on-chain balance querying directly via Base mainnet RPC and multicall.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="border-purple-100 bg-white/75 backdrop-blur-sm dark:bg-gray-800/80">
            <CardHeader className="pb-2">
              <PieChart className="size-6 text-pink-600" />
              <CardTitle className="text-base">Ecosystem Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Native support for Shaggy Dogg (SD), Alpha Mutt (AMUTT), FBA, and native ETH.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="border-purple-100 bg-white/75 backdrop-blur-sm dark:bg-gray-800/80">
            <CardHeader className="pb-2">
              <ShieldCheck className="size-6 text-indigo-600" />
              <CardTitle className="text-base">Non-Custodial</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Zero backend custody. All balance checks query the public blockchain directly.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner & Wallet Identity */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              Portfolio Overview
            </h1>
            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
              {chainName}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            <span>{address ? `${address.slice(0, 8)}...${address.slice(-6)}` : ""}</span>
            <button
              onClick={handleCopy}
              className="text-gray-400 hover:text-purple-600"
              title="Copy address"
            >
              {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
            </button>
            <span>·</span>
            <a
              href={`${explorerUrl}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-purple-600 hover:underline"
            >
              View on Explorer
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-purple-200 bg-white text-gray-700 hover:bg-purple-50"
          >
            <RefreshCw className={`mr-2 size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Balances
          </Button>
          <Link to="/swap">
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
            >
              <ArrowLeftRight className="mr-2 size-4" />
              Swap Tokens
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Value */}
        <Card className="border-2 border-purple-100 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Portfolio Valuation
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                `$${summary.totalValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-gray-500">
            {summary.percentChange24h !== 0 && (
              <span
                className={`font-medium ${
                  summary.percentChange24h >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.percentChange24h >= 0 ? "+" : ""}
                {summary.percentChange24h.toFixed(2)}% (24h)
              </span>
            )}
          </CardContent>
        </Card>

        {/* Native ETH Balance */}
        <Card className="border-2 border-purple-100 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Native {chainName} ETH
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                `${(
                  Number(
                    tokens.find(
                      (t) =>
                        t.address.toLowerCase() ===
                        "0x0000000000000000000000000000000000000000"
                    )?.balanceFormatted || "0"
                  )
                ).toFixed(4)} ETH`
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-gray-500">
            Gas & trading reserve
          </CardContent>
        </Card>

        {/* Active Tokens Detected */}
        <Card className="border-2 border-purple-100 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Tracked Assets
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                `${tokens.filter((t) => Number(t.balanceFormatted) > 0).length} / ${tokens.length}`
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-gray-500">
            Holding non-zero balances
          </CardContent>
        </Card>

        {/* Top Asset */}
        <Card className="border-2 border-purple-100 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Largest Asset
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : summary.biggestHolding ? (
                summary.biggestHolding.symbol
              ) : (
                "ETH"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-gray-500">
            Primary asset in wallet
          </CardContent>
        </Card>
      </div>

      {/* Holdings Section */}
      <Card className="border border-purple-100 bg-white/90 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-xl font-bold text-gray-900">Wallet Holdings</CardTitle>
            <CardDescription>
              On-chain balances verified on {chainName} Mainnet
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Switch
              id="hide-zeros"
              checked={hideZeroBalances}
              onCheckedChange={setHideZeroBalances}
            />
            <label htmlFor="hide-zeros" className="cursor-pointer select-none text-xs">
              Hide zero balances
            </label>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading && tokens.length === 0 ? (
            <div className="space-y-4 py-8">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : visibleTokens.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              No holdings found with non-zero balances. Toggle &quot;Hide zero balances&quot; to see all
              tracked assets.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="border-b border-purple-100 text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th scope="col" className="py-3 pr-4">Asset</th>
                    <th scope="col" className="px-4 py-3">Contract</th>
                    <th scope="col" className="px-4 py-3 text-right">Balance</th>
                    <th scope="col" className="px-4 py-3 text-right">Price</th>
                    <th scope="col" className="px-4 py-3 text-right">Value (USD)</th>
                    <th scope="col" className="py-3 pl-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleTokens.map((token: Token) => {
                    const isNative =
                      token.address.toLowerCase() ===
                      "0x0000000000000000000000000000000000000000";
                    const formattedBalance = Number(token.balanceFormatted).toLocaleString(
                      undefined,
                      {
                        maximumFractionDigits: token.decimals > 8 ? 6 : 4,
                      }
                    );

                    return (
                      <tr key={token.key} className="transition-colors hover:bg-purple-50/50">
                        {/* Asset */}
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-purple-100 text-lg shadow-sm">
                              {getTokenIcon(token.symbol)}
                            </span>
                            <div>
                              <div className="font-semibold text-gray-900">{token.name}</div>
                              <div className="text-xs text-gray-400">{token.symbol}</div>
                            </div>
                          </div>
                        </td>

                        {/* Contract */}
                        <td className="px-4 py-4 text-xs">
                          {isNative ? (
                            <Badge variant="secondary" className="text-xs">Native</Badge>
                          ) : (
                            <a
                              href={`${explorerUrl}/token/${token.address}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 font-mono text-gray-500 hover:text-purple-600 hover:underline"
                            >
                              {`${token.address.slice(0, 6)}...${token.address.slice(-4)}`}
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </td>

                        {/* Balance */}
                        <td className="px-4 py-4 text-right font-medium text-gray-900">
                          <div>{formattedBalance}</div>
                          <div className="text-xs text-gray-400">{token.symbol}</div>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-4 text-right text-gray-600">
                          {token.priceUsd > 0
                            ? `$${token.priceUsd.toFixed(token.priceUsd < 0.01 ? 6 : 2)}`
                            : "—"}
                        </td>

                        {/* Value */}
                        <td className="px-4 py-4 text-right font-semibold text-gray-900">
                          {token.usdValue > 0
                            ? `$${token.usdValue.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : "—"}
                        </td>

                        {/* Actions */}
                        <td className="py-4 pl-4 text-right">
                          <Link to={`/swap?inputToken=${token.address}`}>
                            <Button size="sm" variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50">
                              <ArrowLeftRight className="mr-1.5 size-3.5" />
                              Swap
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
