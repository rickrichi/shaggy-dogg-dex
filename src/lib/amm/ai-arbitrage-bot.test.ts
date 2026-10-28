// src/lib/amm/ai-arbitrage-bot.test.ts
import { describe, expect, it } from "vitest";

import { AiArbitrageBotEngine, type BotConfig, type MarketSnapshot } from "./ai-arbitrage-bot";

describe("AiArbitrageBotEngine - Anti-Loss & Auto-Pilot Rules", () => {
  const defaultConfig: BotConfig = {
    minNetProfitUsd: 50.0,
    maxSlippageBps: 20, // 0.2%
    maxGasCeilingGwei: 0.05,
    strategies: {
      triangular: true,
      crossDex: true,
      flashLoan: true,
    },
    tradeCapitalEth: 5.0,
    flashBorrowUsdc: 100_000,
    vipTier: 3, // Gold VIP (50% fee discount)
  };

  const baseMarket: MarketSnapshot = {
    wethUsdcPrice: 3450.0,
    usdcCbbtcRate: 1.002,
    cbbtcWethRate: 1 / 3445.0,
    uniswapEthPrice: 3450.0,
    aerodromeEthPrice: 3452.0,
    currentGasGwei: 0.005,
    timestamp: 1790853000000,
  };

  it("strictly rejects execution when Base gas price exceeds safety ceiling", () => {
    const highGasMarket: MarketSnapshot = {
      ...baseMarket,
      currentGasGwei: 0.12, // Exceeds ceiling 0.05
    };

    const evaluation = AiArbitrageBotEngine.evaluateMarketOpportunity(defaultConfig, highGasMarket);

    expect(evaluation.qualified).toBe(false);
    expect(evaluation.disqualificationReason).toContain("exceeds max ceiling");
  });

  it("strictly rejects execution when net profit is negative or zero (Anti-Loss Rule)", () => {
    // Highly unfavorable rates where fees eat up the whole margin
    const negativeMarket: MarketSnapshot = {
      ...baseMarket,
      usdcCbbtcRate: 0.999, // Inverted
      cbbtcWethRate: 1 / 3460.0, // Inverted
      aerodromeEthPrice: 3450.0, // Zero spread
    };

    const evaluation = AiArbitrageBotEngine.evaluateMarketOpportunity(
      defaultConfig,
      negativeMarket
    );

    expect(evaluation.qualified).toBe(false);
    expect(evaluation.disqualificationReason).toContain("Anti-Loss Guard prevented transaction");
  });

  it("rejects execution when net profit is positive but below user target threshold", () => {
    const modestMarket: MarketSnapshot = {
      ...baseMarket,
      aerodromeEthPrice: 3485.0, // Yields ~$71 net profit, which is positive but below $500 target
    };

    const evaluation = AiArbitrageBotEngine.evaluateMarketOpportunity(
      { ...defaultConfig, minNetProfitUsd: 500.0 }, // Target $500
      modestMarket
    );

    expect(evaluation.qualified).toBe(false);
    expect(evaluation.disqualificationReason).toContain("below your minimum target");
  });

  it("qualifies opportunity for auto-execution when profit clears threshold and all anti-loss gates", () => {
    const wideSpreadMarket: MarketSnapshot = {
      ...baseMarket,
      uniswapEthPrice: 3400.0,
      aerodromeEthPrice: 3550.0, // Large $150 spread!
    };

    const evaluation = AiArbitrageBotEngine.evaluateMarketOpportunity(
      defaultConfig,
      wideSpreadMarket
    );

    expect(evaluation.qualified).toBe(true);
    expect(evaluation.projectedNetProfitUsd).toBeGreaterThan(defaultConfig.minNetProfitUsd);
    expect(evaluation.executionPlan).toBeDefined();
    expect(evaluation.confidenceScore).toBeGreaterThanOrEqual(95);
  });
});
