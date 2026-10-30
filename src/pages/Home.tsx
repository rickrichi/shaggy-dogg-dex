// src/pages/Home.tsx
import { Link } from "react-router-dom";

import { ArrowLeftRight, Layers, ShieldCheck, Trophy, Wallet } from "lucide-react";
import { useAccount } from "wagmi";

import { Card, CardContent } from "@/components/ui/card";
import { useUserActivity } from "@/hooks/useUserActivity";

// The networks the swap screen supports, each with its own verified Uniswap V2 router.
const NETWORKS = ["Base", "Ethereum", "Arbitrum", "Optimism", "Polygon", "Sepolia (test)"];

const FEATURES = [
  {
    icon: Trophy,
    title: "Best quote on Base",
    description:
      "Every Base swap is quoted on Uniswap, Aerodrome, PancakeSwap, SushiSwap and BaseSwap, and the best quote is the one you get.",
  },
  {
    icon: Layers,
    title: "Six networks",
    description:
      "Swap on Ethereum, Arbitrum, Optimism, Polygon and Sepolia through Uniswap V2, each with its own router.",
  },
  {
    icon: ShieldCheck,
    title: "Your keys, your coins",
    description:
      "Non-custodial: you approve every transaction in your own wallet, and the DEX never holds your funds.",
  },
  {
    icon: Wallet,
    title: "Portfolio & activity",
    description: "See your holdings and the swaps you've made from this wallet.",
  },
];

export default function Home() {
  const { isConnected } = useAccount();
  const { stats, loading } = useUserActivity();
  const showStats = isConnected && !loading && stats.totalSwaps > 0;

  return (
    <div className="space-y-16 pb-4">
      {/* Hero */}
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6 text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/80 px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm">
            <span className="size-2 rounded-full bg-emerald-500" />
            Live on Base
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Swap smarter with{" "}
            <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 bg-clip-text text-transparent">
              Shaggy Mutt
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-gray-600 lg:mx-0">
            A friendly, non-custodial DEX. Trade straight from your own wallet, and on Base get the
            best of Uniswap and Aerodrome in one swap.
          </p>
          <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link
              to="/swap"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg shadow-purple-500/25 transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <ArrowLeftRight className="size-5" />
              Start swapping
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
            {NETWORKS.map((n) => (
              <span
                key={n}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  n === "Base"
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 bg-white/80 text-gray-600"
                }`}
              >
                {n}
              </span>
            ))}
          </div>
        </div>

        {/* DEX card */}
        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-purple-400/30 via-pink-400/25 to-orange-300/30 blur-2xl" />
          <div className="relative rounded-3xl border border-white/60 bg-white/85 p-7 text-center shadow-2xl shadow-purple-500/10 backdrop-blur">
            <img
              src="/amutt-logo-256.png"
              alt="Shaggy Mutt logo: a happy dog with its tongue out"
              width={128}
              height={128}
              className="mx-auto size-32 rounded-full shadow-lg ring-4 ring-white"
            />
            <h2 className="mt-5 text-2xl font-extrabold text-gray-900">Shaggy Mutt DEX</h2>
            <p className="text-sm font-semibold tracking-wide text-purple-600">
              Non-custodial · Base
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl bg-purple-50 p-3">
                <dt className="text-xs text-gray-500">Base venues compared</dt>
                <dd className="font-bold text-gray-900">Uniswap V3, V2, Aerodrome</dd>
              </div>
              <div className="rounded-xl bg-pink-50 p-3">
                <dt className="text-xs text-gray-500">Networks</dt>
                <dd className="font-bold text-gray-900">{NETWORKS.length}</dd>
              </div>
            </dl>
            <div className="mt-5 flex gap-2">
              <Link
                to="/swap"
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
              >
                Swap
              </Link>
              <Link
                to="/markets"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-purple-300 hover:text-purple-700"
              >
                Markets
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card
            key={title}
            className="group border border-white/70 bg-white/80 shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-500/10"
          >
            <CardContent className="space-y-3 p-6">
              <div className="w-fit rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 p-2.5 shadow-md shadow-purple-500/20">
                <Icon className="size-5 text-white" />
              </div>
              <h3 className="text-base font-bold text-gray-900">{title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* The connected wallet's own activity, once it has some */}
      {showStats && (
        <Card className="border-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg">
          <CardContent className="grid grid-cols-1 gap-6 p-8 text-center sm:grid-cols-3">
            <div>
              <div className="text-3xl font-bold">
                {stats.totalVolumeUsd > 0
                  ? `$${stats.totalVolumeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${stats.totalVolumeEth.toFixed(4)} ETH`}
              </div>
              <div className="text-purple-100">Your trading volume</div>
            </div>
            <Link to="/activity" className="group block">
              <div className="text-3xl font-bold">{stats.totalSwaps}</div>
              <div className="text-purple-100 underline-offset-4 group-hover:underline">
                Your swaps
              </div>
            </Link>
            <div>
              <div className="text-3xl font-bold">{stats.activeChains}</div>
              <div className="text-purple-100">Networks you've used</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
