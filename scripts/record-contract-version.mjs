#!/usr/bin/env node
// Records the launchpad contract build at a git ref as approved for "Load my contract".
//
//   node scripts/record-contract-version.mjs <git-ref>
//
// Run this after regenerating src/lib/launchpad/artifacts.ts and committing it, or
// contract-versions.test.ts fails. Older builds stay listed, so earlier launches keep loading.
//
// Only record builds that fully work with the panels: a build missing a required function is
// refused below, and so is anything older than the vault fixes in FIRST_COMPATIBLE_BUILD.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { createPublicClient, encodeDeployData, http, keccak256, toFunctionSelector } from "viem";
import { base } from "viem/chains";

const REGISTRY = "src/lib/launchpad/contract-versions.json";
const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const AUSDC = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";
const COMET = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
// Stands in for the constructor value each build stores in its code, so it can be located.
const IMMUTABLE = "0xfeedfacefeedfacefeedfacefeedfacefeedface";

// The first build whose vaults have both the corrected discount scale and first-depositor protection.
const FIRST_COMPATIBLE_BUILD = "a46282f";

const VAULT_FUNCTIONS = [
  "underlyingAsset()",
  "discountDenominator()",
  "totalAssets()",
  "totalShares()",
  "sharesOf(address)",
  "performanceFeeBps()",
  "deposit(uint256)",
  "withdraw(uint256)",
];

const TEMPLATES = [
  {
    name: "FeeDiscountStaking",
    kind: "staking",
    args: [IMMUTABLE, OWNER, OWNER],
    required: ["token()", "admin()", "accruedFees()", "withdrawFees(address,uint256)"],
  },
  {
    name: "YieldStakingVault",
    kind: "aave-vault",
    args: [IMMUTABLE, AAVE_POOL, AUSDC, IMMUTABLE, OWNER, OWNER],
    required: [
      ...VAULT_FUNCTIONS,
      "paused()",
      "setPaused(bool)",
      "emergencyWithdrawFromAave(uint256)",
    ],
  },
  {
    name: "CompoundYieldVault",
    kind: "compound-vault",
    args: [IMMUTABLE, COMET, IMMUTABLE, OWNER, OWNER],
    required: [
      ...VAULT_FUNCTIONS,
      "paused()",
      "setPaused(bool)",
      "emergencyWithdrawFromComet(uint256)",
    ],
  },
  {
    name: "AtomicFlashArbitrageRouter",
    kind: "router",
    args: [AAVE_POOL, OWNER],
    required: ["admin()", "isOperator(address)", "rescueTokens(address,address,uint256)"],
  },
];

const ref = process.argv[2];
if (!ref) throw new Error("Usage: node scripts/record-contract-version.mjs <git-ref>");
const build = execFileSync("git", ["rev-parse", "--short", ref]).toString().trim();
try {
  execFileSync("git", ["merge-base", "--is-ancestor", FIRST_COMPATIBLE_BUILD, ref], {
    stdio: "ignore",
  });
} catch {
  throw new Error(
    `${build} predates ${FIRST_COMPATIBLE_BUILD} and is incompatible: refusing to record it.`
  );
}
const source = execFileSync("git", ["show", `${ref}:src/lib/launchpad/artifacts.ts`], {
  maxBuffer: 1e9,
}).toString();

function artifact(name) {
  const start = source.indexOf(`  ${name}: {`);
  if (start < 0) throw new Error(`${name} is not in ${build}`);
  const abiStart = source.indexOf("abi: ", start) + 5;
  const abi = JSON.parse(source.slice(abiStart, source.indexOf(" as unknown as Abi", abiStart)));
  const codeStart = source.indexOf('bytecode: "', abiStart) + 11;
  return { abi, bytecode: source.slice(codeStart, source.indexOf('"', codeStart)) };
}

const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));

for (const { name, kind, args, required } of TEMPLATES) {
  const { abi, bytecode } = artifact(name);
  const present = abi
    .filter((item) => item.type === "function")
    .map((item) => toFunctionSelector(item));
  const missing = required.filter((fn) => !present.includes(toFunctionSelector(`function ${fn}`)));
  if (missing.length) {
    console.log(`skip ${kind}@${build}: incompatible, missing ${missing.join(", ")}`);
    continue;
  }
  const creationHash = keccak256(bytecode);
  if (registry.some((entry) => entry.creationHash === creationHash)) {
    console.log(`have ${kind}@${build}`);
    continue;
  }
  const { data } = await client.call({
    account: OWNER,
    data: encodeDeployData({ abi, bytecode, args }),
  });
  const body = data.slice(2);
  const marker = IMMUTABLE.slice(2).padStart(64, "0");
  const immutables = [];
  for (let at = body.indexOf(marker); at >= 0; at = body.indexOf(marker, at + 64)) {
    if (at % 2 !== 0) throw new Error(`${name}: unaligned immutable`);
    immutables.push(at / 2);
  }
  const masked = `0x${immutables.reduce(
    (code, start) => code.slice(0, start * 2) + "0".repeat(64) + code.slice(start * 2 + 64),
    body
  )}`;
  registry.push({ kind, build, creationHash, codeHash: keccak256(masked), immutables });
  console.log(`added ${kind}@${build}, ${immutables.length} stored values`);
}

writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
