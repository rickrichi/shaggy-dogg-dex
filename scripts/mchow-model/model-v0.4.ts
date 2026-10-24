#!/usr/bin/env tsx
/**
 * MuttChow ($MCHOW) economic model, v0.4 — R3 baseline plus launchpad demand.
 *
 *   npx tsx scripts/mchow-model/model-v0.4.ts       → writes docs/MCHOW-ECONOMIC-MODEL-v0.4.md
 *
 * R3: 60% LP rewards over 48 months (front-weighted), 20% launch liquidity in a ¼×–4× V3 range,
 * 15% treasury (never sold), 5% team (12-month cliff, 36-month vesting), no community airdrop.
 *
 * Launchpad demand (whitepaper §11.1): creators of MCHOW-quoted launches buy MCHOW to seed their
 * pool (net buying on MCHOW/WETH); a routed share of launched-token trading passes through
 * MCHOW/WETH (two-sided: fees, no net flow); project pools leak their MCHOW back as launched tokens
 * are sold off over time (net selling). Every behavioural number is an ASSUMPTION. Not a forecast.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOTAL_SUPPLY = 1_000_000_000_000;
const ETH_USD = 2_380;
const LP_FEE_SHARE = 5 / 6;
const FEE_TIER = 0.003;
const PROJECT_POOL_FEE = 0.01; // the launchpad seeds V3 pools at 1% today
const GATE_TRADE_USD = 1_000;
const GATE_MAX_IMPACT = 0.05;
const SHARE_GATE_M3 = 0.25;
const MIN_PRICE_END = -0.5;
const MIN_LP_RETENTION = 0.5;
const MIN_LP_END_USD = 1_000;
const TARGETS = [150_000, 220_000];

const R3 = { rewardShare: 0.6, rewardMonths: 48, protocolRange: 4, teamShare: 0.05 };
const A = {
  avgLpPositionUsd: 1_500,
  rangeWidth: 0.5,
  inRangeShare: 0.75,
  entrySpeed: 0.4,
  exitSpeed: 0.7,
  startCommunityUsd: 300,
  monthsAfterProgram: 6,
  rewardRealisation: 0.75,
  // With a launchpad, more outside LPs can exist; their ceiling grows with canonical volume:
  extraLpUsdPerVolumeUsd: 0.1, // $0.10 of extra LP capital ceiling per $1 of monthly routed volume
};

interface Organic {
  readonly name: string;
  readonly volumeUsd: number;
  readonly outsideLps: number;
  readonly netFlowShare: number;
  readonly hurdleApy: number;
  readonly rewardSellShare: number;
  readonly sellPropensity: number;
}
const ORGANIC: readonly Organic[] = [
  { name: "stress", volumeUsd: 10_000, outsideLps: 3.5, netFlowShare: -0.04, hurdleApy: 0.8, rewardSellShare: 1, sellPropensity: 0.25 },
  { name: "conservative", volumeUsd: 32_500, outsideLps: 7.5, netFlowShare: 0, hurdleApy: 0.6, rewardSellShare: 0.9, sellPropensity: 0.15 },
  { name: "base", volumeUsd: 100_000, outsideLps: 17.5, netFlowShare: 0.01, hurdleApy: 0.4, rewardSellShare: 0.7, sellPropensity: 0.1 },
];

interface Launchpad {
  readonly name: string;
  readonly launchesPerMonth: number;
  readonly seedMchowUsd: number; // MCHOW a creator buys to seed each PROJECT/MCHOW pool
  readonly volumePerLaunchUsd: number; // a new launched token's trading in its first month
  readonly volumeDecay: number; // monthly decay of each launched token's trading
  readonly leakRate: number; // monthly share of project-pool MCHOW sold back as projects are sold off
}
const LAUNCHPADS: readonly Launchpad[] = [
  { name: "none", launchesPerMonth: 0, seedMchowUsd: 0, volumePerLaunchUsd: 0, volumeDecay: 0.3, leakRate: 0.05 },
  { name: "slow", launchesPerMonth: 2, seedMchowUsd: 500, volumePerLaunchUsd: 15_000, volumeDecay: 0.3, leakRate: 0.06 },
  { name: "steady", launchesPerMonth: 5, seedMchowUsd: 1_000, volumePerLaunchUsd: 25_000, volumeDecay: 0.25, leakRate: 0.05 },
  { name: "busy", launchesPerMonth: 15, seedMchowUsd: 1_500, volumePerLaunchUsd: 40_000, volumeDecay: 0.2, leakRate: 0.04 },
];
const ROUTED_SHARES = [0.25, 0.5, 0.75, 1];
const steadyStateLaunchVolume = (lp: Launchpad) => (lp.launchesPerMonth * lp.volumePerLaunchUsd) / lp.volumeDecay;

// ───────────────────────────── V3 maths (p = WETH per MCHOW) ─────────────────────────────
const fullRangeL = (valueUsd: number, P: number) => valueUsd / (2 * Math.sqrt(P * ETH_USD));
const efficiency = (r: number) => 1 / (1 - 1 / Math.sqrt(1 + r));
function positionValueUsd(L: number, p: number, pa: number, pb: number) {
  const sp = Math.sqrt(Math.min(Math.max(p, pa), pb));
  return (L * (1 / sp - 1 / Math.sqrt(pb)) * p + L * (sp - Math.sqrt(pa))) * ETH_USD;
}
function execImpact(L: number, P: number, usd: number, side: "sell" | "buy") {
  if (L <= 0) return 1;
  const p = P / ETH_USD;
  const x = L / Math.sqrt(p);
  const y = L * Math.sqrt(p);
  if (side === "sell") {
    const dx = usd / P;
    return 1 - (((y * dx) / (x + dx)) * ETH_USD) / usd;
  }
  const dy = usd / ETH_USD;
  return 1 - (((x * dy) / (y + dy)) * P) / usd;
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

// ───────────────────────────── simulation ─────────────────────────────
interface Run {
  readonly organic: Organic;
  readonly launchpad: Launchpad;
  readonly routedShare: number;
  readonly E: number;
  readonly rewardSellShare?: number;
  readonly shockUsdPerMonth?: number; // extra selling in months 1–6 (range stress)
}
interface Result {
  launchImpact: number;
  maxImpact: number;
  shareM3: number;
  priceEnd: number;
  priceMin: number;
  lpEnd: number;
  lpAfter: number;
  canonicalVolumeM24: number;
  canonicalVolumeAfter: number;
  outOfRangeMonths: number;
  worstImpactOutOfRange: number;
  outsideLpFeeApyAfter: number;
}

function simulate(run: Run): Result {
  const { organic: sc, launchpad: lp } = run;
  const sellShare = run.rewardSellShare ?? sc.rewardSellShare;
  const months = R3.rewardMonths + A.monthsAfterProgram;
  const e = efficiency(A.rangeWidth);
  const P0 = run.E / (0.2 * TOTAL_SUPPLY);
  const p0 = P0 / ETH_USD;
  const pa = p0 / R3.protocolRange;
  const pb = p0 * R3.protocolRange;
  const protocolL = run.E / ETH_USD / (Math.sqrt(p0) - Math.sqrt(pa));
  let P = P0;
  let C = A.startCommunityUsd;
  let overhang = 0;
  let projectPoolMchow = 0; // MCHOW (tokens) held in PROJECT/MCHOW pools
  let launchVolume = 0; // current monthly trading of all launched tokens
  const commL = (cap: number, price: number) => A.inRangeShare * e * fullRangeL(cap, price);
  const activeProtocolL = (price: number) => {
    const p = price / ETH_USD;
    return p > pa && p < pb ? protocolL : 0;
  };
  const r: Result = {
    launchImpact: Math.max(execImpact(protocolL, P, GATE_TRADE_USD, "sell"), execImpact(protocolL, P, GATE_TRADE_USD, "buy")),
    maxImpact: 0, shareM3: 0, priceEnd: 0, priceMin: 0, lpEnd: 0, lpAfter: 0,
    canonicalVolumeM24: 0, canonicalVolumeAfter: 0, outOfRangeMonths: 0, worstImpactOutOfRange: 0, outsideLpFeeApyAfter: 0,
  };
  for (let m = 1; m <= months; m++) {
    launchVolume = launchVolume * (1 - lp.volumeDecay) + lp.launchesPerMonth * lp.volumePerLaunchUsd;
    const canonicalVolume = sc.volumeUsd + run.routedShare * launchVolume;
    const capUsd = sc.outsideLps * A.avgLpPositionUsd + A.extraLpUsdPerVolumeUsd * run.routedShare * launchVolume;
    const R = m <= R3.rewardMonths ? ((R3.rewardShare * TOTAL_SUPPLY) / R3.rewardMonths) * (1.5 - (m - 1) / (R3.rewardMonths - 1)) : 0;
    const pL = activeProtocolL(P);
    const shareAt = (cap: number) => {
      const c = commL(cap, P);
      return c + pL > 0 ? c / (c + pL) : 0;
    };
    const incomeAt = (cap: number) => (R * P * A.rewardRealisation + FEE_TIER * LP_FEE_SHARE * canonicalVolume) * shareAt(cap);
    let lo = 0;
    let hi = capUsd;
    for (let i = 0; i < 45; i++) {
      const mid = (lo + hi) / 2;
      if (mid > 0 && incomeAt(mid) / mid >= sc.hurdleApy / 12) lo = mid;
      else hi = mid;
    }
    C += (lo > C ? A.entrySpeed : A.exitSpeed) * (lo - C);
    const s = shareAt(C);

    overhang += m > 12 && m <= 48 ? (R3.teamShare * TOTAL_SUPPLY) / 36 : 0;
    const sold = overhang * sc.sellPropensity;
    overhang -= sold;
    const seedTokens = (lp.launchesPerMonth * lp.seedMchowUsd) / P; // bought on MCHOW/WETH
    const leakTokens = projectPoolMchow * lp.leakRate;
    projectPoolMchow += seedTokens - leakTokens;
    const shock = m <= 6 ? (run.shockUsdPerMonth ?? 0) : 0;
    const flowUsd = sc.netFlowShare * sc.volumeUsd + lp.launchesPerMonth * lp.seedMchowUsd - shock
      - (R * s * sellShare + sold + leakTokens) * P;
    const pBefore = P;
    P = applyFlow(pL + commL(C, P), P, flowUsd);
    C *= 1 - Math.min(1, e * Math.abs(ilFull(P / pBefore))) * 0.5;

    const endL = activeProtocolL(P) + commL(C, P);
    const impact = Math.max(execImpact(endL, P, GATE_TRADE_USD, "sell"), execImpact(endL, P, GATE_TRADE_USD, "buy"));
    if (activeProtocolL(P) === 0) {
      r.outOfRangeMonths++;
      r.worstImpactOutOfRange = Math.max(r.worstImpactOutOfRange, impact);
    }
    if (m <= R3.rewardMonths) r.maxImpact = Math.max(r.maxImpact, impact);
    r.priceMin = Math.min(r.priceMin, P / P0 - 1);
    if (m === 3) r.shareM3 = C / (C + positionValueUsd(protocolL, P / ETH_USD, pa, pb));
    if (m === 24) r.canonicalVolumeM24 = canonicalVolume;
    if (m === R3.rewardMonths) {
      r.priceEnd = P / P0 - 1;
      r.lpEnd = C;
    }
    if (m === months) {
      r.canonicalVolumeAfter = canonicalVolume;
      r.outsideLpFeeApyAfter = C > 0 ? ((FEE_TIER * LP_FEE_SHARE * canonicalVolume * s) / C) * 12 : 0;
    }
  }
  r.lpAfter = C;
  return r;
}

const depthOk = (r: Result) => r.launchImpact <= GATE_MAX_IMPACT && r.maxImpact <= GATE_MAX_IMPACT;
function failures(r: Result) {
  const f: string[] = [];
  if (!depthOk(r)) f.push("depth");
  if (r.shareM3 < SHARE_GATE_M3) f.push("share");
  if (r.priceEnd < MIN_PRICE_END) f.push("price");
  if (r.lpEnd < MIN_LP_END_USD || r.lpAfter < MIN_LP_RETENTION * r.lpEnd) f.push("LP retention");
  return f;
}
function minDepthWeth(base: Omit<Run, "E">) {
  const ok = (E: number) => depthOk(simulate({ ...base, E }));
  if (!ok(5_000_000)) return null;
  let lo = 500;
  let hi = 5_000_000;
  for (let i = 0; i < 36; i++) {
    const mid = Math.sqrt(lo * hi);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ───────────────────────────── report ─────────────────────────────
const usd = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(0)}`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const out: string[] = [];
const w = (s = "") => out.push(s);

w("# MuttChow ($MCHOW) economic model — v0.4: R3 baseline with launchpad demand");
w();
w(`Generated by \`scripts/mchow-model/model-v0.4.ts\` on ${new Date().toISOString().slice(0, 10)}. Builds on [v0.3](./MCHOW-ECONOMIC-MODEL-v0.3.md). Design R3, fee tier 0.30% (LPs keep ${pct(LP_FEE_SHARE)} after the protocol fee), launch position retained.`);
w();
w("> **Status: research.** Launchpad activity below is hypothetical: it shows what the launchpad would");
w("> have to achieve, not what it will achieve. A no-launch outcome remains possible.");
w();

w("## 1. Launchpad trading needed for the canonical-pool targets");
w();
w("Canonical MCHOW/WETH volume = organic MCHOW trading + (routed share × launched-token trading). Required launchpad trading = (target − organic) ÷ routed share, with organic MCHOW trading at the conservative scenario's $32,500/month.");
w();
w(`| Routed share | ${TARGETS.map((t) => `Launchpad trading for ${usd(t)}/mo`).join(" | ")} |`);
w(`| --- | ${TARGETS.map(() => "---").join(" | ")} |`);
for (const rho of ROUTED_SHARES) {
  w(`| ${pct(rho)} | ${TARGETS.map((t) => `${usd((t - 32_500) / rho)}/mo (${usd((t - 32_500) / rho / 30)}/day)`).join(" | ")} |`);
}
w();
w("Steady-state launched-token trading for each hypothetical launchpad (launches × first-month trading ÷ monthly decay):");
w();
w("| Launchpad | Launches/mo | Seed MCHOW bought per launch | First-month trading per launch | Monthly decay | Steady-state launched-token trading |");
w("| --- | --- | --- | --- | --- | --- |");
for (const lp of LAUNCHPADS.filter((x) => x.launchesPerMonth > 0)) {
  w(`| ${lp.name} | ${lp.launchesPerMonth} | ${usd(lp.seedMchowUsd)} | ${usd(lp.volumePerLaunchUsd)} | ${pct(lp.volumeDecay)} | ${usd(steadyStateLaunchVolume(lp))}/mo |`);
}
w();

w("## 2. Viability grid (R3, minimum WETH for the depth gate)");
w();
w("| Organic | Launchpad | Routed | Min WETH | Canonical volume m24 → after | Indep. share m3 | Price end (min) | Outside LP end → +6 mo | Outside-LP fee APY after rewards | Result |");
w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
const viableRows: string[] = [];
for (const organic of ORGANIC) {
  for (const launchpad of LAUNCHPADS) {
    for (const routedShare of launchpad.launchesPerMonth === 0 ? [0] : ROUTED_SHARES) {
      const base = { organic, launchpad, routedShare };
      const E = minDepthWeth(base);
      if (E === null) {
        w(`| ${organic.name} | ${launchpad.name} | ${pct(routedShare)} | none ≤ $5M | — | — | — | — | — | fails: depth |`);
        continue;
      }
      const r = simulate({ ...base, E });
      const f = failures(r);
      const result = f.length === 0 ? "**viable**" : `fails: ${f.join(", ")}`;
      if (f.length === 0) viableRows.push(`${organic.name} / ${launchpad.name} / ${pct(routedShare)} routed, ${usd(E)} WETH`);
      w(`| ${organic.name} | ${launchpad.name} | ${pct(routedShare)} | ${usd(E)} | ${usd(r.canonicalVolumeM24)} → ${usd(r.canonicalVolumeAfter)} | ${pct(r.shareM3)} | ${pct(r.priceEnd)} (${pct(r.priceMin)}) | ${usd(r.lpEnd)} → ${usd(r.lpAfter)} | ${pct(r.outsideLpFeeApyAfter)} | ${result} |`);
    }
  }
}
w();
w(viableRows.length ? `Viable combinations: ${viableRows.join("; ")}.` : "No combination is viable.");
w();

w("## 3. Cost of the two-hop route");
w();
w(`A buyer coming from WETH to a MCHOW-quoted token pays the project pool's ${pct(PROJECT_POOL_FEE)} fee plus MCHOW/WETH's ${pct(FEE_TIER)} fee and that pool's price impact; a WETH-quoted launch pays only the project pool. Extra cost of the MCHOW route at the launch depth of the conservative minimum WETH:`);
w();
const consE = minDepthWeth({ organic: ORGANIC[1]!, launchpad: LAUNCHPADS[0]!, routedShare: 0 }) ?? 0;
const consP = consE / (0.2 * TOTAL_SUPPLY);
const consL = consE / ETH_USD / (Math.sqrt(consP / ETH_USD) - Math.sqrt(consP / ETH_USD / R3.protocolRange));
w("| Trade | Extra fee | Extra price impact on MCHOW/WETH | Total extra cost |");
w("| --- | --- | --- | --- |");
for (const t of [100, 500, 1_000, 5_000]) {
  const imp = execImpact(consL, consP, t, "buy");
  w(`| ${usd(t)} | ${pct(FEE_TIER)} | ${pct(imp)} | ${pct(FEE_TIER + imp)} |`);
}
w();
w("Small trades pay little extra; large trades pay materially more unless the canonical pool is deep. Routing is only competitive while that extra cost stays small relative to the value of the launch.");
w();

w("## 4. Range-boundary stress (R3, conservative organic, no launchpad)");
w();
w("Extra selling in months 1–6 pushes the price toward and below ¼× of launch, where the locked protocol position holds only MCHOW and adds no depth.");
w();
w("| Extra selling, months 1–6 | Lowest price | Months below ¼× | Worst $1k impact while out of range | Worst $1k impact in program |");
w("| --- | --- | --- | --- | --- |");
for (const shock of [0, 500, 1_000, 2_000, 5_000]) {
  const r = simulate({ organic: ORGANIC[1]!, launchpad: LAUNCHPADS[0]!, routedShare: 0, E: consE, shockUsdPerMonth: shock });
  w(`| ${usd(shock)}/mo | ${pct(r.priceMin)} | ${r.outOfRangeMonths} | ${r.outOfRangeMonths ? pct(r.worstImpactOutOfRange) : "—"} | ${pct(r.maxImpact)} |`);
}
w();

w("## 5. Heavier reward selling (R3, steady launchpad, 50% routed)");
w();
w("| Organic | Rewards sold | Min WETH | Price end | Outside LP end → +6 mo | Result |");
w("| --- | --- | --- | --- | --- | --- |");
for (const organic of ORGANIC.slice(1)) {
  for (const rewardSellShare of [...new Set([organic.rewardSellShare, 0.9, 1])]) {
    const base = { organic, launchpad: LAUNCHPADS[2]!, routedShare: 0.5, rewardSellShare };
    const E = minDepthWeth(base);
    if (E === null) {
      w(`| ${organic.name} | ${pct(rewardSellShare)} | none | — | — | fails: depth |`);
      continue;
    }
    const r = simulate({ ...base, E });
    const f = failures(r);
    w(`| ${organic.name} | ${pct(rewardSellShare)} | ${usd(E)} | ${pct(r.priceEnd)} | ${usd(r.lpEnd)} → ${usd(r.lpAfter)} | ${f.length ? `fails: ${f.join(", ")}` : "**viable**"} |`);
  }
}
w();

w("## 6. Who benefits");
w();
w("- **The DEX:** the launchpad charges no platform fee at the baseline, so the platform earns nothing from launches in any scenario here. Any platform fee would be a new design decision and a new legal question.");
w("- **Outside LPs:** the fee APY column in §2 shows their return from fees alone once rewards stop; viability requires it to meet their hurdle.");
w("- **MCHOW holders:** the price columns. Seed buying is the only sustained source of net buying the launchpad adds; leak-back of project-pool MCHOW offsets part of it as launched tokens fade.");
w();

w("## 7. Findings (with the assumptions in §8; re-read the tables if those change)");
w();
w("1. **The launchpad target is concrete.** With organic MCHOW trading at $32,500/month, reaching $220,000/month through MCHOW/WETH needs about $375,000/month of launched-token trading if half of it routes through MCHOW ($12,500/day), $250,000 at 75%, and $750,000 at 25% (§1).");
w("2. **A busy launchpad makes R3 viable even under stress organic assumptions; a steady one does in the base case.** The hypothetical “busy” launchpad (15 launches a month, about $3M/month of launched-token trading) passes every criterion in all three organic scenarios with about $9,500 of launch WETH. “Steady” (5 a month, about $500,000) passes in the base scenario and, in the conservative scenario, fails only the LP-retention criterion. “Slow” (2 a month) is not enough.");
w("3. **The LP-retention criterion partly measures overshoot.** Rewards attract more outside LP capital than fees alone can support; when rewards stop, capital falls back to what fees support. In base + steady at 50–75% routed and conservative + steady at 75–100% routed, the LPs who remain earn about their hurdle from fees and $5,000–$18,000 of outside liquidity stays, so that remainder is sustainable even though the retention ratio fails. In conservative + steady at 25–50% routed, outside LPs leave almost entirely and fees pay below their hurdle. A criterion based on fee-supported outside capital after rewards may fit better than a ratio; that is a decision to make.");
w("4. **Seed buying is what moves the price, and it dominates the price outcome.** Launch creators buying MCHOW to seed their pools is the only sustained net buying the launchpad adds; in the busy and steady cases it outweighs reward selling, team unlocks, and leak-back, so the price rises. That result is only as good as the launch-count and seed-size assumptions.");
w("5. **Two hops cost large trades a lot at minimum depth.** At the conservative minimum WETH, routing through MCHOW adds about 0.7% to a $100 trade but 4.4% to $1,000 and 17.9% to $5,000 (§3). Large trades will avoid MCHOW-quoted tokens unless MCHOW/WETH is deeper than the launch minimum, which lowers the realistic routed share.");
w("6. **The ¼×–4× range survives moderate stress but not heavy stress.** Extra selling of up to $2,000/month for six months keeps the price inside the range (lowest −68%); $5,000/month drives it below ¼×, where the locked position adds no depth for 51 months and a $1,000 trade costs about 44% (§4).");
w("7. **Heavier reward selling changes little under R3** (§5): with the community allocation folded into rewards, reward selling is a smaller share of total selling.");
w("8. **The DEX earns nothing.** With no platform fee, the launchpad can succeed for MCHOW holders and LPs while producing no revenue for the platform (§6).");
w();
w("## 8. Assumptions");
w();
w("| Organic | Volume/mo | Outside LPs | Net flow / volume | Hurdle | Rewards sold | Team-unlock sold/mo |");
w("| --- | --- | --- | --- | --- | --- | --- |");
for (const o of ORGANIC) w(`| ${o.name} | ${usd(o.volumeUsd)} | ${o.outsideLps} | ${pct(o.netFlowShare)} | ${pct(o.hurdleApy)} | ${pct(o.rewardSellShare)} | ${pct(o.sellPropensity)} |`);
w();
w(`- Launchpad inputs (§1) are hypothetical. Routed trades add canonical volume equal to their size and no net flow; seed buying is net buying; ${"project-pool MCHOW leaks back as net selling at the stated monthly rate"}.`);
w(`- The outside-LP capital ceiling grows by ${usd(A.extraLpUsdPerVolumeUsd)} per $1 of monthly routed volume (more activity, more potential LPs). All other assumptions as in v0.2 and v0.3.`);
w("- Not modelled: launched-token price dynamics, competing pools for launched tokens, platform fees, staking-related supply changes, MEV, gas.");
w();

const path = resolve(process.cwd(), "docs/MCHOW-ECONOMIC-MODEL-v0.4.md");
writeFileSync(path, `${out.join("\n")}\n`);
console.log(`wrote ${path}`);
