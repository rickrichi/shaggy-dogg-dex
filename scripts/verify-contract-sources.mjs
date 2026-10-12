import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const pairs = [
  ["contracts/src/FeeDiscountMath.sol", "shaggy-dogg-sol_files/FeeDiscountMath.sol"],
  ["contracts/src/GovernanceToken.sol", "shaggy-dogg-sol_files/GovernanceToken.sol"],
  ["contracts/src/FeeDiscountStaking.sol", "shaggy-dogg-sol_files/FeeDiscountStaking.sol"],
  ["contracts/src/Deploy.sol", "shaggy-dogg-sol_files/Shaggy-Dogg-Dex.sol"],
  ["contracts/src/AaveFlashBorrower.sol", "shaggy-dogg-sol_files/AaveFlashBorrower.sol"],
  ["contracts/src/YieldStakingVault.sol", "shaggy-dogg-sol_files/YieldStakingVault.sol"],
  ["contracts/src/CompoundYieldVault.sol", "shaggy-dogg-sol_files/CompoundYieldVault.sol"],
  ["contracts/src/DeployEcosystem.sol", "shaggy-dogg-sol_files/DeployEcosystem.sol"],
  ["contracts/src/Interfaces.sol", "shaggy-dogg-sol_files/Interfaces.sol"],
  ["contracts/src/AtomicFlashArbitrageRouter.sol", "shaggy-dogg-sol_files/AtomicFlashArbitrageRouter.sol"],
  ["contracts/src/V3PositionTimelock.sol", "shaggy-dogg-sol_files/V3PositionTimelock.sol"],
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
