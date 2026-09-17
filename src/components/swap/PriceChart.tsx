import { useMemo } from "react";

import { ArrowRight, RefreshCw, Route } from "lucide-react";
import { type Address, formatUnits, parseUnits } from "viem";
import { useReadContracts } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { DEX_VENUES } from "@/config/dexes";
import { type Token, WRAPPED_NATIVE_ADDRESS } from "@/config/tokens";

const resolveAddress = (token: Token): Address =>
  token.address === "native" ? WRAPPED_NATIVE_ADDRESS : token.address;

const buildPath = (baseToken: Token, quoteToken: Token): readonly Address[] => {
  const base = resolveAddress(baseToken);
  const quote = resolveAddress(quoteToken);
  if (base === quote) return [base];
  if (base === WRAPPED_NATIVE_ADDRESS || quote === WRAPPED_NATIVE_ADDRESS) {
    return [base, quote];
  }
  return [base, WRAPPED_NATIVE_ADDRESS, quote];
};

interface PriceChartProps {
  baseToken: Token;
  quoteToken: Token;
}

interface VenueQuote {
  readonly id: string;
  readonly name: string;
  readonly output: bigint | null;
  readonly status: "quoted" | "no-route" | "rpc-error" | "loading";
  readonly detail?: string;
}

export const PriceChart = ({ baseToken, quoteToken }: PriceChartProps) => {
  const path = useMemo(() => buildPath(baseToken, quoteToken), [baseToken, quoteToken]);
  const amountIn = useMemo(() => parseUnits("1", baseToken.decimals), [baseToken.decimals]);
  const canQuote = path.length > 1 && path[0] !== path[path.length - 1];

  const { data, error: readError, isError, isFetching, refetch } = useReadContracts({
    contracts: DEX_VENUES.map((venue) => ({
      address: venue.router,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "getAmountsOut" as const,
      args: [amountIn, path],
    })),
    query: {
      enabled: canQuote,
      refetchInterval: 15_000,
      staleTime: 10_000,
    },
  });

  const quotes = useMemo<readonly VenueQuote[]>(
    () =>
      DEX_VENUES.map((venue, index) => {
        const result = data?.[index];
        const amounts = result?.status === "success" ? result.result : undefined;
        const output = Array.isArray(amounts) ? (amounts.at(-1) as bigint | undefined) : undefined;
        const resultError = result?.status === "failure" ? result.error : undefined;
        const detail = resultError instanceof Error ? resultError.message : undefined;
        const noRoute = detail?.toLowerCase().includes("revert") ?? false;
        return {
          id: venue.id,
          name: venue.name,
          output: output ?? null,
          status: output
            ? "quoted"
            : isFetching
              ? "loading"
              : noRoute
                ? "no-route"
                : "rpc-error",
          ...(detail ? { detail } : {}),
        };
      }),
    [data, isFetching]
  );

  const bestOutput = quotes.reduce<bigint | null>(
    (best, quote) =>
      quote.output !== null && (best === null || quote.output > best) ? quote.output : best,
    null
  );

  return (
    <Card className="flex h-full min-h-[400px] flex-col border-slate-200/50 bg-white/70 shadow-sm backdrop-blur-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="size-5 text-purple-600" />
              DEX venue quotes
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              1 {baseToken.symbol} <ArrowRight className="inline size-3" /> {quoteToken.symbol} on
              Ethereum
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 p-5">
        {quotes.map((quote) => {
          const isBest = quote.output !== null && quote.output === bestOutput;
          return (
            <div
              key={quote.id}
              className={`flex items-center justify-between rounded-lg border p-4 ${
                isBest ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-900">{quote.name}</p>
                <p className="text-xs text-slate-500">
                  {path.length === 3 ? `via WETH` : "direct pair"}
                </p>
              </div>
              <div className="text-right">
                {quote.output === null ? (
                  <>
                    <p className="text-sm font-medium text-slate-400">
                      {quote.status === "loading"
                        ? "Checking…"
                        : quote.status === "no-route"
                          ? "No liquidity route"
                          : "RPC unavailable"}
                    </p>
                    {quote.detail && (
                      <p
                        className="mt-1 max-w-64 truncate text-xs text-red-500"
                        title={quote.detail}
                      >
                        {quote.detail}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-mono font-semibold text-slate-900">
                      {Number(formatUnits(quote.output, quoteToken.decimals)).toLocaleString(
                        undefined,
                        { maximumSignificantDigits: 8 }
                      )}{" "}
                      {quoteToken.symbol}
                    </p>
                    {isBest && <p className="text-xs font-medium text-emerald-700">Best quote</p>}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            Router reads failed: {readError?.message ?? "Unknown RPC error"}
          </div>
        )}

        <p className="pt-2 text-xs leading-relaxed text-slate-500">
          Read-only router quotes refresh every 15 seconds. A listed token is tradable only when
          the selected venue has sufficient liquidity along the displayed path.
        </p>
      </CardContent>
    </Card>
  );
};
