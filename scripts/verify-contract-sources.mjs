import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const pairs = [
  ["contracts/src/GovernanceToken.sol", "shaggy-dogg-sol_files/GovernanceToken.sol"],
  ["contracts/src/FeeDiscountStaking.sol", "shaggy-dogg-sol_files/FeeDiscountStaking.sol"],
  ["contracts/src/Deploy.sol", "shaggy-dogg-sol_files/Shaggy-Dogg-Dex.sol"],
];

const drifted = pairs.filter(([canonical, mirror]) => {
  const canonicalSource = readFileSync(resolve(root, canonical), "utf8").replaceAll("\r\n", "\n");
  const mirrorSource = readFileSync(resolve(root, mirror), "utf8").replaceAll("\r\n", "\n");
  return canonicalSource !== mirrorSource;
});

if (drifted.length > 0) {
  console.error("Contract source drift detected:");
  for (const [canonical, mirror] of drifted) {
    console.error("  " + canonical + " != " + mirror);
  }
  process.exit(1);
}

console.log("Contract source mirrors match the canonical contracts/src source.");
