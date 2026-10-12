// src/components/liquidity/LpLockCard.tsx
import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Layers,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CANONICAL_BASE_CONTRACTS } from "@/lib/launchpad/constants";

export const LOCKER_PLATFORMS = [
  {
    name: "UNCX Network",
    description: "Premier decentralized LP locker. Direct native support for Uniswap V3 position NFTs on Base.",
    url: "https://app.uncx.network/lockers/manage/lockers-v3",
    badge: "Official Base Partner",
  },
  {
    name: "Team Finance",
    description: "Audited liquidity locker supporting Base Uniswap V3 NFT positions.",
    url: "https://app.team.finance",
    badge: "Top Security Rating",
  },
] as const;

// Known Pool & Manager Addresses on Base
const SD_V3_POOL = "0x449730674404a29856c6b1e5941549d73c5b8f10";
const SD_V3_NFT_TOKEN_ID = "6245990";
const V3_POSITION_MANAGER = CANONICAL_BASE_CONTRACTS.UniswapV3PositionManager;

type LockDuration = 3 | 12;

export function LpLockCard() {
  const [selectedDuration, setSelectedDuration] = useState<LockDuration>(3);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Compute unlock timestamp and date in real time
  const lockDetails = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const days = selectedDuration === 3 ? 90 : 365;
    const unlockTimestamp = now + days * 86400;
    const unlockDate = new Date(unlockTimestamp * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return { days, unlockTimestamp, unlockDate };
  }, [selectedDuration]);

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <Card className="overflow-hidden border-indigo-200/80 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/30 shadow-sm">
      <CardHeader className="border-b border-indigo-100 bg-white/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-sm">
              <Lock className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-bold text-gray-900">
                  Lock LP Tokens
                </CardTitle>
                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                  Time-Lock Protection
                </Badge>
              </div>
              <CardDescription className="text-xs text-gray-500">
                Deposit LP tokens into a standard on-chain locker for 3 or 12 months to satisfy security scanners without burning capital.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-700">
              Manual 3 or 12 Mo Selection
            </Badge>
            <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
              100% Ownership Retained
            </Badge>
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
              Base Mainnet
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5">
        {/* Manual Duration Selection Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
              Step 1: Choose Your Lock Duration
            </span>
            <span className="text-[11px] text-gray-500">Manual choice: 3 Months vs 12 Months</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 3 Months Option */}
            <div
              onClick={() => setSelectedDuration(3)}
              className={`cursor-pointer rounded-xl border p-4 transition-all ${
                selectedDuration === 3
                  ? "border-indigo-600 bg-indigo-50/60 shadow-sm ring-2 ring-indigo-500/20"
                  : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className={`size-4 ${selectedDuration === 3 ? "text-indigo-600" : "text-gray-400"}`} />
                  <span className="text-sm font-bold text-gray-900">3 Month Lock (Quarterly)</span>
                </div>
                {selectedDuration === 3 ? (
                  <Badge className="bg-indigo-600 text-white">Active Choice</Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-500">Select</Badge>
                )}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-600">
                90-day time lock. Offers agility and early rebalancing flexibility while satisfying immediate scanner requirements.
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-indigo-100/60 pt-2 text-[11px] text-gray-500">
                <span>Unlock Target:</span>
                <span className="font-semibold text-indigo-900">~90 Days</span>
              </div>
            </div>

            {/* 12 Months Option */}
            <div
              onClick={() => setSelectedDuration(12)}
              className={`cursor-pointer rounded-xl border p-4 transition-all ${
                selectedDuration === 12
                  ? "border-purple-600 bg-purple-50/60 shadow-sm ring-2 ring-purple-500/20"
                  : "border-gray-200 bg-white hover:border-purple-300 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className={`size-4 ${selectedDuration === 12 ? "text-purple-600" : "text-gray-400"}`} />
                  <span className="text-sm font-bold text-gray-900">12 Month Lock (Annual)</span>
                </div>
                {selectedDuration === 12 ? (
                  <Badge className="bg-purple-600 text-white">Active Choice</Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-500">Select</Badge>
                )}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-600">
                365-day time lock. Gold standard for long-term community trust. Maximizes security rating on DexScreener, GoPlus, and Blockaid.
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-purple-100/60 pt-2 text-[11px] text-gray-500">
                <span>Unlock Target:</span>
                <span className="font-semibold text-purple-900">~365 Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Lock Summary Banner */}
        <div className="rounded-xl border border-indigo-200/90 bg-white p-4 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-950">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>Selected Configuration: {selectedDuration} Months ({lockDetails.days} Days)</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Unlocks on <span className="font-bold text-slate-900">{lockDetails.unlockDate}</span> (Unix timestamp:{" "}
                <code className="font-mono text-[11px] text-purple-700">{lockDetails.unlockTimestamp}</code>).
                Only your wallet address can withdraw.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => handleCopy(lockDetails.unlockTimestamp.toString(), "timestamp", "Unlock timestamp")}
            >
              {copiedKey === "timestamp" ? (
                <>
                  <Check className="size-3.5 text-emerald-600" /> Copied Timestamp
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Copy Unix Timestamp
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Copy Addresses & NFT ID Needed for Lockers */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Step 2: Copy Contract Addresses & V3 NFT ID
            </span>
            <span className="text-[11px] text-slate-500">Provide to UNCX or Team Finance locker</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {/* V3 Position NFT */}
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-emerald-950">V3 Position NFT ID</span>
                  <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-700">
                    Active
                  </Badge>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-800">
                  #{SD_V3_NFT_TOKEN_ID}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 bg-white text-[11px]"
                  onClick={() => handleCopy(SD_V3_NFT_TOKEN_ID, "nft", "Position NFT Token ID")}
                >
                  {copiedKey === "nft" ? (
                    <>
                      <Check className="size-3 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copy
                    </>
                  )}
                </Button>
                <a
                  href={`https://base.blockscout.com/token/${V3_POSITION_MANAGER}/instance/${SD_V3_NFT_TOKEN_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-emerald-700"
                  title="View NFT on Base Blockscout"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>

            {/* V3 Pool */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <div>
                <span className="block font-semibold text-slate-700">SD / WETH V3 Pool (1.0%)</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {SD_V3_POOL.slice(0, 8)}...{SD_V3_POOL.slice(-6)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => handleCopy(SD_V3_POOL, "pool", "V3 Pool Address")}
              >
                {copiedKey === "pool" ? (
                  <>
                    <Check className="size-3 text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy
                  </>
                )}
              </Button>
            </div>

            {/* Position Manager */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <div>
                <span className="block font-semibold text-slate-700">V3 Position Manager</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {V3_POSITION_MANAGER.slice(0, 8)}...{V3_POSITION_MANAGER.slice(-6)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => handleCopy(V3_POSITION_MANAGER, "mgr", "V3 Position Manager Address")}
              >
                {copiedKey === "mgr" ? (
                  <>
                    <Check className="size-3 text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Step 3: Standard Locker Links */}
        <div>
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
              Step 3: Deposit into On-Chain Locker ({selectedDuration} Months)
            </span>
            <span className="text-[11px] text-gray-500">Direct external dApp links</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {LOCKER_PLATFORMS.map((locker) => (
              <a
                key={locker.name}
                href={locker.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-indigo-100 bg-white p-3.5 transition-all hover:border-indigo-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 group-hover:text-indigo-600">
                      {locker.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {locker.badge}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
                    {locker.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-indigo-600 group-hover:underline">
                  <span>Open Locker ({selectedDuration} Mo)</span>
                  <ExternalLink className="size-3" />
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Strategic Tips Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-white p-3.5 text-xs shadow-xs">
            <div className="flex items-center gap-1.5 font-bold text-indigo-900">
              <ShieldCheck className="size-4 text-indigo-600" />
              <span>Full Ownership Protection</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              You never give away ownership. When the {selectedDuration}-month timer completes, only your connected wallet has the authority to unlock the position.
            </p>
          </div>

          <div className="rounded-xl border border-purple-100 bg-white p-3.5 text-xs shadow-xs">
            <div className="flex items-center gap-1.5 font-bold text-purple-900">
              <Layers className="size-4 text-purple-600" />
              <span>Locking Uniswap V3 NFTs</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Uniswap V3 liquidity is represented as an NFT (#6245990). In UNCX or Team Finance, select the Uniswap V3 locker option to lock your Position NFT directly.
            </p>
          </div>
        </div>

        {/* Warning Policy Alert */}
        <Alert className="border-amber-200 bg-amber-50/60 text-amber-900">
          <Clock className="size-4 text-amber-700" />
          <AlertDescription className="text-xs leading-relaxed text-amber-800">
            <strong>Security Rule:</strong> Never send LP tokens to a burn address (0x000...dead). Using a <strong>{selectedDuration}-month</strong> on-chain time-lock demonstrates security to traders and clears scanner warnings while keeping your capital and protocol authority 100% safe.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
