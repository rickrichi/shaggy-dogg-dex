import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits } from "viem";
import { usePublicClient } from "wagmi";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { quoteSmartRoutes } from "@/lib/amm/smart-routing";

const usdc = BASE_MAINNET_TOKENS.find((t) => t.symbol === "USDC")!;
const weth = BASE_MAINNET_TOKENS.find((t) => t.symbol === "WETH")!;

export function BaseExecutionComparison({ notional }: { notional: number }) {
  const client = usePublicClient({ chainId: 8453 });
  const amount =
    Number.isFinite(notional) && notional > 0 && notional <= 1_000_000
      ? parseUnits(notional.toFixed(6), 6)
      : 0n;
  const quote = useQuery({
    queryKey: ["desk-base-routes", amount.toString()],
    enabled: !!client && amount > 0n,
    refetchInterval: 10_000,
    retry: 1,
    queryFn: () => quoteSmartRoutes(client!, usdc, weth, amount),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Base DEX execution comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Buy WETH with {formatUnits(amount, 6)} USDC on Base. Kraken and Alpaca above quote ETH in
          USD; USD and USDC are separate assets.
        </p>
        {quote.isPending ? (
          <p>Reading Base pools…</p>
        ) : quote.isError ? (
          <p role="alert">Base quotes unavailable. {quote.error.message}</p>
        ) : (
          <>
            <p>
              Quoted at block {quote.data.blockNumber.toString()} ·{" "}
              {new Date(quote.data.observedAt).toLocaleTimeString()}
            </p>
            {(["Uniswap V3", "Uniswap V2", "Aerodrome"] as const).map((venue) => {
              const route = quote.data.quotes.find((q) => q.route.venue === venue);
              const extraLabel = route?.route.fee ? ` (${route.route.fee / 10000}%)` : "";
              return (
                <p key={venue}>
                  {venue}{extraLabel}:{" "}
                  {route ? `${formatUnits(route.output, 18)} WETH` : "No executable pool route"}
                </p>
              );
            })}
          </>
        )}
        <p>
          Pool fees are included; gas is separate. Cross-venue legs settle independently. A failed
          or partial leg leaves exposure.
        </p>
        <Link className="text-purple-700 underline" to="/swap/compare?input=USDC&output=WETH">
          Review and sign the Base leg
        </Link>
        <p className="text-xs text-slate-500">
          Match the filled base quantity when hedging. Reconcile the exchange order and Base receipt
          before another trade. Automatic Kraken–Base hedging is not enabled.
        </p>
      </CardContent>
    </Card>
  );
}
