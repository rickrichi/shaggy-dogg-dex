/**
 * ShaggyDoggDEX QuantAI Engine
 *
 * Implements independent Quantitative AI & Algorithmic Operations for the
 * Decentralized Market Periphery organ, strictly bound to the institutional
 * Lumioro Quant Manual:
 *
 *  - Directive 336: Constant Product AMM Slippage & Execution Yield (R_in * R_out = k)
 *  - Directive 337: Concentrated Liquidity Virtual Reserves & Capital Efficiency
 *  - Directive 338: Cross-DEX Triangular Arbitrage Solver & Decentralized Spread Optimizer
 *  - Directive 339: L2 Execution Gas & Priority Fee Optimizer (EIP-1559 Base L2)
 *  - Directive 341: Impermanent Loss & Volatility Divergence Risk Matrix
 *
 * NOTE: Shaggy-Dogg-DEX is strictly decentralized on Base L2 and operates
 * completely independent of the Alpaca API and centralized broker rails.
 */

export interface AmmSlippageInput {
  readonly reserveIn: number;
  readonly reserveOut: number;
  readonly amountIn: number;
  readonly feeBps?: number; // default 30 (0.30%)
}

export interface AmmSlippageResult {
  readonly tokenInAmount: number;
  readonly tokenOutAmount: number;
  readonly referencePrice: number; // reserveIn / reserveOut
  readonly executionPrice: number; // amountIn / amountOut
  readonly priceImpactPct: number; // ((executionPrice - referencePrice) / referencePrice) * 100
  readonly feePaid: number;
}

export interface CrossDexArbitrageInput {
  readonly wethUsdcPrice: number;
  readonly usdcDaiRate: number;
  readonly daiWethRate: number;
  readonly initialWeth?: number;
  readonly poolFeeBps?: number;
  readonly gasCostUsd?: number;
}

export interface CrossDexArbitrageResult {
  readonly pairRoute: "WETH->USDC->DAI->WETH";
  readonly initialCapital: number;
  readonly terminalCapital: number;
  readonly grossProfit: number;
  readonly gasCostUsd: number;
  readonly netProfit: number;
  readonly roiBps: number;
  readonly arbitrageDetected: boolean;
  readonly decision: "EXECUTE_TRIANGULAR_ARBITRAGE" | "ARBITRAGE_UNPROFITABLE_AFTER_GAS";
}

export interface DualPoolCrossDexInput {
  readonly poolAPrice: number;
  readonly poolBPrice: number;
  readonly amountUnits?: number;
  readonly poolAFeeRate?: number; // default 0.0030 (0.30%)
  readonly poolBFeeRate?: number; // default 0.0030 (0.30%)
  readonly l2GasUsd?: number;     // default 0.08 ($0.08)
}

export interface DualPoolCrossDexResult {
  readonly grossSpread: number;
  readonly grossSpreadPct: number;
  readonly poolAFeeUsd: number;
  readonly poolBFeeUsd: number;
  readonly l2GasUsd: number;
  readonly netProfitUsd: number;
  readonly netSpreadPct: number;
  readonly isProfitable: boolean;
  readonly optimalRoute: "BUY_POOL_A_SELL_POOL_B" | "BUY_POOL_B_SELL_POOL_A" | "NONE";
}

export interface L2GasEstimateInput {
  readonly baseFeeGwei: number;
  readonly priorityFeeGwei: number;
  readonly gasLimit: number;
  readonly ethPriceUsd: number;
  readonly l1DataFeeGwei?: number;
}

export interface L2GasEstimateResult {
  readonly totalFeeEth: number;
  readonly totalFeeUsd: number;
  readonly l2ExecutionFeeEth: number;
  readonly l1DataFeeEth: number;
  readonly recommendedMaxFeeGwei: number;
}

export interface ImpermanentLossResult {
  readonly priceRatio: number; // P_t / P_0
  readonly impermanentLossPct: number; // negative percentage
  readonly holdValueUsd: number;
  readonly lpValueUsd: number;
}

export class ShaggyDoggQuantAiEngine {
  /**
   * Directive 336: Constant Product AMM Slippage
   * Computes realized output yield and price impact under constant-product invariant R_in * R_out = k.
   */
  public static calculateConstantProductSlippage(input: AmmSlippageInput): AmmSlippageResult {
    const { reserveIn, reserveOut, amountIn, feeBps = 30 } = input;
    if (reserveIn <= 0 || reserveOut <= 0 || amountIn <= 0) {
      throw new Error("Reserves and trade amount must be positive.");
    }

    const feeRate = feeBps / 10_000;
    const feePaid = amountIn * feeRate;
    const netAmountIn = amountIn - feePaid;
    const k = reserveIn * reserveOut;
    const newReserveIn = reserveIn + netAmountIn;
    const newReserveOut = k / newReserveIn;
    const tokenOutAmount = reserveOut - newReserveOut;

    if (tokenOutAmount <= 0) {
      throw new Error("Trade size exceeds liquidity reserve capacity.");
    }

    const referencePrice = reserveIn / reserveOut;
    const executionPrice = amountIn / tokenOutAmount;
    const priceImpactPct = ((executionPrice - referencePrice) / referencePrice) * 100;

    return {
      tokenInAmount: amountIn,
      tokenOutAmount,
      referencePrice,
      executionPrice,
      priceImpactPct,
      feePaid,
    };
  }

  /**
   * Directive 337: Concentrated Liquidity Capital Efficiency Multiplier
   * Computes virtual reserve multiplier over price interval [lowerPrice, upperPrice].
   */
  public static calculateConcentratedLiquidityMultiplier(lowerPrice: number, upperPrice: number): number {
    if (lowerPrice <= 0 || upperPrice <= lowerPrice) {
      throw new Error("Upper price must be strictly greater than lower price, and both positive.");
    }
    const ratioSqrt = Math.sqrt(lowerPrice / upperPrice);
    const denominator = 1 - ratioSqrt;
    if (denominator <= 0) return Infinity;
    return 1 / denominator;
  }

  /**
   * Directive 338: Cross-DEX Triangular Arbitrage Solver
   * Solves cyclical cyclic liquidity path WETH -> USDC -> DAI -> WETH accounting for multi-pool fee drag
   * and L2 execution gas cost. Formulated directly from Chapter 4 Directive 338 of the Lumioro Quant Manual.
   */
  public static calculateCrossDexTriangularArbitrage(
    input: CrossDexArbitrageInput
  ): CrossDexArbitrageResult {
    const {
      wethUsdcPrice,
      usdcDaiRate,
      daiWethRate,
      initialWeth = 10.0,
      poolFeeBps = 30.0,
      gasCostUsd = 25.0,
    } = input;

    if (wethUsdcPrice <= 0 || usdcDaiRate <= 0 || daiWethRate <= 0 || initialWeth <= 0) {
      throw new Error("Prices, exchange rates, and initial capital must be strictly positive.");
    }

    const feeFactor = 1.0 - (poolFeeBps / 10000.0);
    const usdc = initialWeth * wethUsdcPrice * feeFactor;
    const dai = usdc * usdcDaiRate * feeFactor;
    const termWeth = dai * daiWethRate * feeFactor;

    const grossProfit = termWeth - initialWeth;
    const gasWeth = gasCostUsd / wethUsdcPrice;
    const netProfit = grossProfit - gasWeth;
    const roiBps = (netProfit / initialWeth) * 10000.0;
    const arbitrageDetected = netProfit > 0.0;

    return {
      pairRoute: "WETH->USDC->DAI->WETH",
      initialCapital: initialWeth,
      terminalCapital: termWeth,
      grossProfit,
      gasCostUsd,
      netProfit,
      roiBps,
      arbitrageDetected,
      decision: arbitrageDetected ? "EXECUTE_TRIANGULAR_ARBITRAGE" : "ARBITRAGE_UNPROFITABLE_AFTER_GAS",
    };
  }

  /**
   * Decentralized Dual-Pool Cross-DEX Spread Solver
   * Computes net cross-venue spread between two decentralized on-chain liquidity pools
   * (e.g. Uniswap V2 vs Aerodrome on Base L2) strictly independent of centralized broker APIs.
   */
  public static calculateDualPoolCrossDexSpread(input: DualPoolCrossDexInput): DualPoolCrossDexResult {
    const {
      poolAPrice,
      poolBPrice,
      amountUnits = 1.0,
      poolAFeeRate = 0.0030,
      poolBFeeRate = 0.0030,
      l2GasUsd = 0.08,
    } = input;

    if (poolAPrice <= 0 || poolBPrice <= 0 || amountUnits <= 0) {
      throw new Error("Pool prices and trade units must be positive.");
    }

    const priceDiff = poolBPrice - poolAPrice;
    let optimalRoute: DualPoolCrossDexResult["optimalRoute"] = "NONE";
    let basePriceForFees = poolAPrice;

    if (priceDiff > 0) {
      // Pool B is higher: Buy on Pool A, sell on Pool B
      optimalRoute = "BUY_POOL_A_SELL_POOL_B";
      basePriceForFees = poolAPrice;
    } else if (priceDiff < 0) {
      // Pool A is higher: Buy on Pool B, sell on Pool A
      optimalRoute = "BUY_POOL_B_SELL_POOL_A";
      basePriceForFees = poolBPrice;
    }

    const grossSpreadPerUnit = Math.abs(priceDiff);
    const grossSpreadTotal = grossSpreadPerUnit * amountUnits;
    const grossSpreadPct = (grossSpreadPerUnit / basePriceForFees) * 100;

    const notional = basePriceForFees * amountUnits;
    const poolAFeeUsd = notional * poolAFeeRate;
    const poolBFeeUsd = notional * poolBFeeRate;
    const netProfitUsd = grossSpreadTotal - poolAFeeUsd - poolBFeeUsd - l2GasUsd;
    const netSpreadPct = (netProfitUsd / notional) * 100;
    const isProfitable = netProfitUsd > 0;

    return {
      grossSpread: grossSpreadTotal,
      grossSpreadPct,
      poolAFeeUsd,
      poolBFeeUsd,
      l2GasUsd,
      netProfitUsd,
      netSpreadPct,
      isProfitable,
      optimalRoute: isProfitable ? optimalRoute : "NONE",
    };
  }

  /**
   * Directive 339: L2 Gas & Priority Fee Optimizer
   * Calculates Base L2 execution fees and L1 DA commitment fees.
   */
  public static estimateL2ExecutionFee(input: L2GasEstimateInput): L2GasEstimateResult {
    const {
      baseFeeGwei,
      priorityFeeGwei,
      gasLimit,
      ethPriceUsd,
      l1DataFeeGwei = 0.1,
    } = input;

    if (baseFeeGwei < 0 || priorityFeeGwei < 0 || gasLimit <= 0 || ethPriceUsd <= 0) {
      throw new Error("Invalid gas or pricing parameters.");
    }

    const effectiveGasPriceGwei = baseFeeGwei + priorityFeeGwei;
    const l2ExecutionFeeEth = (effectiveGasPriceGwei * gasLimit) / 1e9;
    const l1DataFeeEth = (l1DataFeeGwei * gasLimit) / 1e9;
    const totalFeeEth = l2ExecutionFeeEth + l1DataFeeEth;
    const totalFeeUsd = totalFeeEth * ethPriceUsd;
    const recommendedMaxFeeGwei = (baseFeeGwei * 1.25) + priorityFeeGwei;

    return {
      totalFeeEth,
      totalFeeUsd,
      l2ExecutionFeeEth,
      l1DataFeeEth,
      recommendedMaxFeeGwei,
    };
  }

  /**
   * Directive 341: Impermanent Loss & Volatility Risk Matrix
   * Computes IL(r) = (2 * sqrt(r) / (1 + r)) - 1 where r = P_t / P_0.
   */
  public static calculateImpermanentLoss(
    priceRatio: number,
    initialDepositUsd: number = 1000
  ): ImpermanentLossResult {
    if (priceRatio <= 0) {
      throw new Error("Price ratio must be positive.");
    }

    const sqrtR = Math.sqrt(priceRatio);
    const ratioFactor = (2 * sqrtR) / (1 + priceRatio);
    const impermanentLossPct = (ratioFactor - 1) * 100; // negative or 0

    // Hold portfolio value = 50% cash + 50% asset = 0.5 * V0 + 0.5 * V0 * r
    const holdValueUsd = 0.5 * initialDepositUsd * (1 + priceRatio);
    const lpValueUsd = holdValueUsd * ratioFactor;

    return {
      priceRatio,
      impermanentLossPct,
      holdValueUsd,
      lpValueUsd,
    };
  }
}
