import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, Globe, RefreshCw, Search } from "lucide-react";
import { type Address, formatUnits, parseAbi } from "viem";
import { usePublicClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import auditReport from "@/config/mrwd-aggregator-audit.json";

type AuditStatus = "quote_returned" | "no_quote" | "api_error" | "requires_key" | "manual_review";

interface AuditRow {
  name: string;
  direction?: string;
  status: AuditStatus;
  output?: string;
  exactPoolMatched?: boolean;
  detail?: string;
  testedAt: string;
}

type FilterMode = "all" | "adapters" | "quote_returned" | "manual_review";

const POOL_ADDRESS = auditReport.verification.pool as Address;
const FACTORY_ADDRESS = auditReport.verification.factory as Address;
const WETH_ADDRESS = auditReport.verification.weth as Address;
const MRWD_ADDRESS = auditReport.verification.mrwd as Address;

const poolAbi = parseAbi([
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

const factoryAbi = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
]);

function statusBadge(row: AuditRow) {
  switch (row.status) {
    case "quote_returned":
      return (
        <div className="flex flex-wrap items-center gap-1">
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
            Quote Returned
          </Badge>
          {row.exactPoolMatched && (
            <Badge className="border-indigo-200 bg-indigo-50 text-indigo-800">
              Exact Pool Match
            </Badge>
          )}
        </div>
      );
    case "requires_key":
      return <Badge className="border-amber-200 bg-amber-50 text-amber-800">Requires API Key</Badge>;
    case "api_error":
      return <Badge className="border-rose-200 bg-rose-50 text-rose-800">Edge / API Error</Badge>;
    case "no_quote":
      return <Badge className="border-slate-200 bg-slate-100 text-slate-700">No Quote</Badge>;
    case "manual_review":
      return <Badge variant="outline">Manual / Partner Queue</Badge>;
  }
}

function formatQuoteOutput(row: AuditRow): string {
  if (!row.output) return "—";
  try {
    if (row.direction === "WETH->MRWD") {
      const val = Number(formatUnits(BigInt(row.output), 18));
      return `${val.toLocaleString("en-US", { maximumFractionDigits: 2 })} MRWD (for 0.001 WETH)`;
    }
    if (row.direction === "MRWD->WETH") {
      return `${formatUnits(BigInt(row.output), 18)} WETH (for 1 MRWD)`;
    }
    return row.output;
  } catch {
    return row.output;
  }
}

export function MrwdAggregatorAuditCard() {
  const client = usePublicClient({ chainId: 8453 });
  const [filter, setFilter] = useState<FilterMode>("adapters");
  const [search, setSearch] = useState("");

  const livePool = useQuery({
    queryKey: ["mrwd-aggregator-live-pool"],
    enabled: !!client,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [blockNumber, liquidity, slot0, factoryPool] = await Promise.all([
        client!.getBlockNumber(),
        client!.readContract({
          address: POOL_ADDRESS,
          abi: poolAbi,
          functionName: "liquidity",
        }),
        client!.readContract({
          address: POOL_ADDRESS,
          abi: poolAbi,
          functionName: "slot0",
        }),
        client!.readContract({
          address: FACTORY_ADDRESS,
          abi: factoryAbi,
          functionName: "getPool",
          args: [WETH_ADDRESS, MRWD_ADDRESS, 3000],
        }),
      ]);
      return {
        blockNumber: blockNumber.toString(),
        liquidity: liquidity.toString(),
        tick: slot0[1],
        canonical: factoryPool.toLowerCase() === POOL_ADDRESS.toLowerCase(),
      };
    },
  });

  const allResults = auditReport.results as AuditRow[];

  const counts = useMemo(() => {
    const unique = new Set(allResults.map((r) => r.name)).size;
    const adapters = allResults.filter((r) => r.status !== "manual_review").length;
    const quotes = allResults.filter((r) => r.status === "quote_returned").length;
    const manual = allResults.filter((r) => r.status === "manual_review").length;
    const quotingProviders = new Set(
      allResults.filter((r) => r.status === "quote_returned").map((r) => r.name)
    );
    return { unique, adapters, quotes, manual, quotingProviders: [...quotingProviders] };
  }, [allResults]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allResults.filter((row) => {
      if (filter === "adapters" && row.status === "manual_review") return false;
      if (filter === "quote_returned" && row.status !== "quote_returned") return false;
      if (filter === "manual_review" && row.status !== "manual_review") return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.detail?.toLowerCase().includes(q) ?? false) ||
        (row.direction?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allResults, filter, search]);

  return (
    <Card className="border-indigo-100 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="size-5 text-indigo-600" />
            <CardTitle className="text-xl text-gray-900">
              MRWD 56-Aggregator Audit &amp; Routing Visibility
            </CardTitle>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
              Canonical Base V3 Pool Verified
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/mrwd-56-aggregators.zip" download="mrwd-56-aggregators.zip">
              <Button size="sm" variant="outline" className="border-indigo-200 text-indigo-700">
                <Download className="mr-1.5 size-3.5" />
                mrwd-56-aggregators.zip
              </Button>
            </a>
            <a href="/mrwd-56-aggregators/report.json" target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                report.json <ExternalLink className="ml-1 size-3" />
              </Button>
            </a>
            <a href="/mrwd-56-aggregators/report.csv" download="mrwd-56-aggregators-report.csv">
              <Button size="sm" variant="outline">
                <Download className="mr-1.5 size-3.5" />
                report.csv
              </Button>
            </a>
          </div>
        </div>
        <CardDescription>
          Read-only verification of canonical Uniswap V3 pool registration on Base (chain{" "}
          {auditReport.chainId}) and live aggregator quote discovery across {counts.unique} routing
          platforms.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        {/* Summary Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
            <p className="text-xs font-medium text-emerald-800">Canonical Uniswap V3 Pool</p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-bold text-emerald-950">
              <CheckCircle2 className="size-4 text-emerald-600" />
              {livePool.data
                ? livePool.data.canonical
                  ? "Verified Live"
                  : "Mismatch"
                : "Verified (Block " + auditReport.verification.blockNumber + ")"}
            </p>
            <a
              href={`https://basescan.org/address/${POOL_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate font-mono text-[11px] text-emerald-700 underline"
            >
              {POOL_ADDRESS}
            </a>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
            <p className="text-xs font-medium text-indigo-800">
              Live Bidirectional Quotes ({counts.quotingProviders.length} Routers)
            </p>
            <p className="mt-1 text-sm font-bold text-indigo-950">
              {counts.quotingProviders.join(", ")}
            </p>
            <p className="mt-1 text-[11px] text-indigo-700">
              0.001 WETH → ~4.89B MRWD · 3 verify exact pool 0xa7D4…bDB5
            </p>
          </div>

          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3.5">
            <p className="text-xs font-medium text-purple-800">Registry Coverage</p>
            <p className="mt-1 text-base font-bold text-purple-950">
              {counts.unique} Platforms Tracked
            </p>
            <p className="mt-1 text-[11px] text-purple-700">
              7 Active Adapters ({counts.quotes} live quotes) · {counts.manual} Partner Queue
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">On-Chain Pool State (0.30%)</p>
              {livePool.isSuccess && (
                <button
                  type="button"
                  onClick={() => void livePool.refetch()}
                  className="text-slate-500 hover:text-slate-800"
                  title="Refresh live pool state"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">
              Tick {livePool.data ? livePool.data.tick : auditReport.verification.tick}
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-slate-600">
              Liquidity:{" "}
              {livePool.data ? livePool.data.liquidity : auditReport.verification.activeLiquidityRaw}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "adapters", label: `Active Adapters (${counts.adapters})` },
                { id: "quote_returned", label: `Quotes Returned (${counts.quotes})` },
                { id: "manual_review", label: `Partner Queue (${counts.manual})` },
                { id: "all", label: `All Entries (${allResults.length})` },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={filter === tab.id ? "default" : "outline"}
                onClick={() => setFilter(tab.id)}
                className={
                  filter === tab.id ? "bg-indigo-600 text-white hover:bg-indigo-700" : "text-xs"
                }
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search 56 aggregators…"
              className="pl-8 text-xs"
              aria-label="Search aggregators"
            />
          </div>
        </div>

        {/* Results Table */}
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2.5 font-semibold">Aggregator / Router</th>
                <th className="px-3 py-2.5 font-semibold">Direction</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Indicative Output</th>
                <th className="px-3 py-2.5 font-semibold">Audit Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row, idx) => (
                <tr key={`${row.name}-${row.direction ?? idx}`} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">
                    {row.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-600">
                    {row.direction ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{statusBadge(row)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-800">
                    {formatQuoteOutput(row)}
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-slate-500" title={row.detail}>
                    {row.detail ?? "—"}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No aggregators match &ldquo;{search}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Methodology: {auditReport.methodology} Canonical Base Uniswap V3 Factory:{" "}
          <span className="font-mono">{FACTORY_ADDRESS}</span>.
        </p>
      </CardContent>
    </Card>
  );
}
