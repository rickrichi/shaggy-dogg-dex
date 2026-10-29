// src/pages/Stake.tsx
import { Link } from "react-router-dom";

import { ArrowRight, Award, Sparkles } from "lucide-react";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { MrwdLpStakerPanel } from "@/components/MrwdLpStakerPanel";
import { MrwdProStakingPanel } from "@/components/MrwdProStakingPanel";
import { RouterOperatorPanel } from "@/components/RouterOperatorPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { YieldVaultPanel } from "@/components/YieldVaultPanel";

// Mutt Rewards (MRWD) staking for Equilnyxs Pro is live (whitepaper v2.0 draft §11.1); the DEX tools
// below are still planned.
const PRO_FEATURES = ["Live trading on Base", "Full bar history", "Token tools"];
const PLANNED_FEATURES = [
  "Advanced Auto-Pilot strategies",
  "Launch analytics and launchpad dashboards",
  "Liquidity monitoring and alerts",
];

export default function Stake() {
  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Sub-Navigation Bar */}
      <LaunchpadNav />

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
              Staking & VIP Loyalty
            </h1>
            <Badge className="border-purple-200 bg-purple-100 text-purple-800">Base Mainnet</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Stake Mutt Rewards (MRWD) for Equilnyxs Pro. Premium DEX tools are planned.
          </p>
        </div>
      </div>

      {/* Cross-Link Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">
              MRWD Protocol Hub &amp; 56-Aggregator Routing Audit
            </p>
            <p className="text-xs text-gray-600">
              View canonical MRWD Base Mainnet contracts, the 56-aggregator routing audit, or launch
              new tokens in Token Studio.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/launchpad">
            <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-700">
              Launchpad Studio
            </Button>
          </Link>
          <Link to="/protocol">
            <Button
              size="sm"
              className="bg-indigo-600 font-semibold text-white hover:bg-indigo-700"
            >
              Protocol Hub <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <MrwdLpStakerPanel />
      <YieldVaultPanel />
      <RouterOperatorPanel />

      {/* MRWD staking for Equilnyxs Pro */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <MrwdProStakingPanel />
        </div>

        <div className="space-y-4 lg:col-span-5">
          <Card className="border-purple-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
                <Award className="size-5 text-amber-500" />
                What Staking Unlocks
              </CardTitle>
              <CardDescription>Equilnyxs Pro now; DEX tools later.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PRO_FEATURES.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white p-3.5"
                >
                  <p className="font-bold text-gray-900">{feature}</p>
                  <p className="text-[10px] font-semibold text-emerald-600">EQUILNYXS PRO</p>
                </div>
              ))}
              {PLANNED_FEATURES.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3.5"
                >
                  <p className="font-bold text-gray-900">{feature}</p>
                  <p className="text-[10px] font-semibold text-gray-400">PLANNED</p>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5 text-xs text-indigo-900">
                <span>Looking to supply concentrated liquidity?</span>
                <Link
                  to="/liquidity?version=v3"
                  className="font-semibold text-indigo-700 underline hover:text-indigo-900"
                >
                  Uniswap V3 Portal ↗
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
