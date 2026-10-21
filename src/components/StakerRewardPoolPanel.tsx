import { Coins, ShieldCheck } from "lucide-react";
import { formatUnits } from "viem";

import { RewardClaimsPanel } from "@/components/RewardClaimsPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROTOCOL_ECONOMICS } from "@/config/protocol-economics";

interface StakerRewardPoolPanelProps {
  stakedBalance: bigint;
  totalProtocolStaked: bigint;
  dataReady: boolean;
}

export function StakerRewardPoolPanel({ stakedBalance, totalProtocolStaked, dataReady }: StakerRewardPoolPanelProps) {
  return (
    <Card className="overflow-hidden border-purple-200 bg-white shadow-sm">
      <CardHeader className="border-b border-purple-100 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
            <Coins className="size-5 text-purple-700" /> AMUTT reward pool
          </CardTitle>
          <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-800">
            {PROTOCOL_ECONOMICS.enabled ? "Weekly allocations enabled" : "Terms approved · new allocations disabled"}
          </Badge>
        </div>
        <CardDescription className="leading-relaxed text-slate-600">
          10% of realized net arbitrage profit is allocated to eligible AMUTT stakers, with 90% retained by treasury. Funded weekly allocations are paid in USDC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 text-sm sm:flex-row sm:justify-between">
          <div><p className="text-xs text-slate-600">Your current AMUTT stake</p>
            <p className="mt-1 font-mono font-semibold text-slate-900">{dataReady ? formatUnits(stakedBalance, 18) : "Unavailable"}</p></div>
          <div><p className="text-xs text-slate-600">AMUTT held by staking contract</p>
            <p className="mt-1 font-mono font-semibold text-slate-900">{dataReady ? formatUnits(totalProtocolStaked, 18) : "Unavailable"}</p></div>
          <p className="max-w-xs text-xs leading-relaxed text-slate-600">Current balances do not determine your weekly reward. Allocations use the amount and duration of eligible stake during each completed week.</p>
        </div>
        <div className="flex gap-2 rounded-lg bg-purple-50 p-3 text-xs leading-relaxed text-purple-950">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>Rewards can only come from realized profit after capital, fees, gas and carried losses. Staking does not guarantee yield. Disabling new allocations does not prevent claims for previously funded weeks. AMUTT project wallets are excluded from allocations, and each weekly ledger lists them.</p>
        </div>
        <RewardClaimsPanel />
      </CardContent>
    </Card>
  );
}
