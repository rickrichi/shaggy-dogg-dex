#!/usr/bin/env tsx
/**
 * MuttChow ($MCHOW) economic model, v0.3 — design changes and break-even demand.
 *
 *   npx tsx scripts/mchow-model/model-v0.3.ts       → writes docs/MCHOW-ECONOMIC-MODEL-v0.3.md
 *
 * Builds on v0.2 (same pool maths, gates, scenarios, LP behaviour) and tests three design changes:
 *   1. the protocol launch position in a wide concentrated range (¼× to 4× launch price) instead of
 *      full range — about twice the depth per dollar, so a smaller position for the same depth;
 *   2. the 15% community allocation folded into LP rewards instead of released and sold;
 *   3. break-even demand: the least organic net buying per month at which every gate passes.
 * Every behavioural number is an ASSUMPTION. Not a forecast.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOTAL_SUPPLY = 1_000_000_000_000;
const ETH_USD = 2_380;
const LP_FEE_SHARE = 5 / 6; // Base V3 feeProtocol 1/6, read on-chain 2026-10-23
const GATE_TRADE_USD = 1_000;
const GATE_MAX_IMPACT = 0.05;
const SHARE_GATE_M3 = 0.25;
// Sustainability criteria added in v0.3 (proposed, to be approved):
const MIN_PRICE_END = -0.5; // price at the program's end no worse than −50% from launch
const MIN_LP_RETENTION = 0.5; // ≥ 50% of outside-LP capital still present 6 months after rewards end
const MIN_LP_END_USD = 1_000;

const A = {
  avgLpPositionUsd: 1_500,
  rangeWidth: 0.5,
  inRangeShare: 0.75,
  entrySpeed: 0.4,
  exitSpeed: 0.7,
  startCommunityUsd: 300,
  monthsAfterProgram: 6,
  rewardRealisation: 0.75,
  feeTier: 0.003,
};

interface Scenario {
  readonly name: string;
  readonly volumeUsd: number;
  readonly outsideLps: number;
  readonly netFlowShare: number;
  readonly hurdleApy: number;
  readonly rewardSellShare: number;
  readonly sellPropensity: number;
}
const SCENARIOS: readonly Scenario[] = [
  { name: "stress", volumeUsd: 10_000, outsideLps: 3.5, netFlowShare: -0.04, hurdleApy: 0.8, rewardSellShare: 1, sellPropensity: 0.25 },
  { name: "conservative", volumeUsd: 32_500, outsideLps: 7.5, netFlowShare: 0, hurdleApy: 0.6, rewardSellShare: 0.9, sellPropensity: 0.15 },
  { name: "base", volumeUsd: 100_000, outsideLps: 17.5, netFlowShare: 0.01, hurdleApy: 0.4, rewardSellShare: 0.7, sellPropensity: 0.1 },
  { name: "strong", volumeUsd: 325_000, outsideLps: 50, netFlowShare: 0.02, hurdleApy: 0.3, rewardSellShare: 0.5, sellPropensity: 0.06 },
];

interface Design {
  readonly key: string;
  readonly label: string;
  readonly protocolRange: number; // a: position covers [p/a, p·a]; Infinity = full range
  readonly rewardShare: number;
  readonly communityShare: number; // released and possibly sold
  readonly rewardMonths: number;
}
const DESIGNS: readonly Design[] = [
  { key: "ref", label: "v0.2 A48 reference: full range, community 15% released", protocolRange: Infinity, rewardShare: 0.45, communityShare: 0.15, rewardMonths: 48 },
  { key: "R1", label: "R1: protocol range ¼×–4×, community 15% released", protocolRange: 4, rewardShare: 0.45, communityShare: 0.15, rewardMonths: 48 },
  { key: "R2", label: "R2: full range, community folded into rewards (60%)", protocolRange: Infinity, rewardShare: 0.6, communityShare: 0, rewardMonths: 48 },
  { key: "R3", label: "R3: protocol range ¼×–4× and community folded into rewards (60%)", protocolRange: 4, rewardShare: 0.6, communityShare: 0, rewardMonths: 48 },
];

// ───────────────────────────── V3 maths (p = WETH per MCHOW) ─────────────────────────────
const fullRangeL = (valueUsd: number, P: number) => valueUsd / (2 * Math.sqrt(P * ETH_USD));
const efficiency = (r: number) => 1 / (1 - 1 / Math.sqrt(1 + r));

/** USD value of liquidity L in range [pa, pb] at price p (all in WETH per MCHOW). */
function positionValueUsd(L: number, p: number, pa: number, pb: number) {
  const sp = Math.sqrt(Math.min(Math.max(p, pa), pb));
  const x = L * (1 / sp - 1 / Math.sqrt(pb)); // MCHOW
  const y = L * (sp - Math.sqrt(pa)); // WETH
  return (x * p + y) * ETH_USD;
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
interface Result {
  launchImpact: number;
  maxImpact: number;
  shareM3: number;
  priceEnd: number;
  lpEnd: number;
  lpAfter: number;
  claimable: number;
  outOfRangeMonths: number;
}

function simulate(d: Design, sc: Scenario, E: number, netFlowShare = sc.netFlowShare, volumeUsd = sc.volumeUsd): Result {
  const months = d.rewardMonths + A.monthsAfterProgram;
  const e = efficiency(A.rangeWidth);
  const P0 = E / (0.2 * TOTAL_SUPPLY);
  const p0 = P0 / ETH_USD;
  const pa = Number.isFinite(d.protocolRange) ? p0 / d.protocolRange : 0;
  const pb = Number.isFinite(d.protocolRange) ? p0 * d.protocolRange : Infinity;
  // Liquidity from the WETH side: y = L(√p0 − √pa).
  const protocolL = E / ETH_USD / (Math.sqrt(p0) - Math.sqrt(pa));
  let P = P0;
  let C = A.startCommunityUsd;
  let overhang = 0;
  const capUsd = sc.outsideLps * A.avgLpPositionUsd;
  const commL = (cap: number, price: number) => A.inRangeShare * e * fullRangeL(cap, price);
  const activeProtocolL = (price: number) => {
    const p = price / ETH_USD;
    return p > pa && p < pb ? protocolL : 0;
  };
  const r: Result = {
    launchImpact: Math.max(execImpact(protocolL, P, GATE_TRADE_USD, "sell"), execImpact(protocolL, P, GATE_TRADE_USD, "buy")),
    maxImpact: 0, shareM3: 0, priceEnd: 0, lpEnd: 0, lpAfter: 0, claimable: 0, outOfRangeMonths: 0,
  };
  let emitted = 0;
  let claimed = 0;
  for (let m = 1; m <= months; m++) {
    const R = m <= d.rewardMonths ? ((d.rewardShare * TOTAL_SUPPLY) / d.rewardMonths) * (1.5 - (m - 1) / (d.rewardMonths - 1)) : 0;
    const pL = activeProtocolL(P);
    const shareAt = (cap: number) => {
      const c = commL(cap, P);
      return c + pL > 0 ? c / (c + pL) : 0;
    };
    const incomeAt = (cap: number) => (R * P * A.rewardRealisation + A.feeTier * LP_FEE_SHARE * volumeUsd) * shareAt(cap);
    let lo = 0;
    let hi = capUsd;
    for (let i = 0; i < 45; i++) {
      const mid = (lo + hi) / 2;
      if (mid > 0 && incomeAt(mid) / mid >= sc.hurdleApy / 12) lo = mid;
      else hi = mid;
    }
    C += (lo > C ? A.entrySpeed : A.exitSpeed) * (lo - C);
    const s = shareAt(C);
    emitted += R;
    claimed += R * s;
    overhang += (m > 12 && m <= 48 ? (0.05 * TOTAL_SUPPLY) / 36 : 0) + (m <= 48 ? (d.communityShare * TOTAL_SUPPLY) / 48 : 0);
    const sold = overhang * sc.sellPropensity;
    overhang -= sold;
    const pBefore = P;
    P = applyFlow(pL + commL(C, P), P, netFlowShare * volumeUsd - (R * s * sc.rewardSellShare + sold) * P);
    C *= 1 - Math.min(1, e * Math.abs(ilFull(P / pBefore))) * 0.5;
    const endL = activeProtocolL(P) + commL(C, P);
    if (activeProtocolL(P) === 0) r.outOfRangeMonths++;
    if (m <= d.rewardMonths) {
      r.maxImpact = Math.max(r.maxImpact, execImpact(endL, P, GATE_TRADE_USD, "sell"), execImpact(endL, P, GATE_TRADE_USD, "buy"));
    }
    if (m === 3) r.shareM3 = C / (C + positionValueUsd(protocolL, P / ETH_USD, pa, pb));
    if (m === d.rewardMonths) {
      r.priceEnd = P / P0 - 1;
      r.lpEnd = C;
    }
  }
  r.lpAfter = C;
  r.claimable = emitted > 0 ? claimed / emitted : 0;
  return r;
}

const depthOk = (r: Result) => r.launchImpact <= GATE_MAX_IMPACT && r.maxImpact <= GATE_MAX_IMPACT;
const failures = (r: Result) => {
  const f: string[] = [];
  if (!depthOk(r)) f.push("depth");
  if (r.shareM3 < SHARE_GATE_M3) f.push("share");
  if (r.priceEnd < MIN_PRICE_END) f.push("price");
  if (r.lpEnd < MIN_LP_END_USD || r.lpAfter < MIN_LP_RETENTION * r.lpEnd) f.push("LP retention");
  return f;
};
const viable = (r: Result) =>
  depthOk(r) &&
  r.shareM3 >= SHARE_GATE_M3 &&
  r.priceEnd >= MIN_PRICE_END &&
  r.lpEnd >= MIN_LP_END_USD &&
  r.lpAfter >= MIN_LP_RETENTION * r.lpEnd;

function minDepthWeth(d: Design, sc: Scenario, flow = sc.netFlowShare) {
  const ok = (E: number) => depthOk(simulate(d, sc, E, flow));
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

/**
 * Least net organic buying (share of volume) keeping the end price ≥ MIN_PRICE_END. Scans upward and
 * takes the first passing level, because extreme buying can push the price out of the protocol range
 * and break depth, so pass/fail is not monotone at the top.
 */
function priceBreakEven(d: Design, sc: Scenario) {
  const ok = (flow: number) => {
    const E = minDepthWeth(d, sc, flow);
    return E !== null && simulate(d, sc, E, flow).priceEnd >= MIN_PRICE_END;
  };
  const grid = [-0.1, -0.05, -0.02, -0.01, 0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 3];
  if (ok(grid[0]!)) return grid[0]!;
  for (let i = 1; i < grid.length; i++) {
    if (!ok(grid[i]!)) continue;
    let lo = grid[i - 1]!;
    let hi = grid[i]!;
    for (let j = 0; j < 24; j++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return null;
}

/** Least gross monthly volume at which outside LPs stay after rewards end (scenario's own net flow). */
function volumeBreakEven(d: Design, sc: Scenario) {
  const ok = (vol: number) => {
    const E = minDepthWeth(d, sc);
    if (E === null) return false;
    const r = simulate(d, sc, E, sc.netFlowShare, vol);
    return r.lpEnd >= MIN_LP_END_USD && r.lpAfter >= MIN_LP_RETENTION * r.lpEnd;
  };
  const MAX = 1_000_000_000;
  if (!ok(MAX)) return null;
  let lo = sc.volumeUsd;
  let hi = MAX;
  if (ok(lo)) return lo;
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
const out: string[] = [];
const w = (s = "") => out.push(s);

w("# MuttChow ($MCHOW) economic model — v0.3: design changes and break-even demand");
w();
w(`Generated by \`scripts/mchow-model/model-v0.3.ts\` on ${new Date().toISOString().slice(0, 10)}. Builds on [v0.2](./MCHOW-ECONOMIC-MODEL-v0.2.md): same pool maths, gates, scenarios, and LP behaviour; fee tier 0.30%; launch position retained; 48-month rewards.`);
w();
w("> **Status: research.** Not a forecast. The break-even figures say how much real demand the design");
w("> needs, not that the demand will exist.");
w();
w("## 1. Viability criteria");
w();
w(`A configuration is **viable** only if all hold: (1) a ${usd(GATE_TRADE_USD)} trade has ≤ ${pct(GATE_MAX_IMPACT)} execution impact both ways at launch and in every program month; (2) independent LP value ≥ ${pct(SHARE_GATE_M3)} by month 3; (3) price at the program's end ≥ ${pct(MIN_PRICE_END)} of launch; (4) outside LP capital ≥ ${usd(MIN_LP_END_USD)} at the end, and ≥ ${pct(MIN_LP_RETENTION)} of it still present 6 months after rewards stop. Criteria 3 and 4 are new in v0.3 and are proposals for approval.`);
w();
w("## 2. Each design at the scenario's own demand");
w();
w("| Design | Scenario | Min WETH for depth | Indep. share m3 | Price end | Outside LP end → +6 mo | Protocol out-of-range months | Fails on |");
w("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const d of DESIGNS) {
  for (const sc of SCENARIOS) {
    const E = minDepthWeth(d, sc);
    if (E === null) {
      w(`| ${d.key} | ${sc.name} | none ≤ $5M | — | — | — | — | depth |`);
      continue;
    }
    const r = simulate(d, sc, E);
    w(`| ${d.key} | ${sc.name} | ${usd(E)} | ${pct(r.shareM3)} | ${pct(r.priceEnd)} | ${usd(r.lpEnd)} → ${usd(r.lpAfter)} | ${r.outOfRangeMonths} | ${viable(r) ? "**viable**" : failures(r).join(", ")} |`);
  }
}
w();
w("## 3. What would have to be true: one break-even per criterion");
w();
w("Each column changes one input and holds the rest of the scenario fixed. They answer separately: how much net buying keeps the price from falling more than 50%; how much trading volume lets fees alone keep outside LPs after rewards end; and how much outside LP capital reaches a 25% share at launch.");
w();
w("| Design | Scenario | Net buying for price ≥ −50% | Volume for LPs to stay without rewards | Outside LP capital for 25% share |");
w("| --- | --- | --- | --- | --- |");
for (const d of DESIGNS) {
  for (const sc of SCENARIOS) {
    const pb = priceBreakEven(d, sc);
    const vb = volumeBreakEven(d, sc);
    const E = minDepthWeth(d, sc);
    const shareNeed = E === null ? "—" : `${usd((2 * E) / 3)} (≈ ${Math.ceil((2 * E) / 3 / A.avgLpPositionUsd)} LPs at ${usd(A.avgLpPositionUsd)})`;
    const priceCell = pb === null ? "none ≤ 3× volume" : `${usd(pb * sc.volumeUsd)}/mo (${pct(pb)} of volume)`;
    const volCell = vb === null ? "none ≤ $1B/mo" : `${usd(vb)}/mo (scenario: ${usd(sc.volumeUsd)})`;
    w(`| ${d.key} | ${sc.name} | ${priceCell} | ${volCell} | ${shareNeed} |`);
  }
}
w();
w("## 4. Findings (with the assumptions above; re-read the tables if they change)");
w();
w("1. **R3 is the strongest design tested**: the protocol position in a ¼×–4× range plus the community allocation folded into rewards. It roughly halves the WETH needed for the depth gate (conservative ≈ $11,700 instead of ≈ $38,800; base and strong ≈ $9,500 instead of $19,000) and, in the conservative scenario, turns a −76% end price into about −34%, which passes the price criterion.");
w("2. **Selling pressure is largely fixed by folding the community allocation into rewards.** With R3, the price criterion passes even with slight net selling in the conservative and base scenarios.");
w("3. **What still fails is LP economics, and it comes down to one number: trading volume.** Without rewards, outside LPs stay only if fees pay their hurdle. Under R3 that needs about $141,000/month of volume in the base scenario (assumed $100,000), about $221,000/month in the conservative scenario (assumed $32,500), and about $379,000/month in the strong scenario (assumed $325,000).");
w("4. **The outside-share gate is reachable in principle.** R3 needs about $7,800 of outside LP capital in the conservative scenario (≈ 6 LPs at $1,500, inside the 5–10 assumed), but LPs only arrive if returns meet their hurdle, which again depends on volume.");
w("5. **Range risk.** A ¼×–4× protocol position stops contributing depth if the price leaves the range: above 4× it holds only WETH, below ¼× only MCHOW. In the strong scenario that happened for most of the program; depth then relied on outside LPs.");
w("6. **The open demand question now has a target:** roughly $150,000–$220,000 of real monthly trading volume through the MCHOW pool, sustained after rewards decline. Whatever MCHOW is used for has to produce that.");
w();
w("## 5. Designs");
w();
for (const d of DESIGNS) w(`- **${d.key}**: ${d.label}.`);
w();
w("- A ¼×–4× protocol range has about 2× the depth of full range per dollar while the price stays inside it; below ¼× of the launch price (a 75% fall) it holds only MCHOW and adds no depth. Out-of-range months count that.");
w("- Folding the community allocation into rewards means it reaches only liquidity providers, over the same 48-month schedule, and no community tokens are released for sale.");
w("- All other assumptions are as in v0.2 §7.");
w();

const path = resolve(process.cwd(), "docs/MCHOW-ECONOMIC-MODEL-v0.3.md");
writeFileSync(path, `${out.join("\n")}\n`);
console.log(`wrote ${path}`);
