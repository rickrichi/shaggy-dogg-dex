import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ShaggyDoggQuantAiEngine,
  type AaveFlashArbitrageInput,
  type YieldVaultProjectionInput,
} from "./quant-ai-engine";

describe("Aave Flash Liquidity & Yield Staking Vault Integrations", () => {
  describe("Directive 340: Aave Flash Loan Arbitrage Solver", () => {
    it("correctly models Aave v3 5 bps premium and executes profitable triangular arbitrage", () => {
      const input: AaveFlashArbitrageInput = {
        borrowAsset: "WETH",
        borrowAmount: 50.0, // Borrow 50 WETH
        flashPremiumBps: 5, // 0.05%
        sdStakedTier: 0, // No SD stake discount
        triangularRoute: {
          wethUsdcPrice: 3000.0,
          usdcDaiRate: 1.004, // slight discrepancy
          daiWethRate: 1 / 2980.0,
          basePoolFeeBps: 10, // 0.10% pool fee
        },
        gasCostUsd: 0.15,
      };

      const result = ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage(input);

      expect(result.borrowAmount).toBe(50.0);
      expect(result.flashLoanPremium).toBeCloseTo(0.025, 4); // 50 * 0.0005 = 0.025 WETH
      expect(result.repaymentRequired).toBeCloseTo(50.025, 4);
      expect(result.grossArbitrageReturn).toBeGreaterThan(result.repaymentRequired);
      expect(result.netProfit).toBeGreaterThan(0);
      expect(result.isProfitable).toBe(true);
      expect(result.decision).toBe("EXECUTE_FLASH_ARBITRAGE");
    });

    it("demonstrates SD staking tiers increasing net arbitrage profits by discounting pool fees", () => {
      const baseRoute = {
        wethUsdcPrice: 3000.0,
        usdcDaiRate: 1.003,
        daiWethRate: 1 / 2990.0,
        basePoolFeeBps: 30, // 0.30%
      };

      // Tier 0: No discount
      const tier0 = ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
        borrowAsset: "WETH",
        borrowAmount: 100.0,
        sdStakedTier: 0,
        triangularRoute: baseRoute,
      });

      // Tier 3: 50% fee discount (500 bps)
      const tier3 = ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
        borrowAsset: "WETH",
        borrowAmount: 100.0,
        sdStakedTier: 3,
        triangularRoute: baseRoute,
      });

      // Tier 4: 100% fee discount (1000 bps)
      const tier4 = ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
        borrowAsset: "WETH",
        borrowAmount: 100.0,
        sdStakedTier: 4,
        triangularRoute: baseRoute,
      });

      expect(tier0.effectivePoolFeeBps).toBe(30);
      expect(tier3.effectivePoolFeeBps).toBe(15);
      expect(tier4.effectivePoolFeeBps).toBe(0);

      // Higher tier yields strictly higher net profit
      expect(tier3.netProfit).toBeGreaterThan(tier0.netProfit);
      expect(tier4.netProfit).toBeGreaterThan(tier3.netProfit);
    });

    it("flags unprofitable flash arbitrage when spread does not cover flash fee + gas", () => {
      const input: AaveFlashArbitrageInput = {
        borrowAsset: "WETH",
        borrowAmount: 10.0,
        flashPremiumBps: 5,
        sdStakedTier: 0,
        triangularRoute: {
          wethUsdcPrice: 3000.0,
          usdcDaiRate: 1.0, // perfectly balanced
          daiWethRate: 1 / 3000.0,
          basePoolFeeBps: 30,
        },
        gasCostUsd: 0.50,
      };

      const result = ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage(input);

      expect(result.netProfit).toBeLessThan(0);
      expect(result.isProfitable).toBe(false);
      expect(result.decision).toBe("ARBITRAGE_UNPROFITABLE_AFTER_FEES");
    });
  });

  describe("Directive 342: Aave Yield-Staking Vault Share & Equity Revenue Modeling", () => {
    it("calculates annual yield and creator treasury equity performance fees", () => {
      const input: YieldVaultProjectionInput = {
        depositAmount: 100_000, // $100k USDC
        aaveApyPct: 5.0, // 5% APY on Aave v3 Base
        durationDays: 365,
        sdStakedTier: 0, // No SD staked -> full 10% performance fee
        basePerformanceFeeBps: 1000, // 10%
      };

      const projection = ShaggyDoggQuantAiEngine.calculateYieldVaultProjection(input);

      expect(projection.grossYield).toBe(5_000); // 5% of 100k
      expect(projection.creatorTreasuryRevenue).toBe(500); // 10% performance fee to creator
      expect(projection.netYieldToDepositor).toBe(4_500);
      expect(projection.netApyPct).toBeCloseTo(4.5, 2);
    });

    it("gives zero performance fee to maximum SD tier stakers while retaining full yield", () => {
      const input: YieldVaultProjectionInput = {
        depositAmount: 100_000,
        aaveApyPct: 5.0,
        durationDays: 365,
        sdStakedTier: 4, // Max tier (100% discount on performance fees)
        basePerformanceFeeBps: 1000,
      };

      const projection = ShaggyDoggQuantAiEngine.calculateYieldVaultProjection(input);

      expect(projection.effectivePerformanceFeeBps).toBe(0);
      expect(projection.creatorTreasuryRevenue).toBe(0);
      expect(projection.netYieldToDepositor).toBe(5_000);
      expect(projection.netApyPct).toBe(5.0);
    });
  });

  describe("Compiled Smart Contract Artifacts Verification", () => {
    it("verifies AaveFlashBorrower artifact compiled cleanly with bytecode", () => {
      const artifactPath = path.resolve(process.cwd(), "contracts/out/AaveFlashBorrower.json");
      expect(fs.existsSync(artifactPath)).toBe(true);

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      expect(artifact.contractName).toBe("AaveFlashBorrower");
      expect(artifact.bytecode.length).toBeGreaterThan(100);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "executeOperation")).toBe(true);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "requestFlashLoan")).toBe(true);
    });

    it("verifies YieldStakingVault artifact compiled cleanly with bytecode", () => {
      const artifactPath = path.resolve(process.cwd(), "contracts/out/YieldStakingVault.json");
      expect(fs.existsSync(artifactPath)).toBe(true);

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      expect(artifact.contractName).toBe("YieldStakingVault");
      expect(artifact.bytecode.length).toBeGreaterThan(100);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "deposit")).toBe(true);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "withdraw")).toBe(true);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "totalAssets")).toBe(true);
    });

    it("verifies CompoundYieldVault artifact compiled cleanly with bytecode", () => {
      const artifactPath = path.resolve(process.cwd(), "contracts/out/CompoundYieldVault.json");
      expect(fs.existsSync(artifactPath)).toBe(true);

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      expect(artifact.contractName).toBe("CompoundYieldVault");
      expect(artifact.bytecode.length).toBeGreaterThan(100);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "deposit")).toBe(true);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "withdraw")).toBe(true);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "totalAssets")).toBe(true);
    });

    it("verifies DeployEcosystem master factory artifact compiled cleanly with bytecode", () => {
      const artifactPath = path.resolve(process.cwd(), "contracts/out/DeployEcosystem.json");
      expect(fs.existsSync(artifactPath)).toBe(true);

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      expect(artifact.contractName).toBe("DeployEcosystem");
      expect(artifact.bytecode.length).toBeGreaterThan(1000);
      expect(artifact.abi.some((item: { name?: string }) => item.name === "run")).toBe(true);
    });
  });
});
