// src/pages/Launchpad.tsx
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  ArrowRight,
  CheckCircle2,
  Coins,
  ExternalLink,
  Layers,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Vault,
} from "lucide-react";
import { toast } from "sonner";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEX_VENUES, LAUNCHPAD_ARCHETYPES } from "@/lib/launchpad/constants";
import { executeLaunchpadDeployment } from "@/lib/launchpad/deployEngine";
import { saveLaunchedToken } from "@/lib/launchpad/storage";

import type { DeployedEcosystemResult, LaunchpadFormState } from "@/lib/launchpad/types";

export default function Launchpad() {
  const { address, isConnected, chainId, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const [activeTab, setActiveTab] = useState<string>("identity");
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploymentLog, setDeploymentLog] = useState<string[]>([]);
  const [deployedResult, setDeployedResult] = useState<DeployedEcosystemResult | null>(null);

  const [form, setForm] = useState<LaunchpadFormState>({
    tokenName: "Astro Mutt",
    tokenSymbol: "AMUTT",
    decimals: 18,
    initialSupply: "1000000",
    description:
      "Community-driven utility and isolated lending asset for the Shaggy Mutt DeFi ecosystem on Base.",
    selectedArchetype: "morpho_blue_isolated",
    performanceFeeBps: 1000, // 10%
    stakingLockDays: 7,
    earlyUnstakeFeeBps: 100, // 1%
    enableDexSeeding: true,
    selectedDex: "uniswap_v2",
    pairAsset: "ETH",
    initialEthLiquidity: "0.0005",
    initialTokenLiquidityPercent: 50,
    executionMode: "metamask",
    recipientAdminAddress: "",
  });

  const selectedArchetypeDef =
    LAUNCHPAD_ARCHETYPES.find((a) => a.id === form.selectedArchetype) ?? LAUNCHPAD_ARCHETYPES[0]!;
  const selectedDexDef = DEX_VENUES.find((d) => d.id === form.selectedDex) ?? DEX_VENUES[0]!;

  const handleLaunch = async () => {
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (chainId !== 8453) {
      toast.error("Please switch to Base Mainnet before launching.");
      return;
    }
    if (!walletClient || !publicClient) {
      toast.error("Wallet client unavailable. Reconnect MetaMask.");
      return;
    }
    if (!form.tokenName.trim() || !form.tokenSymbol.trim() || !form.initialSupply.trim()) {
      toast.error("Please provide valid token identity fields.");
      return;
    }

    try {
      setIsDeploying(true);
      setDeploymentLog([]);
      setDeployedResult(null);

      const addLog = (msg: string) => {
        setDeploymentLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
      };

      addLog(`Initiating deployment for ${form.tokenName} (${form.tokenSymbol})...`);
      addLog(`Selected Archetype: ${selectedArchetypeDef.name}`);
      addLog(`Risk Isolation Model: ${selectedArchetypeDef.riskContagionModel}`);

      const result = await executeLaunchpadDeployment(
        walletClient,
        publicClient,
        {
          ...form,
          recipientAdminAddress: form.recipientAdminAddress.trim() || address,
        },
        address
      );

      addLog(`Token successfully deployed at ${result.tokenAddress}`);
      if (result.stakingAddress) addLog(`Staking vault deployed at ${result.stakingAddress}`);
      if (result.vaultAddress) addLog(`Lending vault deployed at ${result.vaultAddress}`);
      if (form.enableDexSeeding) addLog(`Liquidity seeded on ${selectedDexDef.name}!`);

      setDeployedResult(result);
      saveLaunchedToken({
        tokenAddress: result.tokenAddress,
        tokenName: form.tokenName,
        tokenSymbol: form.tokenSymbol,
        decimals: form.decimals || 18,
        initialSupply: form.initialSupply,
        description: form.description,
        archetype: form.selectedArchetype,
        stakingAddress: result.stakingAddress,
        vaultAddress: result.vaultAddress,
        pairAddress: result.pairAddress,
        creatorAddress: address,
        chainId: chainId || 8453,
        deployedAt: Date.now(),
        txHash: result.txHash,
      });
      toast.success("Ecosystem deployed successfully on Base Mainnet!");
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Deployment failed";
      toast.error(msg);
      setDeploymentLog((prev) => [...prev, `[ERROR] ${msg}`]);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Sub-Navigation Bar */}
      <LaunchpadNav />

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex items-center space-x-2">
            <Badge className="border-purple-400/40 bg-purple-500/30 text-purple-200">
              <Sparkles className="mr-1 size-3 text-purple-300" />
              Base Mainnet Protocol Studio
            </Badge>
            <Badge className="border-blue-400/40 bg-blue-500/30 text-blue-200">
              ERC-4626 & Isolated Risk Ready
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Shaggy Mutt Token & Protocol Launchpad
          </h1>
          <p className="text-sm leading-relaxed text-purple-100/90 sm:text-base">
            Create, deploy, and seed liquidity for sovereign tokens, staking ecosystems, and
            next-generation isolated money markets (Morpho Blue, Moonwell, Silo, Aave v3) on Base in
            one unified pipeline.
          </p>
        </div>
      </div>

      {/* Network Warning if not on Base */}
      {isConnected && chainId !== 8453 && (
        <Alert className="border-blue-300 bg-blue-50 text-blue-950">
          <AlertTitle className="font-semibold">Switch to Base Mainnet Required</AlertTitle>
          <AlertDescription className="mt-2 flex items-center justify-between">
            <span>
              You are connected to {chain?.name || `Chain ${chainId}`}. The Launchpad Studio
              operates live on Base.
            </span>
            <Button
              size="sm"
              onClick={() => switchChain({ chainId: 8453 })}
              disabled={isSwitchingChain}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSwitchingChain ? "Switching..." : "Switch to Base"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Managing Deployed Protocol Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Managing a Live Ecosystem?</p>
            <p className="text-xs text-gray-600">
              Access contracts, VIP staking tiers, LP pools, and 1-click token import in the
              dedicated Protocol Hub.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/stake">
            <Button
              size="sm"
              variant="outline"
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              Stake & VIP Tiers
            </Button>
          </Link>
          <Link to="/protocol">
            <Button
              size="sm"
              className="bg-indigo-600 font-semibold text-white hover:bg-indigo-700"
            >
              Open Protocol Hub <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Studio Pipeline */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 border border-purple-100 bg-white/70 p-1 shadow-sm backdrop-blur">
          <TabsTrigger value="identity" className="flex items-center gap-2">
            <Coins className="size-4 text-purple-600" />
            <span className="font-semibold">1. Token Identity</span>
          </TabsTrigger>
          <TabsTrigger value="archetype" className="flex items-center gap-2">
            <Layers className="size-4 text-indigo-600" />
            <span className="font-semibold">2. Purpose & Lending</span>
          </TabsTrigger>
          <TabsTrigger value="liquidity" className="flex items-center gap-2">
            <Rocket className="size-4 text-blue-600" />
            <span className="font-semibold">3. Multi-DEX Seeder</span>
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span className="font-semibold">4. Review & Deploy</span>
          </TabsTrigger>
        </TabsList>

        {/* ── STEP 1: TOKEN IDENTITY ── */}
        <TabsContent value="identity" className="space-y-4">
          <Card className="border-purple-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                <Coins className="size-5 text-purple-600" />
                Token Core Identity & Supply
              </CardTitle>
              <CardDescription>
                Define the name, ticker symbol, and hard-capped total supply for your new
                cryptocurrency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tokenName">Token Name</Label>
                  <Input
                    id="tokenName"
                    placeholder="e.g. Astro Mutt"
                    value={form.tokenName}
                    onChange={(e) => setForm({ ...form, tokenName: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    The public descriptive name of your token.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tokenSymbol">Token Symbol (Ticker)</Label>
                  <Input
                    id="tokenSymbol"
                    placeholder="e.g. AMUTT"
                    value={form.tokenSymbol}
                    onChange={(e) =>
                      setForm({ ...form, tokenSymbol: e.target.value.toUpperCase() })
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Short 2–6 character uppercase exchange ticker.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="initialSupply">Total Hard-Capped Supply</Label>
                  <Input
                    id="initialSupply"
                    type="number"
                    placeholder="e.g. 1000000"
                    value={form.initialSupply}
                    onChange={(e) => setForm({ ...form, initialSupply: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    100% of this supply will be minted on deployment.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="decimals">Decimals</Label>
                  <Input id="decimals" value={form.decimals} disabled className="bg-gray-100" />
                  <p className="text-xs text-gray-500">
                    Standard 18 decimals for EVM and DEX compatibility.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Token Purpose & Mission</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Describe what your token is designed for (e.g. DAO governance, staking discounts, isolated lending)..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setActiveTab("archetype")}
                  className="bg-purple-600 text-white hover:bg-purple-700"
                >
                  Continue to Purpose & Lending <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── STEP 2: PURPOSE & LENDING ARCHETYPE ── */}
        <TabsContent value="archetype" className="space-y-4">
          <Card className="border-indigo-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                <Layers className="size-5 text-indigo-600" />
                Select Protocol Purpose & DeFi Money Market Archetype
              </CardTitle>
              <CardDescription>
                Choose the smart contract architecture for your token. From standalone governance to
                next-gen isolated risk lending (Morpho Blue, Moonwell, Silo).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {LAUNCHPAD_ARCHETYPES.map((arch) => {
                  const isSelected = form.selectedArchetype === arch.id;
                  return (
                    <button
                      type="button"
                      key={arch.id}
                      onClick={() => setForm({ ...form, selectedArchetype: arch.id })}
                      className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-500/20"
                          : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant={isSelected ? "default" : "secondary"} className="mb-2">
                            {arch.badge}
                          </Badge>
                          <h4 className="font-bold text-gray-900">{arch.name}</h4>
                        </div>
                        {isSelected && <CheckCircle2 className="size-5 text-indigo-600" />}
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-gray-600">
                        {arch.description}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
                        <span className="font-medium text-indigo-700">
                          Risk Model: <strong>{arch.riskContagionModel}</strong>
                        </span>
                        <span className="text-gray-400">{arch.contractsDeployed.join(" + ")}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Archetype Customization Details */}
              <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-5">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
                  <Vault className="size-4 text-indigo-600" />
                  Parameters for {selectedArchetypeDef.name}
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Staking Lock Duration</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={form.stakingLockDays}
                        onChange={(e) =>
                          setForm({ ...form, stakingLockDays: Number(e.target.value) })
                        }
                        className="bg-white"
                      />
                      <span className="text-xs text-gray-500">days</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Early Exit Penalty</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={form.earlyUnstakeFeeBps / 100}
                        onChange={(e) =>
                          setForm({ ...form, earlyUnstakeFeeBps: Number(e.target.value) * 100 })
                        }
                        className="bg-white"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Vault Performance Fee</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={form.performanceFeeBps / 100}
                        onChange={(e) =>
                          setForm({ ...form, performanceFeeBps: Number(e.target.value) * 100 })
                        }
                        className="bg-white"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setActiveTab("identity")}>
                  Back
                </Button>
                <Button
                  onClick={() => setActiveTab("liquidity")}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Continue to DEX Seeder <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── STEP 3: MULTI-DEX LIQUIDITY SEEDER ── */}
        <TabsContent value="liquidity" className="space-y-4">
          <Card className="border-blue-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                <Rocket className="size-5 text-blue-600" />
                Multi-DEX Automated Liquidity Seeder
              </CardTitle>
              <CardDescription>
                Optionally seed public trading liquidity on Base DEXs (Uniswap V2, PancakeSwap V2,
                Aerodrome) right as the token is created.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Enable Automated Liquidity Seeding
                  </h4>
                  <p className="text-xs text-gray-600">
                    Immediately pair your new token with ETH and mint 100% of the initial LP tokens
                    into your wallet.
                  </p>
                </div>
                <Switch
                  checked={form.enableDexSeeding}
                  onCheckedChange={(checked) => setForm({ ...form, enableDexSeeding: checked })}
                />
              </div>

              {form.enableDexSeeding && (
                <div className="space-y-5 rounded-xl border border-gray-200 p-5">
                  <div className="space-y-2">
                    <Label>Select DEX Venue on Base</Label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {DEX_VENUES.map((venue) => {
                        const isSelected = form.selectedDex === venue.id;
                        return (
                          <button
                            type="button"
                            key={venue.id}
                            onClick={() => setForm({ ...form, selectedDex: venue.id })}
                            className={`rounded-lg border p-3 text-left transition-all ${
                              isSelected
                                ? "border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20"
                                : "border-gray-200 hover:border-blue-200"
                            }`}
                          >
                            <p className="text-xs font-bold text-gray-900">{venue.name}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] text-gray-500">
                              {venue.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ethLiquidity">Initial ETH Deposit</Label>
                      <Input
                        id="ethLiquidity"
                        placeholder="e.g. 0.0005"
                        value={form.initialEthLiquidity}
                        onChange={(e) => setForm({ ...form, initialEthLiquidity: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">Amount of ETH to seed into the pool.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tokenPercent">% of Total Supply to Seed</Label>
                      <Input
                        id="tokenPercent"
                        type="number"
                        min="1"
                        max="100"
                        value={form.initialTokenLiquidityPercent}
                        onChange={(e) =>
                          setForm({ ...form, initialTokenLiquidityPercent: Number(e.target.value) })
                        }
                      />
                      <p className="text-xs text-gray-500">
                        Deposits{" "}
                        {(
                          (Number(form.initialSupply || 0) * form.initialTokenLiquidityPercent) /
                          100
                        ).toLocaleString()}{" "}
                        {form.tokenSymbol || "tokens"} into the pool.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setActiveTab("archetype")}>
                  Back
                </Button>
                <Button
                  onClick={() => setActiveTab("review")}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  Continue to Review & Deploy <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── STEP 4: REVIEW & DEPLOY ── */}
        <TabsContent value="review" className="space-y-4">
          <Card className="border-emerald-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
                <ShieldCheck className="size-5 text-emerald-600" />
                Review & Launch Ecosystem
              </CardTitle>
              <CardDescription>
                Confirm your protocol specifications before executing deployment on Base Mainnet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary Matrix */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Token Specification
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p className="flex justify-between">
                      <span className="text-gray-500">Name & Symbol:</span>
                      <strong className="text-gray-900">
                        {form.tokenName} ({form.tokenSymbol})
                      </strong>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-500">Total Supply:</span>
                      <strong className="text-gray-900">
                        {Number(form.initialSupply).toLocaleString()}
                      </strong>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-500">Decimals:</span>
                      <strong className="text-gray-900">{form.decimals}</strong>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-500">Network:</span>
                      <strong className="font-semibold text-blue-600">Base Mainnet (8453)</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    DeFi & DEX Configuration
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p className="flex justify-between">
                      <span className="text-gray-500">Archetype:</span>
                      <strong className="text-indigo-600">{selectedArchetypeDef.name}</strong>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-500">Risk Model:</span>
                      <strong className="text-gray-900">
                        {selectedArchetypeDef.riskContagionModel}
                      </strong>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-500">DEX Seeding:</span>
                      <strong className="text-gray-900">
                        {form.enableDexSeeding
                          ? `${selectedDexDef.name} (${form.initialEthLiquidity} ETH)`
                          : "Disabled"}
                      </strong>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-500">Root Admin:</span>
                      <strong className="font-mono text-xs text-gray-900">
                        {(form.recipientAdminAddress || address || "Connected Wallet").slice(0, 8)}
                        ...
                      </strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Recipient Address Override */}
              <div className="space-y-2">
                <Label htmlFor="recipient">
                  Root Admin & Initial Supply Recipient Address (Optional)
                </Label>
                <Input
                  id="recipient"
                  placeholder={address || "0x..."}
                  value={form.recipientAdminAddress}
                  onChange={(e) => setForm({ ...form, recipientAdminAddress: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  Leave empty to default to your currently connected MetaMask wallet.
                </p>
              </div>

              {/* Launch Action */}
              <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-4 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setActiveTab("liquidity")}
                  disabled={isDeploying}
                >
                  Back
                </Button>
                <Button
                  onClick={handleLaunch}
                  disabled={isDeploying || !isConnected || chainId !== 8453}
                  className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 px-8 font-bold text-white shadow-lg hover:from-purple-700 hover:to-blue-700 sm:w-auto"
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Deploying Ecosystem to Base...
                    </>
                  ) : (
                    <>
                      <Rocket className="mr-2 size-4" />
                      Launch Token Ecosystem Now
                    </>
                  )}
                </Button>
              </div>

              {/* Real-Time Deployment Log */}
              {deploymentLog.length > 0 && (
                <div className="space-y-1 rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs text-green-400">
                  <p className="mb-2 flex items-center gap-2 font-semibold text-gray-400">
                    <Loader2 className={`size-3 ${isDeploying ? "animate-spin" : "hidden"}`} />
                    Live Deployment Console:
                  </p>
                  {deploymentLog.map((log, i) => (
                    <p key={i}>{log}</p>
                  ))}
                </div>
              )}

              {/* Deployed Result View */}
              {deployedResult && (
                <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <AlertTitle className="text-lg font-bold text-emerald-900">
                    Ecosystem Successfully Live on Base Mainnet!
                  </AlertTitle>
                  <AlertDescription className="mt-3 space-y-2 text-xs">
                    <p>
                      <strong>Token Address:</strong>{" "}
                      <a
                        href={`https://basescan.org/address/${deployedResult.tokenAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-emerald-700 underline"
                      >
                        {deployedResult.tokenAddress}
                      </a>
                    </p>
                    {deployedResult.vaultAddress && (
                      <p>
                        <strong>Lending Vault:</strong>{" "}
                        <a
                          href={`https://basescan.org/address/${deployedResult.vaultAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-emerald-700 underline"
                        >
                          {deployedResult.vaultAddress}
                        </a>
                      </p>
                    )}
                    {deployedResult.stakingAddress && (
                      <p>
                        <strong>Staking Contract:</strong>{" "}
                        <a
                          href={`https://basescan.org/address/${deployedResult.stakingAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-emerald-700 underline"
                        >
                          {deployedResult.stakingAddress}
                        </a>
                      </p>
                    )}
                    <div className="flex gap-3 pt-3">
                      <Link to={`/swap?input=ETH&output=${deployedResult.tokenAddress}`}>
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          Trade on DEX Swap <ExternalLink className="ml-1 size-3" />
                        </Button>
                      </Link>
                      <Link to="/liquidity">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-400 text-emerald-900"
                        >
                          Manage Liquidity
                        </Button>
                      </Link>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
