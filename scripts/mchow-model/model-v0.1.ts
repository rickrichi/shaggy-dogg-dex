#!/usr/bin/env tsx
/**
 * MuttChow ($MCHOW) economic model, v0.1 — month-by-month simulation for whitepaper v2.0 §16.
 *
 *   npx tsx scripts/mchow-model/model-v0.1.ts            → writes docs/MCHOW-ECONOMIC-MODEL-v0.1.md
 *
 * Every behavioural number below is an ASSUMPTION, grouped in SCENARIOS and DESIGN. Change them and
 * re-run; nothing here is a forecast. Pool maths is exact for Uniswap V3 within a range; the
 * behavioural layer (LP entry/exit, demand, selling) is deliberately simple and stated in the report.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ───────────────────────────── fixed facts ─────────────────────────────
const TOTAL_SUPPLY = 1_000_000_000_000;
const REWARD_RESERVE = 450_000_000_000; // 45% maximum
const LAUNCH_ALLOCATION = 200_000_000_000; // 20%
const TEAM = 50_000_000_000; // 5%: 12-month cliff, 36-month linear
const COMMUNITY = 150_000_000_000; // 15%: assumed distributed over 24 months
const ETH_USD = 2_380; // observed on Base 2026-10-22/23; held constant (MCHOW price is the variable)

// ───────────────────────────── assumptions ─────────────────────────────
interface Scenario {
  readonly name: string;
  readonly volumeUsd: number; // organic monthly trading volume in month 1
  readonly volumeGrowth: number; // per month (−0.05 = −5%)
  readonly netDemandUsd: number; // organic net buying per month (negative = net selling)
  readonly hurdleApy: number; // annual return LPs demand before supplying capital
  readonly maxCommunityUsd: number; // most community LP capital that would ever show up
  readonly rewardSellShare: number; // share of claimed rewards LPs sell each month
  readonly unlockSellShare: number; // share of team / community unlocks sold
}
const SCENARIOS: readonly Scenario[] = [
  { name: "low", volumeUsd: 10_000, volumeGrowth: -0.03, netDemandUsd: 0, hurdleApy: 0.6, maxCommunityUsd: 10_000, rewardSellShare: 0.9, unlockSellShare: 0.7 },
  { name: "baseline", volumeUsd: 60_000, volumeGrowth: 0.01, netDemandUsd: 1_500, hurdleApy: 0.35, maxCommunityUsd: 50_000, rewardSellShare: 0.7, unlockSellShare: 0.5 },
  { name: "high", volumeUsd: 300_000, volumeGrowth: 0.03, netDemandUsd: 8_000, hurdleApy: 0.25, maxCommunityUsd: 250_000, rewardSellShare: 0.5, unlockSellShare: 0.3 },
  { name: "stress", volumeUsd: 15_000, volumeGrowth: -0.06, netDemandUsd: -2_000, hurdleApy: 0.8, maxCommunityUsd: 8_000, rewardSellShare: 1, unlockSellShare: 1 },
];

const DESIGN = {
  rangeWidth: 0.5, // community positions ±50% (multiplicative), re-centred monthly
  inRangeShare: 0.75, // share of time community liquidity is in range
  lpAdjustSpeed: 0.5, // fraction of the gap to equilibrium LP capital closed each month
  startCommunityUsd: 500,
  monthsAfterProgram: 6, // tail with no rewards: does liquidity stay?
  // Traders route away from a dearer pool: share of scenario volume kept at each fee tier (assumed).
  feeVolumeFactor: { 0.003: 1, 0.01: 0.5 } as Record<number, number>,
};

type Month24 = "retain" | "remove" | "reposition";
interface Run {
  readonly launchWethUsd: number; // E
  readonly pairedTokens: number; // N ≤ LAUNCH_ALLOCATION
  readonly feeTier: number;
  readonly programMonths: 36 | 48;
  readonly month24: Month24;
  readonly scenario: Scenario;
}

// ───────────────────────────── V3 maths ─────────────────────────────
// Prices: P = USD per MCHOW; p = WETH per MCHOW = P / ETH_USD. Liquidity L in sqrt(MCHOW·WETH).
const fullRangeL = (valueUsd: number, P: number) => valueUsd / (2 * Math.sqrt(P * ETH_USD));
/** Capital efficiency of a symmetric multiplicative range [p/(1+r), p(1+r)] versus full range. */
const efficiency = (r: number) => 1 / (1 - 1 / Math.sqrt(1 + r));

/** USD of MCHOW sold that moves price down by q, and USD of WETH that moves it up by q. */
function depth(L: number, P: number, q: number) {
  const p = P / ETH_USD;
  const sellTokens = L * (1 / Math.sqrt(p * (1 - q)) - 1 / Math.sqrt(p));
  const buyWeth = L * (Math.sqrt(p * (1 + q)) - Math.sqrt(p));
  return { sellUsd: sellTokens * P, buyUsd: buyWeth * ETH_USD };
}

/** New price after a net USD flow (positive = buying MCHOW) through liquidity L (fee ignored). */
function applyFlow(L: number, P: number, flowUsd: number) {
  if (L <= 0) return P;
  const p = P / ETH_USD;
  if (flowUsd >= 0) {
    const s = Math.sqrt(p) + flowUsd / ETH_USD / L;
    return s * s * ETH_USD;
  }
  const tokens = -flowUsd / P;
  const inv = 1 / Math.sqrt(p) + tokens / L;
  return (1 / (inv * inv)) * ETH_USD;
}

/** Price impact (fraction) of selling `usd` of MCHOW at price P into liquidity L. */
const sellImpact = (L: number, P: number, usd: number) => 1 - applyFlow(L, P, -usd) / P;

/** Impermanent loss of a full-range position for a price ratio k (negative = loss). */
const ilFull = (k: number) => (2 * Math.sqrt(k)) / (1 + k) - 1;

// ───────────────────────────── emissions & unlocks ─────────────────────────────
function emission(month: number, programMonths: number) {
  // Front-weighted: linearly from 1.5× to 0.5× the uniform rate; sums to the full reserve.
  if (month > programMonths) return 0;
  const uniform = REWARD_RESERVE / programMonths;
  const w = 1.5 - (month - 1) / Math.max(1, programMonths - 1);
  return uniform * w;
}
const teamUnlock = (m: number) => (m > 12 && m <= 48 ? TEAM / 36 : 0);
const communityRelease = (m: number) => (m <= 24 ? COMMUNITY / 24 : 0);

// ───────────────────────────── simulation ─────────────────────────────
interface MonthRow {
  m: number;
  price: number;
  communityUsd: number;
  share: number; // community share of in-range liquidity (claimable reward share)
  emitted: number;
  claimed: number;
  unused: number;
  lpApy: number;
  depthSell2: number;
  outOfRange: boolean;
}

function simulate(run: Run) {
  const { scenario: sc } = run;
  const months = run.programMonths + DESIGN.monthsAfterProgram;
  const e = efficiency(DESIGN.rangeWidth);
  const f = DESIGN.inRangeShare;
  let P = run.launchWethUsd / run.pairedTokens;
  let launchL = fullRangeL(2 * run.launchWethUsd, P);
  let C = DESIGN.startCommunityUsd;
  let volume = sc.volumeUsd * (DESIGN.feeVolumeFactor[run.feeTier] ?? 1);
  const rows: MonthRow[] = [];
  let emittedTotal = 0;
  let claimedTotal = 0;
  let unusedTotal = 0;

  for (let m = 1; m <= months; m++) {
    if (m === 25 && run.month24 === "remove") launchL = 0;
    if (m === 25 && run.month24 === "reposition") launchL *= 0.5;

    const R = emission(m, run.programMonths);
    const commL = (cap: number, price: number) => f * e * fullRangeL(cap, price);
    const shareOf = (cap: number) => {
      const c = commL(cap, P);
      return c + launchL > 0 ? c / (c + launchL) : 0;
    };

    // Equilibrium community capital: the largest C (≤ cap) whose return still meets the hurdle.
    const monthlyHurdle = sc.hurdleApy / 12;
    const incomeAt = (cap: number) => {
      const s = shareOf(cap);
      return (R * P * (1 - sc.rewardSellShare * 0.5) + run.feeTier * volume) * s; // sells at ~half impact, see report
    };
    let lo = 0;
    let hi = sc.maxCommunityUsd;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (mid > 0 && incomeAt(mid) / mid >= monthlyHurdle) lo = mid;
      else hi = mid;
    }
    C += DESIGN.lpAdjustSpeed * (lo - C);
    C = Math.max(0, C);

    const s = shareOf(C);
    const totalL = launchL + commL(C, P);
    const claimed = R * s;
    const unused = R - claimed;
    emittedTotal += R;
    claimedTotal += claimed;
    unusedTotal += unused;

    const sellTokens =
      claimed * sc.rewardSellShare + (teamUnlock(m) + communityRelease(m)) * sc.unlockSellShare;
    const flowUsd = sc.netDemandUsd - sellTokens * P;
    const P0 = P;
    P = applyFlow(totalL, P, flowUsd);
    const k = P / P0;

    const realised = claimed * ((P0 + P) / 2);
    const fees = run.feeTier * volume * s;
    const il = Math.min(1, e * Math.abs(ilFull(k))) * C;
    const lpApy = C > 0 ? ((realised + fees - il) / C) * 12 : 0;

    rows.push({
      m,
      price: P,
      communityUsd: C,
      share: s,
      emitted: R,
      claimed,
      unused,
      lpApy,
      depthSell2: depth(launchL + commL(C, P), P, 0.02).sellUsd,
      outOfRange: Math.abs(k - 1) > DESIGN.rangeWidth,
    });
    volume *= 1 + sc.volumeGrowth;
  }
  return { rows, emittedTotal, claimedTotal, unusedTotal };
}

// ───────────────────────────── report ─────────────────────────────
const usd = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toPrecision(3)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const bn = (n: number) => `${(n / 1e9).toFixed(1)}B`;
const at = (rows: MonthRow[], m: number) => rows[Math.min(rows.length, m) - 1]!;

const lines: string[] = [];
const out = (s = "") => lines.push(s);

out("# MuttChow ($MCHOW) economic model — v0.1");
out();
out(`Generated by \`scripts/mchow-model/model-v0.1.ts\` on ${new Date().toISOString().slice(0, 10)}. ETH held at ${usd(ETH_USD)}.`);
out();
out("> **Status: exploratory.** Every behavioural input is an assumption listed below. The pool maths is");
out("> exact for Uniswap V3 within a range; LP behaviour, demand, and selling are simplified. Use this to");
out("> see which inputs matter and to set launch thresholds — not as a forecast.");
out();

out("## 1. Launch depth by ETH commitment (all 200B paired, full-range position only)");
out();
out("| Launch WETH | Price per MCHOW | Whole-supply value | Sell to move −2% | $500 sell impact | $1,000 sell impact | $5,000 sell impact |");
out("| --- | --- | --- | --- | --- | --- | --- |");
const budgets = [500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000];
for (const E of budgets) {
  const P = E / LAUNCH_ALLOCATION;
  const L = fullRangeL(2 * E, P);
  out(`| ${usd(E)} | $${P.toExponential(2)} | ${usd(TOTAL_SUPPLY * P)} | ${usd(depth(L, P, 0.02).sellUsd)} | ${pct(sellImpact(L, P, 500))} | ${pct(sellImpact(L, P, 1_000))} | ${pct(sellImpact(L, P, 5_000))} |`);
}
out();
out("Depth depends only on the WETH committed: pairing fewer MCHOW raises the starting price and valuation but not the ETH depth. For small trades, price impact is roughly `2 × trade ÷ WETH side`; the WETH you actually receive falls by about half that.");
out();

out("### Minimum WETH for a price-impact threshold (launch position alone)");
out();
out("| Benchmark sell | ≤ 1% impact | ≤ 2% impact | ≤ 5% impact |");
out("| --- | --- | --- | --- |");
for (const trade of [500, 1_000, 2_500, 5_000]) {
  const need = (q: number) => {
    let lo = 1;
    let hi = 10_000_000;
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(lo * hi);
      const P = mid / LAUNCH_ALLOCATION;
      if (sellImpact(fullRangeL(2 * mid, P), P, trade) <= q) hi = mid;
      else lo = mid;
    }
    return usd(hi);
  };
  out(`| ${usd(trade)} | ${need(0.01)} | ${need(0.02)} | ${need(0.05)} |`);
}
out();

out("## 2. Full simulation grid");
out();
out("Columns: price change vs launch at month 24 and at the program's end; community LP capital; the share of emitted rewards community stakers could claim (the rest goes to the dead address, mostly through dilution by the locked launch position); depth to move the price −2% at the end; and community capital left 6 months after rewards stop.");
out();
const grid: string[] = [];
for (const E of [2_000, 10_000, 50_000]) {
  out(`### Launch WETH ${usd(E)}`);
  out();
  out("| Scenario | Fee | Months | Month 24 | Price m24 | Price at end | Community LP m24 | Community LP end | Rewards claimable | Dead-address | −2% depth end | LP after rewards stop | Range breaches |");
  out("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const scenario of SCENARIOS) {
    for (const feeTier of [0.003, 0.01]) {
      for (const programMonths of [36, 48] as const) {
        for (const month24 of ["retain", "remove", "reposition"] as const) {
          const run: Run = { launchWethUsd: E, pairedTokens: LAUNCH_ALLOCATION, feeTier, programMonths, month24, scenario };
          const r = simulate(run);
          const P0 = E / LAUNCH_ALLOCATION;
          const end = at(r.rows, programMonths);
          const tail = r.rows[r.rows.length - 1]!;
          const breaches = r.rows.filter((x) => x.outOfRange).length;
          const row = `| ${scenario.name} | ${pct(feeTier)} | ${programMonths} | ${month24} | ${pct(at(r.rows, 24).price / P0 - 1)} | ${pct(end.price / P0 - 1)} | ${usd(at(r.rows, 24).communityUsd)} | ${usd(end.communityUsd)} | ${pct(r.claimedTotal / r.emittedTotal)} | ${bn(r.unusedTotal)} | ${usd(end.depthSell2)} | ${usd(tail.communityUsd)} | ${breaches} |`;
          out(row);
          grid.push(row);
        }
      }
    }
  }
  out();
}

out("## 3. Assumptions");
out();
out("| Scenario | Month-1 volume | Volume growth/mo | Net organic demand/mo | LP hurdle APY | Max community LP | Rewards sold | Unlocks sold |");
out("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const s of SCENARIOS) {
  out(`| ${s.name} | ${usd(s.volumeUsd)} | ${pct(s.volumeGrowth)} | ${usd(s.netDemandUsd)} | ${pct(s.hurdleApy)} | ${usd(s.maxCommunityUsd)} | ${pct(s.rewardSellShare)} | ${pct(s.unlockSellShare)} |`);
}
out();
out(`- Community positions: ±${pct(DESIGN.rangeWidth)} ranges (capital efficiency ${efficiency(DESIGN.rangeWidth).toFixed(2)}× full range), in range ${pct(DESIGN.inRangeShare)} of the time, re-centred monthly; LP capital closes ${pct(DESIGN.lpAdjustSpeed)} of the gap to its equilibrium each month, starting from ${usd(DESIGN.startCommunityUsd)}.`);
out("- Equilibrium LP capital: the most capital (up to the scenario cap) whose fees plus realisable rewards still meet the hurdle APY. Rewards are valued at spot less half the selling share, a crude allowance for selling into the pool.");
out("- Emissions front-weighted, falling linearly from 1.5× to 0.5× the uniform rate; all 450B scheduled. Team 50B unlocks over months 13–48; community 150B released evenly over 24 months; treasury and any unpaired launch allocation are not sold.");
out("- Reward sharing uses in-range liquidity: the locked full-range launch position counts against community stakers but never claims (§14.1 of the whitepaper). Finalization delay is not modelled.");
out(`- Fee tiers: the 1.00% pool is assumed to keep ${pct(DESIGN.feeVolumeFactor[0.01]!)} of the volume a 0.30% pool would get. This single assumption decides the fee-tier comparison.`);
out("- Not modelled: arbitrage against other pools, MEV, gas, LP cost of re-centring ranges, price feedback on demand, treasury actions. Range breaches count months whose price move exceeded the community range (depth there is overstated).");
out();

const path = resolve(process.cwd(), "docs/MCHOW-ECONOMIC-MODEL-v0.1.md");
writeFileSync(path, `${lines.join("\n")}\n`);
console.log(`wrote ${path} (${grid.length} simulated runs)`);
