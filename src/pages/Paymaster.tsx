import { Link } from "react-router-dom";

import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Coins,
  Cpu,
  Fuel,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { formatGwei } from "viem";
import { base } from "viem/chains";
import { useBlockNumber, useGasPrice } from "wagmi";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { PaymasterOperationsConsole } from "@/components/paymaster/PaymasterOperationsConsole";
import { PaymasterPortfolioTransfer } from "@/components/paymaster/PaymasterPortfolioTransfer";
import { Badge } from "@/components/ui/badge";
import {
  BASE_ENTRYPOINT_V07,
  MRWD_ON_BASE,
  SPONSORED_REWARD_PAYMASTER_ON_BASE,
} from "@/lib/paymaster/client";

function formatCompactGwei(gasPrice: bigint): string {
  const raw = Number(formatGwei(gasPrice));
  if (!Number.isFinite(raw)) return formatGwei(gasPrice);
  if (raw >= 10) return raw.toFixed(1);
  if (raw >= 1) return raw.toFixed(2);
  return raw.toFixed(4);
}

export default function Paymaster() {
  const { data: blockNumber } = useBlockNumber({ chainId: base.id, watch: true });
  const { data: gasPrice } = useGasPrice({ chainId: base.id });

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden px-3 py-4 text-slate-900 duration-500 animate-in fade-in sm:px-4 sm:py-6 md:px-8">
      {/* Subtle 2026 Ambient Mesh & Grid Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-96 max-w-6xl rounded-full bg-gradient-to-tr from-purple-500/15 via-fuchsia-400/10 to-indigo-500/15 blur-3xl"
      />

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top Breadcrumb + Live Telemetry Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/launchpad"
            className="inline-flex items-center gap-2 rounded-full border border-purple-200/80 bg-white/85 px-3.5 py-1.5 text-xs font-semibold text-purple-800 shadow-sm backdrop-blur-md transition hover:border-purple-300 hover:bg-purple-50/90 hover:text-purple-950"
          >
            <ArrowLeft className="size-3.5" /> Back to Launchpad
          </Link>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50/90 px-3 py-1 font-semibold text-emerald-900 shadow-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Base Mainnet (8453)
            </span>
            {gasPrice && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 font-medium tabular-nums text-amber-800 shadow-sm">
                <Fuel className="size-3.5 shrink-0 text-amber-600" />
                {formatCompactGwei(gasPrice)} Gwei
              </span>
            )}
            {blockNumber && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 font-medium tabular-nums text-slate-700 shadow-sm">
                <Activity className="size-3.5 shrink-0 text-emerald-600" />#{blockNumber.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <LaunchpadNav />

        {/* 2026 Flagship Hero Card */}
        <section className="relative overflow-hidden rounded-3xl border border-purple-200/80 bg-white/95 p-6 shadow-xl ring-1 ring-purple-500/10 backdrop-blur-xl md:p-8">
          <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-purple-700 via-fuchsia-600 to-emerald-500 mb-6" />

          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="max-w-3xl space-y-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-gradient-to-r from-purple-700 via-indigo-700 to-fuchsia-700 px-3 py-1 text-white shadow-sm">
                  Base · ERC-4337 v0.7 · EIP-7702
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-300 bg-emerald-50/90 px-3 py-1 font-semibold text-emerald-800"
                >
                  <Sparkles className="mr-1 size-3 text-emerald-600" />
                  MRWD reward · 0 MRWD fee
                </Badge>
                <Badge
                  variant="outline"
                  className="border-purple-200 bg-purple-50/80 px-3 py-1 font-medium text-purple-900"
                >
                  Open Portfolio Policy
                </Badge>
              </div>

              <h1 className="bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
                Portfolio Paymaster
              </h1>

              <p className="text-sm leading-relaxed text-slate-600 md:text-base">
                Transfer, swap, or stake any Base ERC-20 token you hold in your portfolio. The
                paymaster sponsors the network gas in ETH and rewards your existing wallet with MRWD
                after the operation succeeds. You never pay gas in MRWD.
              </p>
            </div>

            {/* Canonical Contract Quick-Inspect Box */}
            <div className="shrink-0 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-4 text-xs shadow-sm lg:w-80">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-700">
                  <Cpu className="size-3.5 text-purple-600" /> Canonical Base Stack
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                  v0.7 LIVE
                </span>
              </div>
              <dl className="mt-2.5 space-y-2 font-mono">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-slate-500">Paymaster</dt>
                  <dd>
                    <a
                      href={`https://basescan.org/address/${SPONSORED_REWARD_PAYMASTER_ON_BASE}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-purple-700 underline underline-offset-2 hover:text-purple-950"
                    >
                      {SPONSORED_REWARD_PAYMASTER_ON_BASE.slice(0, 6)}…
                      {SPONSORED_REWARD_PAYMASTER_ON_BASE.slice(-4)}
                      <ArrowUpRight className="size-3" />
                    </a>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-slate-500">EntryPoint v0.7</dt>
                  <dd>
                    <a
                      href={`https://basescan.org/address/${BASE_ENTRYPOINT_V07}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-slate-700 underline underline-offset-2 hover:text-purple-800"
                    >
                      {BASE_ENTRYPOINT_V07.slice(0, 6)}…{BASE_ENTRYPOINT_V07.slice(-5)}
                      <ArrowUpRight className="size-3" />
                    </a>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-slate-500">Reward Token</dt>
                  <dd>
                    <a
                      href={`https://basescan.org/token/${MRWD_ON_BASE}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                    >
                      $MRWD ({MRWD_ON_BASE.slice(0, 6)}…{MRWD_ON_BASE.slice(-4)})
                      <ArrowUpRight className="size-3" />
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 3-Pillar Capability Strip */}
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="flex items-start gap-3 rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/90 to-indigo-50/60 p-4 text-slate-900 shadow-sm">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                <Coins className="size-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">Universal Base ERC-20 Support</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  Works with any held Base ERC-20 for transfers, DEX swaps, and staking vaults.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-slate-50/70 p-4 text-slate-900 shadow-sm">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                <Zap className="size-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">Atomic Approve + Action Batching</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  Sponsor ETH covers eligible network fees and batches token approvals
                  automatically.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 p-4 text-slate-900 shadow-sm">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">On-Chain Policy & Cooldowns</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  Open portfolio eligibility with on-chain balance checks, cost caps, and wallet
                  cooldowns.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-8">
          <PaymasterPortfolioTransfer />
          <PaymasterOperationsConsole />
        </div>
      </div>
    </div>
  );
}
