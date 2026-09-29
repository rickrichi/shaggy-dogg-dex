/**
 * ShaggyDoggDEX QuantAI Engine
 *
 * Implements independent Quantitative AI & Algorithmic Operations for the
 * Decentralized Market Periphery organ, strictly bound to the institutional
 * Lumioro Quant Manual:
 *
 *  - Directive 336: Constant Product AMM Slippage & Execution Yield (R_in * R_out = k)
 *  - Directive 337: Concentrated Liquidity Virtual Reserves & Capital Efficiency
 *  - Directive 338: Cross-DEX & CeDeFi Triangular Arbitrage Spread Solver
 *  - Directive 339: L2 Execution Gas & Priority Fee Optimizer (EIP-1559 Base L2)
 *  - Directive 341: Impermanent Loss & Volatility Divergence Risk Matrix
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

export interface CeDeFiArbitrageInput {
  readonly alpacaPrice: number;
  readonly dexPrice: number;
  readonly amountUnits?: number;
  readonly takerFeeRate?: number; // default 0.0015 (0.15%)
  readonly poolFeeRate?: number;  // default 0.0030 (0.30%)
  readonly l2GasUsd?: number;     // default 0.08 ($0.08)
}

export interface CeDeFiArbitrageResult {
  readonly grossSpread: number;
  readonly grossSpreadPct: number;
  readonly takerFeeUsd: number;
  readonly poolFeeUsd: number;
  readonly l2GasUsd: number;
  readonly netProfitUsd: number;
  readonly netSpreadPct: number;
  readonly isProfitable: boolean;
  readonly optimalRoute: "BUY_ALPACA_SELL_DEX" | "BUY_DEX_SELL_ALPACA" | "NONE";
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
   * Directive 338: CeDeFi Triangular Arbitrage Solver
   * Computes net cross-venue spread between Alpaca centralized books and Base on-chain DEX pools.
   */
  public static calculateCeDeFiArbitrageSpread(input: CeDeFiArbitrageInput): CeDeFiArbitrageResult {
    const {
      alpacaPrice,
      dexPrice,
      amountUnits = 1.0,
      takerFeeRate = 0.0015,
      poolFeeRate = 0.0030,
      l2GasUsd = 0.08,
    } = input;

    if (alpacaPrice <= 0 || dexPrice <= 0 || amountUnits <= 0) {
      throw new Error("Prices and units must be positive.");
    }

    const priceDiff = dexPrice - alpacaPrice;
    let optimalRoute: CeDeFiArbitrageResult["optimalRoute"] = "NONE";
    let basePriceForFees = alpacaPrice;

    if (priceDiff > 0) {
      // DEX is higher: Buy on Alpaca, sell on DEX
      optimalRoute = "BUY_ALPACA_SELL_DEX";
      basePriceForFees = alpacaPrice;
    } else if (priceDiff < 0) {
      // Alpaca is higher: Buy on DEX, sell on Alpaca
      optimalRoute = "BUY_DEX_SELL_ALPACA";
      basePriceForFees = dexPrice;
    }

    const grossSpreadPerUnit = Math.abs(priceDiff);
    const grossSpreadTotal = grossSpreadPerUnit * amountUnits;
    const grossSpreadPct = (grossSpreadPerUnit / basePriceForFees) * 100;

    const notional = basePriceForFees * amountUnits;
    const takerFeeUsd = notional * takerFeeRate;
    const poolFeeUsd = notional * poolFeeRate;
    const netProfitUsd = grossSpreadTotal - takerFeeUsd - poolFeeUsd - l2GasUsd;
    const netSpreadPct = (netProfitUsd / notional) * 100;
    const isProfitable = netProfitUsd > 0;

    return {
      grossSpread: grossSpreadTotal,
      grossSpreadPct,
      takerFeeUsd,
      poolFeeUsd,
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
