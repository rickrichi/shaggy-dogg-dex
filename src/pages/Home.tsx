// src/pages/Home.tsx
import { Link } from "react-router-dom";

import { ArrowLeftRight, Shield, TrendingUp, Zap } from "lucide-react";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_CHAINS } from "@/lib/config";

export default function Home() {
  const { isConnected } = useAccount();

  const features = [
    {
      icon: ArrowLeftRight,
      title: "Multi-Chain Swaps",
      description: "Trade across Ethereum, Base, Arbitrum, Optimism, and Polygon",
    },
    {
      icon: Shield,
      title: "Secure Trading",
      description: "Non-custodial with MetaMask integration and smart contract security",
    },
    {
      icon: Zap,
      title: "Best Prices",
      description: "Powered by 0x Protocol for optimal routing and minimal slippage",
    },
    {
      icon: TrendingUp,
      title: "Portfolio Tracking",
      description: "Monitor your holdings and trading history across all chains",
    },
  ];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="space-y-6 text-center">
        <div className="space-y-4">
          <h1 className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-5xl font-bold text-transparent">
            Welcome to Shaggy Mutt DEX
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            The most adorable multi-chain DEX for swapping tokens across major EVM networks
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {SUPPORTED_CHAINS.map((chain) => (
            <Badge key={chain} variant="secondary" className="capitalize">
              {chain}
            </Badge>
          ))}
        </div>

        {!isConnected && (
          <div className="pt-4">
            <p className="mb-4 text-gray-600">Connect your MetaMask wallet to get started</p>
          </div>
        )}

        {isConnected && (
          <Link to="/swap">
            <Button
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-pink-600 px-8 font-medium text-white hover:from-purple-700 hover:to-pink-700"
            >
              Start Trading
              <ArrowLeftRight className="ml-2 size-5" />
            </Button>
          </Link>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Card
              key={index}
              className="border-2 border-purple-100 bg-white/80 backdrop-blur-sm transition-colors hover:border-purple-200"
            >
              <CardHeader className="pb-3 text-center">
                <div className="mx-auto w-fit rounded-full bg-gradient-to-r from-purple-100 to-pink-100 p-3">
                  <Icon className="size-6 text-purple-600" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-gray-600">{feature.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stats Section */}
      <Card className="border-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 gap-8 text-center md:grid-cols-3">
            <div>
              <div className="text-3xl font-bold">$0</div>
              <div className="text-purple-100">Total Volume</div>
            </div>
            <div>
              <div className="text-3xl font-bold">0</div>
              <div className="text-purple-100">Total Swaps</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{SUPPORTED_CHAINS.length}</div>
              <div className="text-purple-100">Supported Chains</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
