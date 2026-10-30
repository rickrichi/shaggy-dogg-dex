// src/pages/ProtocolOps.tsx
import { Link } from "react-router-dom";

import { ArrowLeft, ExternalLink, Lock, ShieldCheck } from "lucide-react";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { MrwdAggregatorAuditCard } from "@/components/MrwdAggregatorAuditCard";
import { MrwdLpStakerPanel } from "@/components/MrwdLpStakerPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MRWD_CONTRACTS = [
  {
    label: "Mutt Rewards ($MRWD) Token",
    address: "0xC17227AAa33C54634B6cE7AD0bf33A156563c179",
    role: "1,000,000,000,000 fixed supply · ownerless ERC-20",
    sourcify: "https://repo.sourcify.dev/8453/0xC17227AAa33C54634B6cE7AD0bf33A156563c179",
  },
  {
    label: "Uniswap V3 Pool (WETH / MRWD 0.30%)",
    address: "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5",
    role: "Canonical Base Uniswap V3 pool · fee tier 3000",
  },
  {
    label: "MuttIncentiveScheduler",
    address: "0xCAbf284806b800d9A771B55857B9fCF735ea7109",
    role: "600B MRWD reserve · 16 quarterly incentives · permissionless",
    sourcify: "https://repo.sourcify.dev/8453/0xCAbf284806b800d9A771B55857B9fCF735ea7109",
  },
  {
    label: "MuttProStaking",
    address: "0x67dBC193bF510225EBf189ab25dC3b34a32c1766",
    role: "1B MRWD 30-day lock for Equilnyxs Pro",
    sourcify: "https://repo.sourcify.dev/8453/0x67dBC193bF510225EBf189ab25dC3b34a32c1766",
  },
  {
    label: "V3PositionTimelock (Launch Position #6351512)",
    address: "0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25",
    role: "200B MRWD launch liquidity locked until 2028-10-24",
  },
  {
    label: "UniswapV3Staker",
    address: "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1",
    role: "Quarter 1 active (55.45B MRWD funded)",
  },
  {
    label: "MuttVesting (Treasury — 150B MRWD)",
    address: "0x7bC37041E1205841a83413625650EC12DA119697",
    role: "12-month cliff (2027-10-25), 36-month linear release",
    sourcify: "https://repo.sourcify.dev/8453/0x7bC37041E1205841a83413625650EC12DA119697",
  },
  {
    label: "MuttVesting (Team — 50B MRWD)",
    address: "0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1",
    role: "12-month cliff (2027-10-25), 36-month linear release",
    sourcify: "https://repo.sourcify.dev/8453/0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1",
  },
] as const;

export default function ProtocolOps() {
  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Sub-Navigation Bar */}
      <LaunchpadNav />

      {/* Top Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-3xl font-black text-transparent">
              Protocol Hub
            </h1>
            <span className="rounded-full border border-indigo-200 bg-indigo-100 px-3 py-0.5 text-xs font-bold text-indigo-800">
              Base Mainnet Live
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Mutt Rewards ($MRWD) canonical contracts, liquidity timelock, emission scheduler, and
            56-aggregator routing audit.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/paymaster">
            <Button
              size="sm"
              variant="outline"
              className="border-purple-200 bg-purple-50/70 font-semibold text-purple-800 hover:bg-purple-100"
            >
              ERC-4337 Gas Paymaster
            </Button>
          </Link>
          <Link to="/stake">
            <Button size="sm" className="bg-indigo-600 font-semibold text-white hover:bg-indigo-700">
              Stake MRWD
            </Button>
          </Link>
          <Link to="/launchpad">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="mr-2 size-4" /> Back to Token Studio
            </Button>
          </Link>
        </div>
      </div>

      {/* Live UniswapV3Staker LP Rewards & Uncollected Fees */}
      <MrwdLpStakerPanel />

      {/* 56-Aggregator Audit & Routing Visibility */}
      <MrwdAggregatorAuditCard />

      {/* Canonical MRWD Deployments */}
      <Card className="border-indigo-100 bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
              <ShieldCheck className="size-5 text-indigo-600" />
              Mutt Rewards ($MRWD) Base Mainnet Contracts
            </CardTitle>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <Lock className="mr-1 size-3" /> Sourcify Exact Match Verified
            </Badge>
          </div>
          <CardDescription>
            Canonical deployment addresses from <code>deployments/mrwd-base-mainnet.json</code>{" "}
            (launched 2026-10-25 on Base chain 8453).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {MRWD_CONTRACTS.map((item) => (
              <div
                key={item.address}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">{item.label}</p>
                  <p className="mt-0.5 text-slate-600">{item.role}</p>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2">
                  <a
                    href={`https://basescan.org/address/${item.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-[11px] text-indigo-700 underline hover:text-indigo-900"
                  >
                    {item.address}
                  </a>
                  {"sourcify" in item && item.sourcify && (
                    <a
                      href={item.sourcify}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                    >
                      Sourcify <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
