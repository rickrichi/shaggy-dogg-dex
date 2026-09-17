/**
 * API Example Component - Shaggy Dogg DEX
 *
 * Demonstrates usage of the new Vercel Edge Function hooks:
 * - useTokenPrice: Real-time token prices
 * - useGasPrice: Multi-chain gas estimates
 * - useHealthCheck: API health monitoring
 *
 * This component serves as both documentation and a testing ground
 * for the API integration.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGasPrice, useHealthCheck, useTokenPrice } from "@/hooks";

export function ApiExample() {
  // Fetch ETH price in USD (auto-refreshes every 60s)
  const {
    price: ethPrice,
    change24h: ethChange,
    loading: ethLoading,
    error: ethError,
  } = useTokenPrice("ETH", { currency: "usd" });

  // Fetch BTC price in EUR
  const { price: btcPrice, loading: btcLoading } = useTokenPrice("BTC", { currency: "eur" });

  // Fetch Ethereum gas prices (auto-refreshes every 10s)
  const {
    selectedPrice: ethGas,
    estimatedCosts,
    loading: gasLoading,
    error: gasError,
  } = useGasPrice(1, { speed: "standard" });

  // Fetch Base gas prices
  const { selectedPrice: baseGas } = useGasPrice(8453, { speed: "fast" });

  // Monitor API health (auto-refreshes every 30s)
  const { status, services, latency, region, isHealthy } = useHealthCheck({ detailed: true });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">API Integration Examples</h1>

      {/* Health Status */}
      <Card>
        <CardHeader>
          <CardTitle>API Health Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            <Badge variant={isHealthy ? "default" : "destructive"}>{status?.toUpperCase()}</Badge>
          </div>
          {services && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">API:</span>
                <Badge variant={services.api === "operational" ? "default" : "secondary"}>
                  {services.api}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Database:</span>
                <Badge variant={services.database === "operational" ? "default" : "secondary"}>
                  {services.database}
                </Badge>
              </div>
            </div>
          )}
          {latency && <p className="text-sm text-muted-foreground">Latency: {latency}ms</p>}
          {region && <p className="text-sm text-muted-foreground">Region: {region}</p>}
        </CardContent>
      </Card>

      {/* Token Prices */}
      <Card>
        <CardHeader>
          <CardTitle>Token Prices (Auto-refresh: 60s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ETH Price */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">ETH/USD</span>
              {ethLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : ethError ? (
                <span className="text-sm text-destructive">Error</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold">
                    $
                    {ethPrice?.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  {ethChange !== null && (
                    <Badge variant={ethChange >= 0 ? "default" : "destructive"}>
                      {ethChange >= 0 ? "+" : ""}
                      {ethChange.toFixed(2)}%
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BTC Price */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">BTC/EUR</span>
              {btcLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                <span className="text-xl font-bold">
                  €
                  {btcPrice?.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gas Prices */}
      <Card>
        <CardHeader>
          <CardTitle>Gas Prices (Auto-refresh: 10s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ethereum Gas */}
          <div className="space-y-2">
            <h3 className="font-semibold">Ethereum Mainnet</h3>
            {gasLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : gasError ? (
              <p className="text-sm text-destructive">Error fetching gas prices</p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Standard:</span>{" "}
                  {ethGas?.maxFee || ethGas?.gasPrice} Gwei
                </p>
                {estimatedCosts && (
                  <div className="text-sm text-muted-foreground">
                    <p>
                      Transfer: {estimatedCosts.transfer.eth} ETH (${estimatedCosts.transfer.usd})
                    </p>
                    <p>
                      Swap: {estimatedCosts.swap.eth} ETH (${estimatedCosts.swap.usd})
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Base Gas */}
          <div className="space-y-2">
            <h3 className="font-semibold">Base</h3>
            <p className="text-sm">
              <span className="font-medium">Fast:</span> {baseGas?.maxFee || baseGas?.gasPrice} Gwei
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Usage Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">Token Price Hook</h3>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {`import { useTokenPrice } from '@/hooks'

// Basic usage
const { price, change24h, loading } = useTokenPrice('ETH')

// Custom currency
const { price } = useTokenPrice('BTC', { currency: 'eur' })

// Disable auto-refresh
const { price } = useTokenPrice('MATIC', {
  refreshInterval: 0,
  enabled: false
})`}
            </pre>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Gas Price Hook</h3>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {`import { useGasPrice } from '@/hooks'

// Get Ethereum gas prices
const { selectedPrice, estimatedCosts } = useGasPrice(1, {
  speed: 'standard' // slow, standard, fast
})

// Get Base gas prices (fast)
const { selectedPrice } = useGasPrice(8453, { speed: 'fast' })`}
            </pre>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Health Check Hook</h3>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {`import { useHealthCheck } from '@/hooks'

// Basic health check
const { status, isHealthy } = useHealthCheck()

// Detailed health info
const { services, latency, region } = useHealthCheck({
  detailed: true,
  refreshInterval: 30000
})`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
