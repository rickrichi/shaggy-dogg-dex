import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("C:/Users/fbada/source/repos/lumioro/node_modules/solc");

const root = process.cwd();
const contractsDir = path.resolve(root, "contracts/src");
const outDir = path.resolve(root, "contracts/out");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log("Compiling Shaggy-Dogg-DEX contracts with solc " + solc.version() + "...");

const files = ["GovernanceToken.sol", "FeeDiscountStaking.sol", "Deploy.sol"];
const sources = {};

for (const file of files) {
  const filePath = path.resolve(contractsDir, file);
  let content = fs.readFileSync(filePath, "utf8");
  // Normalize pragma for compiler compatibility
  content = content.replace("pragma solidity 0.8.28;", "pragma solidity >=0.8.20 <0.8.37;");
  sources[file] = { content };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === "error");
  if (errors.length > 0) {
    console.error("Compilation errors:", errors);
    process.exit(1);
  }
}

for (const [file, contractObj] of Object.entries(output.contracts)) {
  for (const [contractName, artifact] of Object.entries(contractObj)) {
    const outData = {
      contractName,
      sourceFile: file,
      abi: artifact.abi,
      bytecode: "0x" + artifact.evm.bytecode.object,
      deployedBytecode: "0x" + artifact.evm.deployedBytecode.object,
      compilerVersion: solc.version(),
      compiledAt: new Date().toISOString(),
    };
    const outPath = path.resolve(outDir, `${contractName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(outData, null, 2), "utf8");
    console.log(` Compiled ${contractName} -> ${outPath} (${outData.bytecode.length} chars bytecode)`);
  }
}

console.log("All contracts compiled successfully!");
