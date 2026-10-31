import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Info,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { Address } from "viem";
import type { PoolPlannerConfig } from "@/config/dex-venues";

const FEE_TIERS = [
  { value: 100, label: "0.01%", note: "Stable pairs" },
  { value: 500, label: "0.05%", note: "Tight spreads" },
  { value: 2500, label: "0.25%", note: "Volatile pairs" },
  { value: 10000, label: "1%", note: "High volatility" },
] as const;

const RANGE_PLANS = [
  {
    value: "wide",
    label: "Wide",
    note: "More room for price movement; lower capital efficiency.",
  },
  {
    value: "full",
    label: "Full range",
    note: "Always in range, with the least concentrated fee exposure.",
  },
  {
    value: "concentrated",
    label: "Concentrated / custom",
    note: "More capital efficient, but easier to move out of range.",
  },
] as const;

const parsePositiveAmount = (value: string) => {
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
};

const formatPrice = (value: number) =>
  new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 8,
    notation: value >= 1e9 || value < 1e-6 ? "scientific" : "standard",
  }).format(value);

interface DexPoolPlannerProps {
  planner: PoolPlannerConfig;
  tokenKey: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: Address;
  quoteSymbol: string;
  native?: boolean;
  poolExists: boolean;
  poolActive?: boolean;
}

export function DexPoolPlanner({
  planner,
  tokenKey,
  tokenName,
  tokenSymbol,
  tokenAddress,
  quoteSymbol,
  native = false,
  poolExists,
  poolActive = poolExists,
}: DexPoolPlannerProps) {
  const isV2 = planner.protocol === "v2";
  const { dexName } = planner;
  const [feeTier, setFeeTier] = useState(2500);
  const [tokenAmount, setTokenAmount] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [rangePlan, setRangePlan] = useState("wide");
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [riskConfirmed, setRiskConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFeeTier(2500);
    setTokenAmount("");
    setQuoteAmount("");
    setRangePlan("wide");
    setPriceConfirmed(false);
    setRiskConfirmed(false);
    setCopied(false);
  }, [planner.name, tokenKey]);

  const tokenValue = parsePositiveAmount(tokenAmount);
  const quoteValue = parsePositiveAmount(quoteAmount);
  const prices = useMemo(() => {
    if (!tokenValue || !quoteValue) return undefined;
    return {
      direct: quoteValue / tokenValue,
      reciprocal: tokenValue / quoteValue,
    };
  }, [quoteValue, tokenValue]);
  const amountsReady = Boolean(prices);
  const risksReady = priceConfirmed && riskConfirmed;
  const ready = amountsReady && risksReady;
  const protocolLabel = planner.name;
  const heading = poolExists
    ? `Add ${protocolLabel} liquidity`
    : `Create a ${protocolLabel} pool`;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-labelledby="pool-planner-planner-heading"
      className="border border-cyan-200 bg-white shadow-sm dark:border-cyan-950 dark:bg-slate-950"
    >
      <header className="border-b border-slate-200 p-5 dark:border-slate-800 md:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200">
                {protocolLabel} · Base
              </Badge>
              <Badge variant="outline">Preparation only</Badge>
            </div>
            <h2 id="pool-planner-planner-heading" className="text-xl font-black">
              {heading}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Plan the pair here, then review and submit the transaction on
              {dexName}. This page never requests token approval or creates a
              pool.
            </p>
          </div>
          <div className="shrink-0 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100">
            {tokenSymbol}/{quoteSymbol}
          </div>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-7 p-5 md:p-6">
          <section aria-labelledby="pool-planner-assets-heading">
            <h3
              id="pool-planner-assets-heading"
              className="text-xs font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300"
            >
              01 · Assets
            </h3>
            <div className="mt-3 flex flex-col justify-between gap-3 border-y border-slate-200 py-3 sm:flex-row sm:items-center dark:border-slate-800">
              <div className="min-w-0">
                <p className="font-black">
                  {tokenName} <span className="text-slate-500">({tokenSymbol})</span>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">
                  {tokenAddress}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copyAddress}>
                {copied ? <Check className="mr-2 size-3" /> : <Copy className="mr-2 size-3" />}
                {copied ? "Copied" : "Copy address"}
              </Button>
            </div>
            {native && (
              <p className="mt-3 flex gap-2 text-xs text-amber-800 dark:text-amber-300">
                <Info className="mt-0.5 size-4 shrink-0" />
                Native ETH is paired as WETH. {dexName} may ask you to wrap ETH
                during the liquidity flow.
              </p>
            )}
          </section>

          {isV2 ? (
            <section aria-labelledby="pool-planner-v2-structure-heading">
              <h3
                id="pool-planner-v2-structure-heading"
                className="text-xs font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300"
              >
                02 · Constant product V2
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-900 dark:bg-cyan-950/40">
                  <p className="text-sm font-black text-cyan-950 dark:text-cyan-100">
                    Standard {planner.swapFee} swap fee
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Fixed V2 pair model; no fee-tier selection is required.
                  </p>
                </div>
                <div className="border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm font-black">
                    Full-range x·y = k curve
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Liquidity stays active across all prices and mints fungible LP tokens.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <fieldset>
              <legend className="text-xs font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300">
                02 · Fee tier
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FEE_TIERS.map((tier) => (
                  <button
                    key={tier.value}
                    type="button"
                    aria-pressed={feeTier === tier.value}
                    onClick={() => setFeeTier(tier.value)}
                    className={cn(
                      "border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
                      feeTier === tier.value
                        ? "border-cyan-600 bg-cyan-50 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-100"
                        : "border-slate-200 hover:border-cyan-300 dark:border-slate-700",
                    )}
                  >
                    <span className="block text-base font-black">{tier.label}</span>
                    <span className="text-[11px] text-slate-500">{tier.note}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                0.25% is a common starting point for volatile pairs, not personalized advice.
              </p>
            </fieldset>
          )}

          <section aria-labelledby="pool-planner-deposit-heading">
            <h3
              id="pool-planner-deposit-heading"
              className="text-xs font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300"
            >
              03 · Deposit plan
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">
                {tokenSymbol} amount
                <Input
                  className="mt-2"
                  inputMode="decimal"
                  value={tokenAmount}
                  onChange={(event) => setTokenAmount(event.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(tokenAmount) && !tokenValue}
                />
              </label>
              <label className="text-sm font-bold">
                {quoteSymbol} amount
                <Input
                  className="mt-2"
                  inputMode="decimal"
                  value={quoteAmount}
                  onChange={(event) => setQuoteAmount(event.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(quoteAmount) && !quoteValue}
                />
              </label>
            </div>
            {prices ? (
              <div role="status" className="mt-3 border-l-2 border-cyan-500 bg-cyan-50 p-3 text-sm dark:bg-cyan-950/50">
                <p className="font-black">Implied price</p>
                <p className="mt-1 text-slate-700 dark:text-slate-200">
                  1 {tokenSymbol} = {formatPrice(prices.direct)} {quoteSymbol}
                  <span className="mx-2 text-slate-400">·</span>
                  1 {quoteSymbol} = {formatPrice(prices.reciprocal)} {tokenSymbol}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Enter two positive amounts to preview the implied ratio. No USD value or slippage estimate is calculated here.
              </p>
            )}
            {isV2 && poolExists && (
              <p className="mt-3 flex gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                <Info className="mt-0.5 size-4 shrink-0" />
                {poolActive
                  ? `This pair already holds reserves, so the pool ratio decides your deposit. ${dexName} matches your second amount to it, and the amounts above do not change the price.`
                  : "This pair exists, but active reserves were not confirmed. If it is empty, your first deposit sets the price."}
              </p>
            )}
          </section>

          {!isV2 && (
            <fieldset>
              <legend className="text-xs font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300">
                04 · Range plan
              </legend>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {RANGE_PLANS.map((plan) => (
                  <label
                    key={plan.value}
                    className={cn(
                      "cursor-pointer border p-3 focus-within:ring-2 focus-within:ring-cyan-500",
                      rangePlan === plan.value
                        ? "border-cyan-600 bg-cyan-50 dark:bg-cyan-950/50"
                        : "border-slate-200 dark:border-slate-700",
                    )}
                  >
                    <span className="flex items-center gap-2 font-black">
                      <input
                        type="radio"
                        name="pool-planner-range"
                        value={plan.value}
                        checked={rangePlan === plan.value}
                        onChange={() => setRangePlan(plan.value)}
                        className="accent-cyan-600"
                      />
                      {plan.label}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-slate-500">{plan.note}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Choose exact bounds in {dexName}. This planner does not fabricate ticks or price limits.
              </p>
            </fieldset>
          )}

          <section aria-labelledby="pool-planner-risks-heading">
            <h3
              id="pool-planner-risks-heading"
              className="text-xs font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300"
            >
              {isV2 ? "04 · Confirm risks" : "05 · Confirm risks"}
            </h3>
            <div className="mt-3 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 border border-slate-200 p-3 text-sm dark:border-slate-700">
                <Checkbox
                  className="mt-0.5"
                  checked={priceConfirmed}
                  onCheckedChange={(checked) => setPriceConfirmed(checked === true)}
                />
                <span>
                  {poolExists
                    ? "I will verify the pool price and my deposit ratio before submitting."
                    : "I understand the first liquidity position initializes the pool price, and I will verify the ratio independently."}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border border-slate-200 p-3 text-sm dark:border-slate-700">
                <Checkbox
                  className="mt-0.5"
                  checked={riskConfirmed}
                  onCheckedChange={(checked) => setRiskConfirmed(checked === true)}
                />
                <span>
                  {isV2
                    ? "I understand constant-product V2 liquidity mints fungible LP tokens across the full price range and is exposed to impermanent loss."
                    : "I understand concentrated liquidity can move out of range and is exposed to impermanent loss."}
                </span>
              </label>
            </div>
            <div className="mt-3 flex gap-2 border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              {poolExists ? "Adding liquidity" : "Pool creation"} earns trading fees only unless {planner.rewardsCondition} independently verified.
            </div>
          </section>
        </div>

        <aside className="border-t border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70 lg:border-l lg:border-t-0 md:p-6">
          <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">
            Handoff checklist
          </p>
          <ol className="mt-4 space-y-3 text-sm">
            {(isV2
              ? [
                  "Select Base network.",
                  `Import ${tokenSymbol} using the copied contract address.`,
                  "Select the V2 liquidity option for this pair.",
                  poolExists && poolActive
                    ? `Enter one amount and let ${dexName} match the pool ratio.`
                    : "Enter the same equal-value amounts.",
                  "Review LP token output and pool share before approving the wallet transaction.",
                ]
              : [
                  "Select Base network.",
                  `Import ${tokenSymbol} using the copied contract address.`,
                  `Choose the matching ${FEE_TIERS.find((tier) => tier.value === feeTier)?.label} fee tier.`,
                  "Enter the same amounts and choose your range.",
                  "Review every value before approving the wallet transaction.",
                ]
            ).map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="font-mono text-xs font-black text-cyan-700 dark:text-cyan-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <footer className="border-t border-slate-200 p-5 dark:border-slate-800 md:p-6">
        <div aria-label="Readiness" className="grid border border-slate-200 text-xs font-bold sm:grid-cols-3 dark:border-slate-700">
          {[
            [amountsReady, "Set amounts"],
            [risksReady, "Confirm risks"],
            [ready, `Ready for ${dexName}`],
          ].map(([complete, text], index) => (
            <div
              key={String(text)}
              className={cn(
                "flex items-center gap-2 border-t px-3 py-2 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0",
                complete
                  ? "border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100"
                  : "border-slate-200 text-slate-500 dark:border-slate-700",
              )}
            >
              <span className={cn("flex size-5 items-center justify-center border", complete ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300") }>
                {complete ? <Check className="size-3" /> : index + 1}
              </span>
              {String(text)}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            You will leave this app and review the transaction on {dexName}.
          </p>
          {ready ? (
            <Button asChild className="bg-cyan-700 text-white hover:bg-cyan-800">
              <a href={planner.liquidityUrl} target="_blank" rel="noopener noreferrer">
                Continue on {dexName}
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          ) : (
            <Button disabled>
              Continue on {dexName}
              <ExternalLink className="ml-2 size-4" />
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}

