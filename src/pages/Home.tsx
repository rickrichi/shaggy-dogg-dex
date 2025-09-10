// src/pages/Home.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Shield, Zap, TrendingUp } from 'lucide-react';
import { SUPPORTED_CHAINS } from '@/lib/config';
import { useAccount } from 'wagmi';

export default function Home() {
  const { isConnected } = useAccount();

  const features = [
    {
      icon: ArrowLeftRight,
      title: 'Multi-Chain Swaps',
      description: 'Trade across Ethereum, Base, Arbitrum, Optimism, and Polygon',
    },
    {
      icon: Shield,
      title: 'Secure Trading',
      description: 'Non-custodial with MetaMask integration and smart contract security',
    },
    {
      icon: Zap,
      title: 'Best Prices',
      description: 'Powered by 0x Protocol for optimal routing and minimal slippage',
    },
    {
      icon: TrendingUp,
      title: 'Portfolio Tracking',
      description: 'Monitor your holdings and trading history across all chains',
    },
  ];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
            Welcome to Shaggy Mutt DEX
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
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
            <p className="text-gray-600 mb-4">Connect your MetaMask wallet to get started</p>
          </div>
        )}

        {isConnected && (
          <Link to="/swap">
            <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium px-8">
              Start Trading
              <ArrowLeftRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Card key={index} className="border-2 border-purple-100 hover:border-purple-200 transition-colors bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-3">
                <div className="mx-auto rounded-full bg-gradient-to-r from-purple-100 to-pink-100 p-3 w-fit">
                  <Icon className="h-6 w-6 text-purple-600" />
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
      <Card className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
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