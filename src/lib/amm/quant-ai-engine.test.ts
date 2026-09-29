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

  it("Directive 338: executes authentic on-chain cross-DEX triangular arbitrage solver (WETH->USDC->DAI->WETH)", () => {
    // Chapter 4 Directive 338 canonical test vector
    const arb = ShaggyDoggQuantAiEngine.calculateCrossDexTriangularArbitrage({
      wethUsdcPrice: 2500.0,
      usdcDaiRate: 1.002,
      daiWethRate: 0.000405,
      initialWeth: 10.0,
      poolFeeBps: 30.0,
      gasCostUsd: 25.0,
    });

    expect(arb.pairRoute).toBe("WETH->USDC->DAI->WETH");
    expect(arb.initialCapital).toBe(10.0);
    expect(arb.terminalCapital).toBeCloseTo(10.0542, 3);
    expect(arb.grossProfit).toBeCloseTo(0.0542, 3);
    expect(arb.gasCostUsd).toBe(25.0);
    expect(arb.netProfit).toBeCloseTo(0.0442, 3);
    expect(arb.roiBps).toBeCloseTo(44.22, 1);
    expect(arb.arbitrageDetected).toBe(true);
    expect(arb.decision).toBe("EXECUTE_TRIANGULAR_ARBITRAGE");

    // Negative case: low exchange rate leads to unprofitable path
    const unprofitable = ShaggyDoggQuantAiEngine.calculateCrossDexTriangularArbitrage({
      wethUsdcPrice: 2500.0,
      usdcDaiRate: 1.000,
      daiWethRate: 0.000398,
      initialWeth: 10.0,
      poolFeeBps: 30.0,
      gasCostUsd: 25.0,
    });

    expect(unprofitable.arbitrageDetected).toBe(false);
    expect(unprofitable.decision).toBe("ARBITRAGE_UNPROFITABLE_AFTER_GAS");
  });

  it("evaluates decentralized dual-pool cross-DEX spread across Base on-chain pools", () => {
    // Comparison between Uniswap V2 and Aerodrome on Base L2
    const narrowSpread = ShaggyDoggQuantAiEngine.calculateDualPoolCrossDexSpread({
      poolAPrice: 3450.0,
      poolBPrice: 3465.0,
      amountUnits: 1.0,
      poolAFeeRate: 0.0030,
      poolBFeeRate: 0.0030,
      l2GasUsd: 0.08,
    });

    expect(narrowSpread.grossSpread).toBe(15.0);
    expect(narrowSpread.poolAFeeUsd).toBeCloseTo(10.35, 2);
    expect(narrowSpread.poolBFeeUsd).toBeCloseTo(10.35, 2);
    // Net profit = 15 - 10.35 - 10.35 - 0.08 = -5.78 (pool fees exceed spread)
    expect(narrowSpread.isProfitable).toBe(false);
    expect(narrowSpread.optimalRoute).toBe("NONE");

    // Wide spread scenario where net profit exceeds dual pool fees and L2 gas
    const wideSpread = ShaggyDoggQuantAiEngine.calculateDualPoolCrossDexSpread({
      poolAPrice: 3450.0,
      poolBPrice: 3485.0,
      amountUnits: 1.0,
      poolAFeeRate: 0.0030,
      poolBFeeRate: 0.0030,
      l2GasUsd: 0.08,
    });

    expect(wideSpread.grossSpread).toBe(35.0);
    expect(wideSpread.netProfitUsd).toBeGreaterThan(14.0);
    expect(wideSpread.isProfitable).toBe(true);
    expect(wideSpread.optimalRoute).toBe("BUY_POOL_A_SELL_POOL_B");
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
