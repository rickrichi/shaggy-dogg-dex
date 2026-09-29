import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { getContracts, isDeployedOnChain } from "@/lib/contracts";

describe("Base Sepolia Deployment & Artifacts Verification", () => {
  it("verifies compiled GovernanceToken and FeeDiscountStaking artifacts exist", () => {
    const root = process.cwd();
    const govTokenPath = path.resolve(root, "contracts/out/GovernanceToken.json");
    const stakingPath = path.resolve(root, "contracts/out/FeeDiscountStaking.json");

    expect(fs.existsSync(govTokenPath)).toBe(true);
    expect(fs.existsSync(stakingPath)).toBe(true);

    const govToken = JSON.parse(fs.readFileSync(govTokenPath, "utf8"));
    expect(govToken.contractName).toBe("GovernanceToken");
    expect(govToken.bytecode).toMatch(/^0x[0-9a-f]+$/i);
    expect(govToken.abi.length).toBeGreaterThan(10);
  });

  it("verifies Base Sepolia (Chain ID 84532) contract registration", () => {
    expect(isDeployedOnChain(84532)).toBe(true);
    const contracts = getContracts(84532);
    expect(contracts).toBeDefined();

    if (contracts) {
      expect(isAddress(contracts.GovernanceToken)).toBe(true);
      expect(isAddress(contracts.FeeDiscountStaking)).toBe(true);
      expect(isAddress(contracts.deployer)).toBe(true);
      expect(contracts.deployedAt).toBeGreaterThan(0);
    }
  });

  it("verifies deployment record structure in deployments/base-sepolia.json", () => {
    const root = process.cwd();
    const deploymentPath = path.resolve(root, "deployments/base-sepolia.json");
    expect(fs.existsSync(deploymentPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    expect(data.chainId).toBe(84532);
    expect(data.network).toBe("base-sepolia");
    expect(isAddress(data.contracts.GovernanceToken)).toBe(true);
    expect(isAddress(data.contracts.FeeDiscountStaking)).toBe(true);
    expect(data.verification.solcVersion).toBe("0.8.36");
  });
});
