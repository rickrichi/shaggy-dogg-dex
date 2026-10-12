// src/components/StakerRewardPoolPanel.tsx
import { useMemo } from "react";

import {
  Award,
  CheckCircle2,
  Coins,
  Info,
  Layers,
  Scale,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { formatUnits } from "viem";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROTOCOL_ECONOMICS } from "@/config/protocol-economics";
import { BASE_STAKING } from "@/lib/staking";

interface StakerRewardPoolPanelProps {
  stakedBalance: bigint;
  totalProtocolStaked: bigint;
  dataReady: boolean;
}

export function StakerRewardPoolPanel({
  stakedBalance,
  totalProtocolStaked,
  dataReady,
}: StakerRewardPoolPanelProps) {
  const humanStaked = Number(formatUnits(stakedBalance, 18));
  const humanTotalStaked = Number(formatUnits(totalProtocolStaked, 18));

  const poolSharePct = useMemo(() => {
    if (!dataReady || totalProtocolStaked === 0n || stakedBalance === 0n) return "0.00";
    const bps = Number((stakedBalance * 10_000n) / totalProtocolStaked);
    return (bps / 100).toFixed(2);
  }, [stakedBalance, totalProtocolStaked, dataReady]);

  const isEligible = stakedBalance > 0n;

  return (
    <Card className="overflow-hidden border-purple-200/80 bg-gradient-to-br from-white via-purple-50/20 to-indigo-50/30 shadow-sm">
      <CardHeader className="border-b border-purple-100 bg-white/60 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-sm">
              <Coins className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-bold text-gray-900">
                  Staker Reward Pool (proposed)
                </CardTitle>
                <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                  Proposed · no payouts yet
                </Badge>
              </div>
              <CardDescription className="text-xs text-gray-500">
                Proposed policy: 10% of net realized protocol arbitrage fee revenue in
                Base USDC, if distributions go live. Nothing is paid today.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
              10% Net Fee Allocation
            </Badge>
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
              7-Day Weekly Epochs
            </Badge>
            <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-700">
              Base USDC
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* User Pool Share */}
          <div className="shadow-xs rounded-xl border border-purple-100 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Your share of the proposed pool</span>
              <Award className="size-4 text-purple-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-purple-700">{poolSharePct}%</span>
              {isEligible ? (
                <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600">
                  <CheckCircle2 className="mr-0.5 size-3" /> Would be counted
                </span>
              ) : (
                <span className="text-[11px] font-medium text-gray-400">No AMUTT staked</span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Based on {humanStaked.toLocaleString(undefined, { maximumFractionDigits: 2 })} of{" "}
              {humanTotalStaked.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              {BASE_STAKING.tokenSymbol} total staked
            </p>
          </div>

          {/* Allocation Split Ratio */}
          <div className="shadow-xs rounded-xl border border-purple-100 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Protocol Fee Allocation Split</span>
              <Scale className="size-4 text-indigo-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-indigo-700">10% / 90%</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              10% to AMUTT stakers · 90% to protocol treasury
            </p>
          </div>

          {/* Settlement Window & Cadence */}
          <div className="shadow-xs rounded-xl border border-purple-100 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Settlement Window</span>
              <TrendingUp className="size-4 text-emerald-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-emerald-700">7 Days</span>
              <span className="text-xs text-gray-400">Epoch Cadence</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Native Base USDC (
              <span className="font-mono text-[10px]">
                {PROTOCOL_ECONOMICS.rewards.asset.slice(0, 6)}...
                {PROTOCOL_ECONOMICS.rewards.asset.slice(-4)}
              </span>
              )
            </p>
          </div>
        </div>

        {/* Policy Guarantees & Transparency Notice */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 text-xs text-indigo-950">
            <div className="flex items-center gap-1.5 font-bold text-indigo-900">
              <ShieldCheck className="size-4 text-indigo-600" />
              <span>No payouts yet</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-indigo-800/90">
              Today no rewards are paid: the staking contract has no reward function and no
              distributor is deployed. If distributions go live, they would come only from{" "}
              <strong>realized net protocol fee revenue</strong> (after capital, fees, gas and carried
              losses). Staking does not guarantee any yield or APY.
            </p>
          </div>

          <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3.5 text-xs text-purple-950">
            <div className="flex items-center gap-1.5 font-bold text-purple-900">
              <Layers className="size-4 text-purple-600" />
              <span>Time-Weighted Eligibility</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-purple-800/90">
              If distributions go live, they would be weighted by active AMUTT staked multiplied by
              time staked during the 7-day epoch. Tokens merely held in a wallet do not qualify.
              Loss carryforwards protect protocol reserves.
            </p>
          </div>
        </div>

        {/* Status Alert Footer */}
        <Alert className="border-slate-200 bg-slate-50 text-slate-700">
          <Info className="size-4 text-slate-500" />
          <AlertDescription className="text-xs leading-relaxed text-slate-600">
            <strong>Status: not live.</strong> Proposed weekly epoch allocations can be calculated
            for review via{" "}
            <code className="font-mono text-[11px] text-purple-700">
              scripts/calculate-epoch-rewards.ts
            </code>{" "}
            from on-chain Base logs and verified trade fills. This calculation does not send any
            funds.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
