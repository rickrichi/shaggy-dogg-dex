// src/components/StakedHoldingsCard.tsx
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStakedPortfolio } from "@/hooks/useStakedPortfolio";
import { projectTokensFor } from "@/lib/launchpad/storage";

import type { Address } from "viem";

interface StakedHoldingsCardProps {
  address: Address;
}

/** What a wallet has staked, locked, vesting or runs, which wallet balances alone don't show. */
export function StakedHoldingsCard({ address }: StakedHoldingsCardProps) {
  const portfolio = useStakedPortfolio(address);

  const rows = useMemo(() => {
    const merged = new Map<string, { symbol: string; name: string; details: string[] }>();
    for (const token of portfolio.data?.tokens ?? []) {
      merged.set(token.address.toLowerCase(), {
        symbol: token.symbol,
        name: token.name,
        details: [...token.sources],
      });
    }
    for (const token of projectTokensFor(address)) {
      const key = token.tokenAddress.toLowerCase();
      const row = merged.get(key);
      if (row) row.details.push("Your project");
      else {
        merged.set(key, {
          symbol: token.tokenSymbol,
          name: token.tokenName,
          details: ["Your project"],
        });
      }
    }
    return [...merged.entries()].map(([key, row]) => ({ key, ...row }));
  }, [address, portfolio.data]);

  return (
    <Card className="border border-purple-100 bg-white/90 shadow-sm backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-gray-900">Staked &amp; Project Tokens</CardTitle>
        <CardDescription>
          Tokens you have staked, locked, or vesting, and projects you run. These are not included
          in the wallet balances above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {portfolio.isError && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            Could not load your staked tokens.
          </p>
        )}
        {portfolio.data?.incomplete && (
          <p role="status" className="text-xs font-semibold text-amber-800">
            Some staking reads failed, so this list may be incomplete.
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            {portfolio.isPending || portfolio.isFetching
              ? "Finding your staked tokens…"
              : "No staked or project tokens for this wallet."}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-50 p-3"
            >
              <div>
                <p className="font-bold text-gray-900">{row.symbol}</p>
                <p className="text-xs text-gray-500">{row.name}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {row.details.map((detail) => (
                  <Badge key={detail} variant="outline" className="text-[11px]">
                    {detail}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
        <Link to="/stake/dexes" className="block text-xs font-semibold text-purple-700 underline">
          Manage pools and rewards
        </Link>
      </CardContent>
    </Card>
  );
}
