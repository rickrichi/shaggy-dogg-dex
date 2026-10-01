// src/pages/LaunchpadExplore.tsx
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  ArrowUpRight,
  Check,
  Coins,
  Compass,
  Copy,
  ExternalLink,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAccount, useWalletClient } from "wagmi";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LAUNCHPAD_ARCHETYPES } from "@/lib/launchpad/constants";
import { getStoredLaunchedTokens } from "@/lib/launchpad/storage";

import type { LaunchedTokenRecord } from "@/lib/launchpad/types";

interface LaunchpadExploreProps {
  defaultTab?: "all" | "my-tokens";
}

export default function LaunchpadExplore({ defaultTab }: LaunchpadExploreProps) {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const initialTab = defaultTab || (location.pathname.includes("my-tokens") ? "my-tokens" : "all");
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedArchetype, setSelectedArchetype] = useState<string>("all");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const tokens = useMemo<LaunchedTokenRecord[]>(() => {
    return getStoredLaunchedTokens();
  }, []);

  const handleCopy = (addr: string) => {
    void navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    toast.success("Contract address copied to clipboard!");
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleAddToMetaMask = async (token: LaunchedTokenRecord) => {
    if (!walletClient) {
      toast.error("Please connect your MetaMask or Web3 wallet first.");
      return;
    }

    try {
      await walletClient.watchAsset({
        type: "ERC20",
        params: {
          address: token.tokenAddress,
          symbol: token.tokenSymbol,
          decimals: token.decimals,
        },
      });
      toast.success(`${token.tokenSymbol} added to wallet!`);
    } catch (err) {
      console.error("Failed to add token to wallet:", err);
      toast.error("Could not add token to wallet.");
    }
  };

  // Filter tokens
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      // Tab filter
      if (activeTab === "my-tokens") {
        if (!address) return false;
        if (t.creatorAddress.toLowerCase() !== address.toLowerCase()) return false;
      }

      // Archetype filter
      if (selectedArchetype !== "all" && t.archetype !== selectedArchetype) {
        return false;
      }

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.tokenName.toLowerCase().includes(q) ||
        t.tokenSymbol.toLowerCase().includes(q) ||
        t.tokenAddress.toLowerCase().includes(q)
      );
    });
  }, [tokens, activeTab, address, selectedArchetype, searchQuery]);

  const myTokensCount = useMemo(() => {
    if (!address) return 0;
    return tokens.filter((t) => t.creatorAddress.toLowerCase() === address.toLowerCase()).length;
  }, [tokens, address]);

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      {/* Sub-Navigation Bar */}
      <LaunchpadNav />

      {/* Hero Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
              Ecosystem Token Directory
            </h1>
            <Badge className="border-purple-200 bg-purple-100 text-purple-800">Base Mainnet</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Explore verified cryptocurrencies, isolated lending vaults, and staking protocols
            launched through Shaggy Mutt.
          </p>
        </div>

        <Link to="/launchpad">
          <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 font-bold text-white shadow-md hover:from-purple-700 hover:to-indigo-700">
            <Plus className="mr-1.5 size-4" /> Deploy New Token
          </Button>
        </Link>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Launches</CardTitle>
            <Compass className="size-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{tokens.length} Assets</div>
            <p className="mt-1 text-xs text-slate-500">Verified sovereign & lending protocols</p>
          </CardContent>
        </Card>

        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Your Deployed Tokens
            </CardTitle>
            <Coins className="size-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">
              {isConnected ? `${myTokensCount} Tokens` : "Wallet Not Connected"}
            </div>
            <p className="mt-1 text-xs text-slate-500">Admin-controlled cryptocurrency assets</p>
          </CardContent>
        </Card>

        <Card className="border-purple-100 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Ecosystem Standard</CardTitle>
            <ShieldCheck className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">ERC-4626 & V2</div>
            <p className="mt-1 text-xs text-slate-500">Isolated risk contagion models</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 border border-purple-100 bg-white/70 p-1 shadow-sm">
              <TabsTrigger value="all" className="flex items-center gap-2 font-semibold">
                <Compass className="size-4 text-purple-600" />
                All Launches ({tokens.length})
              </TabsTrigger>
              <TabsTrigger value="my-tokens" className="flex items-center gap-2 font-semibold">
                <Coins className="size-4 text-indigo-600" />
                My Tokens ({myTokensCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search & Archetype Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search name, symbol, address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            <select
              value={selectedArchetype}
              onChange={(e) => setSelectedArchetype(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Archetypes</option>
              {LAUNCHPAD_ARCHETYPES.map((arch) => (
                <option key={arch.id} value={arch.id}>
                  {arch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Token Grid */}
        {filteredTokens.length === 0 ? (
          <Card className="border-dashed border-purple-200 bg-purple-50/20 p-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-purple-100 text-purple-600">
              <Rocket className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-800">
              {activeTab === "my-tokens"
                ? "No Tokens Deployed by Your Wallet Yet"
                : "No Launched Tokens Match Your Search"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {activeTab === "my-tokens"
                ? "Launch your first custom cryptocurrency with instant isolated lending vaults and Uniswap V2 liquidity in just 4 simple steps."
                : "Try clearing your search query or selecting a different archetype."}
            </p>
            {activeTab === "my-tokens" && (
              <div className="mt-6">
                <Link to="/launchpad">
                  <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 font-bold text-white shadow-md">
                    Launch Your First Token <ArrowUpRight className="ml-1.5 size-4" />
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredTokens.map((token) => {
              const archDef = LAUNCHPAD_ARCHETYPES.find((a) => a.id === token.archetype);
              const isMine =
                Boolean(address) && token.creatorAddress.toLowerCase() === address?.toLowerCase();

              return (
                <Card
                  key={token.tokenAddress}
                  className="flex flex-col justify-between border-purple-100 bg-white/90 shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 font-black text-white shadow-sm">
                          {token.tokenSymbol.slice(0, 3)}
                        </div>
                        <div>
                          <CardTitle className="text-lg font-black text-slate-900">
                            {token.tokenName}
                          </CardTitle>
                          <CardDescription className="font-bold text-purple-600">
                            ${token.tokenSymbol}
                          </CardDescription>
                        </div>
                      </div>

                      {isMine && (
                        <Badge className="bg-indigo-100 text-[10px] font-bold text-indigo-800">
                          Yours
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
                      {token.description || "Decentralized token deployed on Base Mainnet."}
                    </p>

                    {/* Archetype & Supply */}
                    <div className="space-y-1.5 rounded-lg border border-purple-50 bg-purple-50/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Archetype</span>
                        <span className="font-bold text-purple-900">
                          {archDef?.name || token.archetype}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Initial Supply</span>
                        <span className="font-bold text-slate-900">
                          {token.initialSupply} {token.tokenSymbol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Decimals</span>
                        <span className="font-bold text-slate-900">{token.decimals}</span>
                      </div>
                    </div>

                    {/* Address with copy */}
                    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                      <span className="truncate font-mono">
                        {token.tokenAddress.slice(0, 10)}...{token.tokenAddress.slice(-8)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(token.tokenAddress)}
                          className="rounded p-1 hover:bg-slate-200"
                          title="Copy Address"
                        >
                          {copiedAddress === token.tokenAddress ? (
                            <Check className="size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="size-3.5 text-slate-500" />
                          )}
                        </button>
                        <a
                          href={`https://basescan.org/address/${token.tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 hover:bg-slate-200"
                          title="View on BaseScan"
                        >
                          <ExternalLink className="size-3.5 text-slate-500" />
                        </a>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <Link to={`/swap?outputCurrency=${token.tokenAddress}`}>
                          <Button
                            size="sm"
                            variant="default"
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-xs font-bold text-white hover:from-purple-700 hover:to-indigo-700"
                          >
                            Trade Swap <TrendingUp className="ml-1 size-3" />
                          </Button>
                        </Link>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleAddToMetaMask(token)}
                          className="w-full border-purple-200 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                        >
                          <Wallet className="mr-1 size-3" /> Add Wallet
                        </Button>
                      </div>

                      {token.stakingAddress && (
                        <Link to="/stake">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-xs text-slate-600 hover:bg-purple-50 hover:text-purple-700"
                          >
                            <ShieldCheck className="mr-1 size-3 text-pink-600" /> VIP Staking Vault
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
