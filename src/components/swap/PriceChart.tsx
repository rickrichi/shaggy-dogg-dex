import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { usePublicClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Token } from "@/config/tokens";
import { quoteSmartRoutes } from "@/lib/amm/smart-routing";

export function PriceChart({ baseToken, quoteToken }: { baseToken: Token; quoteToken: Token }) {
  const client = usePublicClient({ chainId: baseToken.chainId });
  const quotes = useQuery({
    queryKey: ["venue-unit-quote", baseToken.chainId, baseToken.address, quoteToken.address],
    enabled:
      !!client &&
      baseToken.chainId === quoteToken.chainId &&
      baseToken.address !== quoteToken.address,
    refetchInterval: 15_000,
    retry: 1,
    queryFn: () =>
      quoteSmartRoutes(client!, baseToken, quoteToken, 10n ** BigInt(baseToken.decimals)),
  });
  const venues = baseToken.chainId === 8453 ? ["Uniswap V2", "Aerodrome"] : ["Uniswap V2"];
  return (
    <Card className="min-h-[300px]">
      <CardHeader>
        <CardTitle>DEX venue quotes</CardTitle>
        <p>
          1 {baseToken.symbol} → {quoteToken.symbol} ·{" "}
          {baseToken.chainId === 8453 ? "Base mainnet" : `Chain ${baseToken.chainId}`}
        </p>
        <Button
          variant="outline"
          onClick={() => void quotes.refetch()}
          disabled={quotes.isFetching || !client}
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {quotes.isError ? (
          <p role="alert">RPC unavailable</p>
        ) : (
          venues.map((venue) => {
            const quote = quotes.data?.quotes.find((q) => q.route.venue === venue);
            return (
              <div key={venue} className="rounded border p-3">
                <p className="font-semibold">{venue}</p>
                <p>
                  {quotes.isPending
                    ? "Checking…"
                    : quote
                      ? `${formatUnits(quote.output, quoteToken.decimals)} ${quoteToken.symbol}`
                      : "No liquidity route"}
                </p>
              </div>
            );
          })
        )}
        {quotes.data && (
          <p className="text-xs">
            Block {quotes.data.blockNumber.toString()} ·{" "}
            {new Date(quotes.data.observedAt).toLocaleTimeString()}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Unit-size reference quotes. Review the quote for your actual trade size below. Pool fees
          included; gas separate.
        </p>
      </CardContent>
    </Card>
  );
}
