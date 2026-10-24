#!/usr/bin/env tsx
/**
 * MuttChow ($MCHOW) economic model, v0.2 — decision report for whitepaper v2.0 §16.
 *
 *   npx tsx scripts/mchow-model/model-v0.2.ts       → writes docs/MCHOW-ECONOMIC-MODEL-v0.2.md
 *
 * Changes from v0.1: launch gates on average EXECUTION price impact (both directions, at stressed
 * prices, through the program); demand ranges and outside-LP counts from the advisory review;
 * gross volume separated from net flow; unlocked-but-unsold supply overhang with a sell
 * propensity; asymmetric LP entry/exit; Uniswap protocol fee on LP income; restructured tokenomics
 * experiments; a minimum-WETH search per configuration; one-at-a-time sensitivity.
 *
 * Every behavioural number is an ASSUMPTION (see ASSUMPTIONS, SCENARIOS, EXPERIMENTS). Pool maths
 * is exact for Uniswap V3 within a range. This is not a forecast.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ───────────────────────────── facts ─────────────────────────────
const TOTAL_SUPPLY = 1_000_000_000_000;
const ETH_USD = 2_380; // held constant; MCHOW price is the variable
const LP_FEE_SHARE = 5 / 6; // Base V3 0.30% and 1% pools read on-chain 2026-10-23: feeProtocol 1/6
const STAKER_MAX_MONTHS = 24; // UniswapV3Staker on Base: maxIncentiveDuration = 2 years

// ───────────────────────────── gates (advisory review) ─────────────────────────────
const GATE_TRADE_USD = 1_000;
const GATE_MAX_IMPACT = 0.05; // hard: ≤ 5% average execution impact, fee excluded
const TARGET_MAX_IMPACT = 0.02; // preferred
const SHARE_GATE_M3 = 0.25; // independent LP value share by day 90
const SHARE_TARGET_M6 = 0.4; // by day 180

// ───────────────────────────── assumptions ─────────────────────────────
const ASSUMPTIONS = {
  avgLpPositionUsd: 1_500, // converts outside-LP counts into a capital ceiling
  rangeWidth: 0.5, // community positions ±50%, re-centred monthly
  inRangeShare: 0.75,
  entrySpeed: 0.4, // share of the gap to equilibrium LP capital closed per month when entering
  exitSpeed: 0.7, // … and when leaving (exits are faster)
  startCommunityUsd: 300,
  monthsAfterProgram: 6,
  feeVolumeFactor: { 0.003: 1, 0.01: 0.5 } as Record<number, number>,
  rewardRealisation: 0.75, // realisable value of claimed rewards vs spot (selling moves the price)
};

interface Scenario {
  readonly name: string;
  readonly volumeUsd: number; // gross monthly volume (midpoint of the review's range), flat
  readonly volumeRange: readonly [number, number];
  readonly outsideLps: number; // midpoint of the review's 90-day range
  readonly outsideLpRange: readonly [number, number];
  readonly netFlowShare: number; // organic net buying as a share of gross volume (− = net selling)
  readonly hurdleApy: number;
  readonly rewardSellShare: number; // claimed rewards sold each month
  readonly sellPropensity: number; // share of unlocked-but-unsold balance sold each month
}
const SCENARIOS: readonly Scenario[] = [
  { name: "stress", volumeUsd: 10_000, volumeRange: [5_000, 15_000], outsideLps: 3.5, outsideLpRange: [2, 5], netFlowShare: -0.04, hurdleApy: 0.8, rewardSellShare: 1, sellPropensity: 0.25 },
  { name: "conservative", volumeUsd: 32_500, volumeRange: [15_000, 50_000], outsideLps: 7.5, outsideLpRange: [5, 10], netFlowShare: 0, hurdleApy: 0.6, rewardSellShare: 0.9, sellPropensity: 0.15 },
  { name: "base", volumeUsd: 100_000, volumeRange: [50_000, 150_000], outsideLps: 17.5, outsideLpRange: [10, 25], netFlowShare: 0.01, hurdleApy: 0.4, rewardSellShare: 0.7, sellPropensity: 0.1 },
  { name: "strong", volumeUsd: 325_000, volumeRange: [150_000, 500_000], outsideLps: 50, outsideLpRange: [25, 75], netFlowShare: 0.02, hurdleApy: 0.3, rewardSellShare: 0.5, sellPropensity: 0.06 },
];

interface Experiment {
  readonly key: string;
  readonly label: string;
  readonly rewardShare: number;
  readonly rewardMonths: number;
  readonly curve: "linear" | "decay";
  readonly communityShare: number;
  readonly communityMonths: number;
  readonly reserveShare: number; // constrained reserve (not sold); treasury 15% also not sold
}
const EXPERIMENTS: readonly Experiment[] = [
  { key: "v0.1", label: "v0.1 reference: 45% over 36 mo, community 15% over 24 mo", rewardShare: 0.45, rewardMonths: 36, curve: "linear", communityShare: 0.15, communityMonths: 24, reserveShare: 0 },
  { key: "A48", label: "A: 45% over 48 mo, community over 48 mo", rewardShare: 0.45, rewardMonths: 48, curve: "linear", communityShare: 0.15, communityMonths: 48, reserveShare: 0 },
  { key: "A60", label: "A: 45% over 60 mo, community over 48 mo", rewardShare: 0.45, rewardMonths: 60, curve: "linear", communityShare: 0.15, communityMonths: 48, reserveShare: 0 },
  { key: "A72", label: "A: 45% over 72 mo, community over 48 mo", rewardShare: 0.45, rewardMonths: 72, curve: "linear", communityShare: 0.15, communityMonths: 48, reserveShare: 0 },
  { key: "B", label: "B: 35% rewards over 60 mo (+10% constrained reserve)", rewardShare: 0.35, rewardMonths: 60, curve: "linear", communityShare: 0.15, communityMonths: 48, reserveShare: 0.1 },
  { key: "C", label: "C: 45% over 60 mo, community 10% (+5% constrained reserve)", rewardShare: 0.45, rewardMonths: 60, curve: "linear", communityShare: 0.1, communityMonths: 48, reserveShare: 0.05 },
  { key: "D", label: "D: declining curve (−4%/mo) over 72 mo, unscheduled remainder to dead address", rewardShare: 0.45, rewardMonths: 72, curve: "decay", communityShare: 0.15, communityMonths: 48, reserveShare: 0 },
];

type Month24 = "retain" | "remove" | "reposition";
interface Config {
  readonly exp: Experiment;
  readonly scenario: Scenario;
  readonly feeTier: number;
  readonly month24: Month24;
  readonly launchWethUsd: number;
}

// ───────────────────────────── V3 maths ─────────────────────────────
const fullRangeL = (valueUsd: number, P: number) => valueUsd / (2 * Math.sqrt(P * ETH_USD));
const efficiency = (r: number) => 1 / (1 - 1 / Math.sqrt(1 + r));
const valueOfL = (L: number, P: number) => 2 * L * Math.sqrt(P * ETH_USD);

/** Average execution impact of selling (or buying) `usd` at price P through in-range liquidity L. */
function execImpact(L: number, P: number, usd: number, side: "sell" | "buy") {
  if (L <= 0) return 1;
  const p = P / ETH_USD;
  const x = L / Math.sqrt(p); // virtual MCHOW reserve
  const y = L * Math.sqrt(p); // virtual WETH reserve
  if (side === "sell") {
    const dx = usd / P;
    const outUsd = ((y * dx) / (x + dx)) * ETH_USD;
    return 1 - outUsd / usd;
  }
  const dy = usd / ETH_USD;
  const outUsd = ((x * dy) / (y + dy)) * P;
  return 1 - outUsd / usd;
}

function applyFlow(L: number, P: number, flowUsd: number) {
  if (L <= 0) return P;
  const p = P / ETH_USD;
  if (flowUsd >= 0) {
    const s = Math.sqrt(p) + flowUsd / ETH_USD / L;
    return s * s * ETH_USD;
  }
  const inv = 1 / Math.sqrt(p) + -flowUsd / P / L;
  return (1 / (inv * inv)) * ETH_USD;
}
const ilFull = (k: number) => (2 * Math.sqrt(k)) / (1 + k) - 1;

// ───────────────────────────── schedules ─────────────────────────────
function emission(exp: Experiment, m: number) {
  if (m > exp.rewardMonths) return 0;
  const reserve = exp.rewardShare * TOTAL_SUPPLY;
  if (exp.curve === "linear") {
    const w = 1.5 - (m - 1) / Math.max(1, exp.rewardMonths - 1); // 1.5× → 0.5× of uniform
    return (reserve / exp.rewardMonths) * w;
  }
  return (reserve / 48) * Math.pow(0.96, m - 1); // decays; remainder never scheduled
}
const scheduledTotal = (exp: Experiment) => {
  let t = 0;
  for (let m = 1; m <= exp.rewardMonths; m++) t += emission(exp, m);
  return t;
};
const teamRelease = (m: number) => (m > 12 && m <= 48 ? (0.05 * TOTAL_SUPPLY) / 36 : 0);
const communityRelease = (exp: Experiment, m: number) =>
  m <= exp.communityMonths ? (exp.communityShare * TOTAL_SUPPLY) / exp.communityMonths : 0;

// ───────────────────────────── simulation ─────────────────────────────
interface Result {
  launchSell: number;
  launchBuy: number;
  maxSell: number; // worst monthly $1,000 sell impact during the program
  maxBuy: number;
  shareM3: number;
  shareM6: number;
  cliff: number; // relative fall in in-range liquidity value from month 24 to 25
  priceM24: number;
  priceEnd: number;
  claimable: number;
  dead: number; // MCHOW to the dead address (unclaimed + never scheduled)
  lpEnd: number;
  lpAfter: number;
}

function simulate(cfg: Config): Result {
  const { exp, scenario: sc } = cfg;
  const months = exp.rewardMonths + ASSUMPTIONS.monthsAfterProgram;
  const e = efficiency(ASSUMPTIONS.rangeWidth);
  const f = ASSUMPTIONS.inRangeShare;
  const pairedTokens = 0.2 * TOTAL_SUPPLY;
  const P0 = cfg.launchWethUsd / pairedTokens;
  let P = P0;
  let launchL = fullRangeL(2 * cfg.launchWethUsd, P);
  let C = ASSUMPTIONS.startCommunityUsd;
  let overhang = 0; // released, not yet sold
  const volume = sc.volumeUsd * (ASSUMPTIONS.feeVolumeFactor[cfg.feeTier] ?? 1);
  const capUsd = sc.outsideLps * ASSUMPTIONS.avgLpPositionUsd;
  const commL = (cap: number, price: number) => f * e * fullRangeL(cap, price);

  const r: Result = {
    launchSell: execImpact(launchL, P, GATE_TRADE_USD, "sell"),
    launchBuy: execImpact(launchL, P, GATE_TRADE_USD, "buy"),
    maxSell: 0, maxBuy: 0, shareM3: 0, shareM6: 0, cliff: 0,
    priceM24: 0, priceEnd: 0, claimable: 0, dead: 0, lpEnd: 0, lpAfter: 0,
  };
  let emitted = 0;
  let claimed = 0;
  let valueM24 = 0;

  for (let m = 1; m <= months; m++) {
    if (m === 25 && cfg.month24 === "remove") launchL = 0;
    if (m === 25 && cfg.month24 === "reposition") launchL *= 0.5;

    const R = emission(exp, m);
    const shareAt = (cap: number) => {
      const c = commL(cap, P);
      return c + launchL > 0 ? c / (c + launchL) : 0;
    };
    const incomeAt = (cap: number) =>
      (R * P * ASSUMPTIONS.rewardRealisation + cfg.feeTier * LP_FEE_SHARE * volume) * shareAt(cap);
    // Equilibrium: most capital (≤ cap) whose return still meets the hurdle (includes IL estimate).
    let lo = 0;
    let hi = capUsd;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (mid > 0 && incomeAt(mid) / mid >= sc.hurdleApy / 12) lo = mid;
      else hi = mid;
    }
    C += (lo > C ? ASSUMPTIONS.entrySpeed : ASSUMPTIONS.exitSpeed) * (lo - C);

    const s = shareAt(C);
    const totalL = launchL + commL(C, P);
    emitted += R;
    claimed += R * s;

    overhang += teamRelease(m) + communityRelease(exp, m);
    const overhangSold = overhang * sc.sellPropensity;
    overhang -= overhangSold;
    const sellTokens = R * s * sc.rewardSellShare + overhangSold;
    const pBefore = P;
    P = applyFlow(totalL, P, sc.netFlowShare * sc.volumeUsd - sellTokens * P);
    C *= 1 - Math.min(1, e * Math.abs(ilFull(P / pBefore))) * 0.5; // LPs bear part of IL in capital

    const endL = launchL + commL(C, P);
    if (m <= exp.rewardMonths) {
      r.maxSell = Math.max(r.maxSell, execImpact(endL, P, GATE_TRADE_USD, "sell"));
      r.maxBuy = Math.max(r.maxBuy, execImpact(endL, P, GATE_TRADE_USD, "buy"));
    }
    const indepShare = C / (C + valueOfL(launchL, P));
    if (m === 3) r.shareM3 = indepShare;
    if (m === 6) r.shareM6 = indepShare;
    if (m === 24) {
      r.priceM24 = P / P0 - 1;
      valueM24 = valueOfL(endL, P);
    }
    if (m === 25) r.cliff = valueM24 > 0 ? 1 - valueOfL(endL, P) / valueM24 : 0;
    if (m === exp.rewardMonths) {
      r.priceEnd = P / P0 - 1;
      r.lpEnd = C;
    }
  }
  r.lpAfter = C;
  r.claimable = emitted > 0 ? claimed / emitted : 0;
  r.dead = emitted - claimed + (exp.rewardShare * TOTAL_SUPPLY - scheduledTotal(exp));
  return r;
}

const passesHardGate = (r: Result) =>
  r.launchSell <= GATE_MAX_IMPACT && r.launchBuy <= GATE_MAX_IMPACT && r.maxSell <= GATE_MAX_IMPACT && r.maxBuy <= GATE_MAX_IMPACT;

/** Smallest launch WETH (≤ $5M) that passes the hard gate for the whole program, or null. */
function minViableWeth(base: Omit<Config, "launchWethUsd">) {
  const ok = (E: number) => passesHardGate(simulate({ ...base, launchWethUsd: E }));
  const MAX = 5_000_000;
  if (!ok(MAX)) return null;
  let lo = 1_000;
  let hi = MAX;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ───────────────────────────── report ─────────────────────────────
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(0)}`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const bn = (n: number) => `${(n / 1e9).toFixed(0)}B`;
const L: string[] = [];
const out = (s = "") => L.push(s);

out("# MuttChow ($MCHOW) economic model — v0.2 decision report");
out();
out(`Generated by \`scripts/mchow-model/model-v0.2.ts\` on ${new Date().toISOString().slice(0, 10)}. ETH held at ${usd(ETH_USD)}. Supersedes [v0.1](./MCHOW-ECONOMIC-MODEL-v0.1.md).`);
out();
out("> **Status: research.** Not a forecast and not a launch recommendation. Behavioural inputs are");
out("> stress-testing assumptions from the advisory review, not verified market data. Findings: §6.");
out();

out("## 1. Gates and conventions");
out();
out(`- **Hard gate:** a ${usd(GATE_TRADE_USD)} MCHOW trade must have ≤ ${pct(GATE_MAX_IMPACT)} **average execution** price impact (fee excluded), in **both** directions, at launch **and in every month of the reward program** (so at stressed prices). Preferred ≤ ${pct(TARGET_MAX_IMPACT)}.`);
out(`- Independent LP value share ≥ ${pct(SHARE_GATE_M3)} by month 3; preferred ≥ ${pct(SHARE_TARGET_M6)} by month 6. These are post-launch milestones, not pre-launch facts.`);
out("- **Convention correction to v0.1.** v0.1's launch table reported how far the *spot price* moves; execution impact (how much worse the whole trade fills than spot) is about half of that. Under the execution convention a full-range launch position needs:");
out();
out("| Trade | ≤ 5% execution impact | ≤ 2% execution impact |");
out("| --- | --- | --- |");
for (const t of [500, 1_000]) {
  // For a full-range position execution impact on a trade T is T / (WETH side + T).
  out(`| ${usd(t)} | ${usd((t * (1 - GATE_MAX_IMPACT)) / GATE_MAX_IMPACT)} of WETH | ${usd((t * (1 - TARGET_MAX_IMPACT)) / TARGET_MAX_IMPACT)} of WETH |`);
}
out();
out("These hold only **at the launch price**. When MCHOW falls by a factor k, a full-range position's WETH side shrinks by √k, so depth in dollars falls; the program-wide gate below captures that.");
out();
out(`- Uniswap protocol fee: Base V3 pools at 0.30% and 1% were read on-chain with \`feeProtocol\` = 1/6, so LPs keep ${pct(LP_FEE_SHARE)} of the headline fee. The MCHOW pool's own setting must be read when it is created.`);
out(`- UniswapV3Staker periods last at most ${STAKER_MAX_MONTHS} months, so 48-, 60-, and 72-month programs run as 2, 3, and 3 consecutive incentives.`);
out();

out("## 2. Minimum launch WETH that passes the hard gate for the whole program");
out();
out("Fee 0.30%, launch position retained at month 24. “none ≤ $5M” means no launch budget up to $5M keeps a $1,000 trade within 5% throughout the program under that scenario.");
out();
out(`| Experiment | ${SCENARIOS.map((s) => s.name).join(" | ")} |`);
out(`| --- | ${SCENARIOS.map(() => "---").join(" | ")} |`);
const minTable = new Map<string, Array<number | null>>();
for (const exp of EXPERIMENTS) {
  const row = SCENARIOS.map((scenario) => minViableWeth({ exp, scenario, feeTier: 0.003, month24: "retain" }));
  minTable.set(exp.key, row);
  out(`| ${exp.label} | ${row.map((v) => (v === null ? "none ≤ $5M" : usd(v))).join(" | ")} |`);
}
out();

out("## 3. Outcomes at a fixed launch budget");
out();
const BUDGETS = [25_000, 100_000];
for (const E of BUDGETS) {
  out(`### Launch WETH ${usd(E)} · fee 0.30% · retain at month 24`);
  out();
  out("| Experiment | Scenario | Worst $1k sell | Hard gate | Indep. share m3 / m6 | Price m24 | Price end | Rewards claimable | Dead address | Outside LP end → +6 mo |");
  out("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const exp of EXPERIMENTS) {
    for (const scenario of SCENARIOS) {
      const r = simulate({ exp, scenario, feeTier: 0.003, month24: "retain", launchWethUsd: E });
      out(`| ${exp.key} | ${scenario.name} | ${pct(r.maxSell)} | ${passesHardGate(r) ? "pass" : "fail"} | ${pct(r.shareM3)} / ${pct(r.shareM6)} | ${pct(r.priceM24)} | ${pct(r.priceEnd)} | ${pct(r.claimable)} | ${bn(r.dead)} | ${usd(r.lpEnd)} → ${usd(r.lpAfter)} |`);
    }
  }
  out();
}

out("## 3a. Can the depth gate and the independent-share gate pass together?");
out();
out("At the minimum WETH that passes the depth gate, the launch position is worth about 2 × that WETH. Outside LPs can hold at most their capital ceiling (LP count × average position), so the best possible independent share at launch prices is `ceiling ÷ (ceiling + launch value)`. Experiment A60 shown. In the conservative scenario the other experiments need $35,700–$39,800, and in stress $55,400–$77,600; every one of them still leaves the best possible share far below 25%.");
out();
out("| Scenario | Outside-LP ceiling | Min WETH (depth gate) | Best possible independent share | Gate ≥ 25% by m3 |");
out("| --- | --- | --- | --- | --- |");
const a60Row = minTable.get("A60")!;
SCENARIOS.forEach((scenario, i) => {
  const ceiling = scenario.outsideLps * ASSUMPTIONS.avgLpPositionUsd;
  const minE = a60Row[i];
  if (minE === null || minE === undefined) {
    out(`| ${scenario.name} | ${usd(ceiling)} | none ≤ $5M | — | fail |`);
    return;
  }
  const best = ceiling / (ceiling + 2 * minE);
  out(`| ${scenario.name} | ${usd(ceiling)} | ${usd(minE)} | ${pct(best)} | ${best >= SHARE_GATE_M3 ? "possible" : "**impossible**"} |`);
});
out();
out("In the stress and conservative scenarios no configuration tested can pass both gates: the WETH needed for depth makes the protocol position too large for the expected outside LPs ever to reach a 25% share. Passing both needs either far more outside LP capital than those scenarios assume, or depth that does not come mainly from the protocol's own position.");
out();

out("## 4. Month-24 decision and fee tier (experiment A60, conservative scenario, $100,000 WETH)");
out();
out("| Fee | Month 24 | Worst $1k sell | Liquidity-value drop m24→m25 | Rewards claimable | Outside LP end → +6 mo |");
out("| --- | --- | --- | --- | --- | --- |");
const A60 = EXPERIMENTS.find((x) => x.key === "A60")!;
const conservative = SCENARIOS.find((x) => x.name === "conservative")!;
for (const feeTier of [0.003, 0.01]) {
  for (const month24 of ["retain", "reposition", "remove"] as const) {
    const r = simulate({ exp: A60, scenario: conservative, feeTier, month24, launchWethUsd: 100_000 });
    out(`| ${pct(feeTier)} | ${month24} | ${pct(r.maxSell)} | ${pct(r.cliff)} | ${pct(r.claimable)} | ${usd(r.lpEnd)} → ${usd(r.lpAfter)} |`);
  }
}
out();

out("## 5. Sensitivity (experiment A60, conservative, $100,000 WETH, one input at a time)");
out();
out("| Input changed | Worst $1k sell | Price end | Indep. share m6 |");
out("| --- | --- | --- | --- |");
const baseRun = simulate({ exp: A60, scenario: conservative, feeTier: 0.003, month24: "retain", launchWethUsd: 100_000 });
out(`| (none) | ${pct(baseRun.maxSell)} | ${pct(baseRun.priceEnd)} | ${pct(baseRun.shareM6)} |`);
const variants: Array<[string, Partial<Scenario>]> = [
  ["volume at range low ($15k)", { volumeUsd: conservative.volumeRange[0] }],
  ["volume at range high ($50k)", { volumeUsd: conservative.volumeRange[1] }],
  ["outside LPs at range low (5)", { outsideLps: conservative.outsideLpRange[0] }],
  ["outside LPs at range high (10)", { outsideLps: conservative.outsideLpRange[1] }],
  ["net flow −2% of volume", { netFlowShare: -0.02 }],
  ["net flow +2% of volume", { netFlowShare: 0.02 }],
  ["sell propensity 0.05/mo", { sellPropensity: 0.05 }],
  ["sell propensity 0.30/mo", { sellPropensity: 0.3 }],
  ["rewards sold 50%", { rewardSellShare: 0.5 }],
  ["hurdle APY 30%", { hurdleApy: 0.3 }],
];
for (const [label, change] of variants) {
  const r = simulate({ exp: A60, scenario: { ...conservative, ...change }, feeTier: 0.003, month24: "retain", launchWethUsd: 100_000 });
  out(`| ${label} | ${pct(r.maxSell)} | ${pct(r.priceEnd)} | ${pct(r.shareM6)} |`);
}
out();

out("## 6. Findings (with the assumptions in §7; re-read the tables if those change)");
out();
out("1. **Depth alone is affordable; viability is not.** The hard depth gate passes from about $19,000 of WETH in the base and strong scenarios and about $36,000–$40,000 in the conservative scenario (around $55,000–$78,000 in stress). But at those budgets the conservative and stress cases still lose most of their price, outside LPs leave, and the independent-share gate cannot be met (§3a).");
out("2. **No economically viable configuration emerges under conservative or stress assumptions.** Every experiment fails the independent-share gate there, and outside LP capital is near zero six months after rewards end in every scenario, including strong adoption: there is no evidence yet of liquidity that survives declining incentives.");
out("3. **The binding constraint is net demand, not emissions timing.** In the sensitivity table, moving net organic flow from −2% to +2% of volume swings the end price from about −94% to −52%; volume, LP counts, sell propensity, and the hurdle barely move it.");
out("4. **Slower emissions (A48–A72) and smaller reserves (B) mostly transfer risk.** They soften the price fall to month 24 but cut each month's reward, so fewer LPs come and fewer rewards are claimable; end prices in weak scenarios are similar. A smaller community allocation (C) helps price modestly. The declining curve (D) is weakest for LP participation.");
out("5. **Month 24 is a real trade-off.** Retaining the launch position keeps a $1,000 trade near 2% impact but leaves community LPs only a small claimable share; removing it raises claimable rewards and outside-LP retention but breaks the depth gate (impact jumps to 11–17%).");
out("6. **The locked position dominates fees as well as rewards.** Because the protocol position is most of the in-range liquidity, it earns most trading fees, which is a further reason outside LPs leave when rewards stop.");
out();
out("These results argue against setting a launch budget. They point to a design question to resolve first: where durable demand for MCHOW comes from, and whether depth can come from independent providers rather than mainly from the project's own position.");
out();

out("## 7. Assumptions");
out();
out("| Scenario | Gross volume/mo (range) | Outside LPs (range) | Net flow / volume | LP hurdle | Rewards sold | Overhang sold/mo |");
out("| --- | --- | --- | --- | --- | --- | --- |");
for (const s of SCENARIOS) {
  out(`| ${s.name} | ${usd(s.volumeUsd)} (${usd(s.volumeRange[0])}–${usd(s.volumeRange[1])}) | ${s.outsideLps} (${s.outsideLpRange[0]}–${s.outsideLpRange[1]}) | ${pct(s.netFlowShare)} | ${pct(s.hurdleApy)} | ${pct(s.rewardSellShare)} | ${pct(s.sellPropensity)} |`);
}
out();
out(`- Volume is flat (no growth assumed). Net organic flow is a share of gross volume, so high volume can coexist with net selling. Outside-LP capital is capped at LP count × ${usd(ASSUMPTIONS.avgLpPositionUsd)}.`);
out(`- Released team and community tokens join an unsold **overhang**; each month a scenario-specific share of the overhang is sold. Release is not sale. Treasury, constrained reserves, and unpaired launch tokens are never sold. Proceeds leave the pool.`);
out(`- Community LPs: ±${pct(ASSUMPTIONS.rangeWidth)} ranges (${efficiency(ASSUMPTIONS.rangeWidth).toFixed(2)}× full-range efficiency), in range ${pct(ASSUMPTIONS.inRangeShare)} of the time. Capital moves toward the most that still earns the hurdle: ${pct(ASSUMPTIONS.entrySpeed)} of the gap per month entering, ${pct(ASSUMPTIONS.exitSpeed)} leaving. Rewards valued at ${pct(ASSUMPTIONS.rewardRealisation)} of spot. LPs absorb half the estimated impermanent loss in capital.`);
out("- The locked launch position counts against community reward share (UniswapV3Staker uses all in-range liquidity). Dead-address totals include unclaimed rewards and, for D, the never-scheduled remainder.");
out("- 1.00% fee pools keep 50% of the volume of a 0.30% pool (assumed). LP fee income is after the 1/6 protocol fee.");
out("- Not modelled: finalization delay, V3 tick-by-tick depth of individual positions, arbitrage with other pools, MEV, gas, demand reacting to price, reward vesting.");
out();

const path = resolve(process.cwd(), "docs/MCHOW-ECONOMIC-MODEL-v0.2.md");
writeFileSync(path, `${L.join("\n")}\n`);
console.log(`wrote ${path}`);
console.log(JSON.stringify(Object.fromEntries([...minTable].map(([k, v]) => [k, v.map((x) => (x === null ? null : Math.round(x)))]))));
