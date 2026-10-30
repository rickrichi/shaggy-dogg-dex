import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("contracts/out/SponsoredRewardPaymaster.sol/SponsoredRewardPaymaster.json");
const target = resolve("src/lib/paymaster/artifact.ts");
const compiled = JSON.parse(readFileSync(source, "utf8"));
const bytecode = compiled.bytecode?.object;
if (!Array.isArray(compiled.abi) || typeof bytecode !== "string" || !bytecode.startsWith("0x")) {
  throw new Error("Run `npm run contracts:compile` before generating the paymaster artifact.");
}
const output = `// Generated from contracts/src/SponsoredRewardPaymaster.sol. Do not edit by hand.\n` +
  `// Regenerate with: npm run paymaster:artifact\n` +
  `export const SPONSORED_REWARD_PAYMASTER_ABI = ${JSON.stringify(compiled.abi)} as const;\n` +
  `export const SPONSORED_REWARD_PAYMASTER_BYTECODE = ${JSON.stringify(bytecode)} as const;\n`;
mkdirSync(resolve("src/lib/paymaster"), { recursive: true });
writeFileSync(target, output);
console.log(`Wrote ${target}`);
