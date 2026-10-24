// src/pages/ProtocolOps.tsx
import { Link } from "react-router-dom";

import { ArrowLeft, ShieldCheck } from "lucide-react";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
            Real-time contract custody, automated token importer, liquidity controls, and VIP tier
            management.
          </p>
        </div>

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

      {/* Main Operations Console */}
      <Card className="border-indigo-100 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
            <ShieldCheck className="size-5 text-indigo-600" />
            No protocol contracts to manage yet
          </CardTitle>
          <CardDescription>
            MuttChow&apos;s token, incentive scheduler, and liquidity lock will appear here once
            they are deployed, reviewed, and verified on Base Mainnet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/launchpad">
            <Button size="sm" className="bg-indigo-600 font-semibold text-white hover:bg-indigo-700">
              Open Token Studio
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
