import { describe, expect, it } from "vitest";
import { ShaggyDoggQuantAiEngine } from "./quant-ai-engine";

describe("ShaggyDoggQuantAiEngine (Quant Manual Directives 336-341)", () => {
  it("Directive 336: computes constant product AMM slippage and execution price accurately", () => {
    // 50,000,000 USDC / 20,000 WETH (reference price: 2,500 USDC/WETH)
    // Swap 5,000,000 USDC with 30 bps fee (Directive 336 test vector from Chapter 4)
    const result = ShaggyDoggQuantAiEngine.calculateConstantProductSlippage({
      reserveIn: 50_000_000,
      reserveOut: 20_000,
      amountIn: 5_000_000,
      feeBps: 30,
    });

    expect(result.tokenInAmount).toBe(5_000_000);
    expect(result.referencePrice).toBe(2500);
    expect(result.tokenOutAmount).toBeCloseTo(1813.22, 1);
    expect(result.executionPrice).toBeGreaterThan(2500);
    expect(result.priceImpactPct).toBeCloseTo(10.3, 1);
    expect(result.feePaid).toBe(15_000);
  });

  it("Directive 337: calculates concentrated liquidity virtual capital multiplier", () => {
    // Range [2000, 3000] -> ratio sqrt = sqrt(2000/3000) ~ 0.8165 -> 1 / (1 - 0.8165) ~ 5.45
    const multiplier = ShaggyDoggQuantAiEngine.calculateConcentratedLiquidityMultiplier(2000, 3000);
    expect(multiplier).toBeGreaterThan(5.0);
    expect(multiplier).toBeLessThan(6.0);
  });

  it("Directive 338: solves CeDeFi triangular arbitrage net edge across Alpaca and Base AMM", () => {
    // Case 1: Profitable spread (DEX higher by $15)
    const profitable = ShaggyDoggQuantAiEngine.calculateCeDeFiArbitrageSpread({
      alpacaPrice: 3450.0,
      dexPrice: 3465.0,
      amountUnits: 1.0,
      takerFeeRate: 0.0015,
      poolFeeRate: 0.003,
      l2GasUsd: 0.08,
    });

    expect(profitable.grossSpread).toBe(15.0);
    expect(profitable.takerFeeUsd).toBeCloseTo(5.175, 2);
    expect(profitable.poolFeeUsd).toBeCloseTo(10.35, 2);
    // Net profit = 15 - 5.175 - 10.35 - 0.08 = -0.605 (fees exceed spread!)
    expect(profitable.isProfitable).toBe(false);

    // Case 2: Sufficient spread to cover all fees and gas ($25 spread)
    const wideSpread = ShaggyDoggQuantAiEngine.calculateCeDeFiArbitrageSpread({
      alpacaPrice: 3450.0,
      dexPrice: 3475.0,
      amountUnits: 1.0,
      takerFeeRate: 0.0015,
      poolFeeRate: 0.003,
      l2GasUsd: 0.08,
    });

    expect(wideSpread.grossSpread).toBe(25.0);
    expect(wideSpread.netProfitUsd).toBeGreaterThan(9.0);
    expect(wideSpread.isProfitable).toBe(true);
    expect(wideSpread.optimalRoute).toBe("BUY_ALPACA_SELL_DEX");
  });

  it("Directive 339: calculates L2 gas and priority fee estimates for Base L2", () => {
    const gas = ShaggyDoggQuantAiEngine.estimateL2ExecutionFee({
      baseFeeGwei: 0.05,
      priorityFeeGwei: 0.02,
      gasLimit: 150_000,
      ethPriceUsd: 3500,
    });

    expect(gas.totalFeeEth).toBeGreaterThan(0);
    expect(gas.totalFeeUsd).toBeLessThan(0.50); // Base L2 fees are typically cents
    expect(gas.recommendedMaxFeeGwei).toBeCloseTo(0.0825, 3);
  });

  it("Directive 341: accurately models impermanent loss across volatility ratios", () => {
    // No price change (r = 1.0) -> 0% loss
    const noChange = ShaggyDoggQuantAiEngine.calculateImpermanentLoss(1.0);
    expect(noChange.impermanentLossPct).toBe(0);

    // 1.25x price change -> ~ -0.6%
    const smallChange = ShaggyDoggQuantAiEngine.calculateImpermanentLoss(1.25);
    expect(smallChange.impermanentLossPct).toBeCloseTo(-0.618, 2);

    // 2.0x price change -> ~ -5.72%
    const doublePrice = ShaggyDoggQuantAiEngine.calculateImpermanentLoss(2.0);
    expect(doublePrice.impermanentLossPct).toBeCloseTo(-5.72, 2);
  });
});
