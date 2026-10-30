import { Link } from "react-router-dom";

import { ArrowLeft, Coins, Fuel, ShieldCheck } from "lucide-react";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { PaymasterOperationsConsole } from "@/components/paymaster/PaymasterOperationsConsole";
import { PaymasterPortfolioTransfer } from "@/components/paymaster/PaymasterPortfolioTransfer";
import { Badge } from "@/components/ui/badge";

export default function Paymaster() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50 px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/launchpad"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ArrowLeft className="size-4" /> Back to Launchpad
        </Link>
        <LaunchpadNav />
        <div className="mb-8 rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm md:p-9">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-indigo-700 text-white">Base · ERC-4337 v0.8</Badge>
            <Badge variant="outline" className="border-emerald-200 text-emerald-800">
              MRWD reward
            </Badge>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            Portfolio Paymaster
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
            Use a Base token you already hold for an eligible transfer. The program sponsors the
            network gas and sends MRWD to your existing wallet after the operation succeeds. You do
            not pay gas in MRWD.
          </p>
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-indigo-950">
              <Coins className="mt-0.5 size-4 shrink-0" /> Select any held Base ERC-20, including a
              custom address.
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-indigo-950">
              <Fuel className="mt-0.5 size-4 shrink-0" /> Sponsor ETH covers eligible network fees.
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-indigo-950">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" /> An allowlist, cost cap, and
              cooldown protect the reward pool.
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <PaymasterPortfolioTransfer />
          <PaymasterOperationsConsole />
        </div>
      </div>
    </main>
  );
}
