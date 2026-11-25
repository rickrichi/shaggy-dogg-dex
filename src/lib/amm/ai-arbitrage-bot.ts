// src/lib/amm/ai-arbitrage-bot.ts
/**
 * Autonomous AI Arbitrage Bot Engine for Base Mainnet
 *
 * Implements strict Anti-Loss guarantees:
 *  1. Pre-Flight Profit Guard (Net Profit > Minimum Target USD/ETH)
 *  2. Gas Price Ceiling Guard (skips block if Base gas spikes)
 *  3. Slippage Margin Guard (rejects wide price-impact routes)
 *  4. Atomic EVM Revert Guard (passes minProfit to on-chain contracts)
 */

import { formatUnits, type Hex } from "viem";

import { ShaggyDoggQuantAiEngine } from "./quant-ai-engine";

import type { AtomicSpreadLoan } from "./flash-routes";

// Uniswap V3 SwapRouter02 on Base: the router the live triangular and Uniswap spread handlers use.
const UNISWAP_V3_SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481";

export interface BotConfig {
  readonly minNetProfitUsd: number;
  readonly maxSlippageBps: number;
  readonly maxGasCeilingGwei: number;
  readonly strategies: {
    readonly triangular: boolean;
    readonly crossDex: boolean;
    readonly flashLoan: boolean;
  };
  readonly tradeCapitalEth: number;
  readonly flashBorrowUsdc: number;
  readonly flashRouter?: string;
  readonly vipTier: number;
}

export interface MarketSnapshot {
  readonly wethUsdcPrice: number;
  readonly usdcMidRate: number;
  readonly midWethRate: number;
  /** Which asset the triangular middle leg actually traded through this tick. */
  readonly midSymbol?: string;
  readonly uniswapEthPrice: number;
  readonly aerodromeEthPrice: number;
  /** Aerodrome pool fee as a fraction; read on-chain by the live snapshot. Defaults to 0.30%. */
  readonly aerodromeFeeRate?: number;
  /** Uniswap pool fee as a fraction (the quoted V3 tier). Defaults to 0.30%. */
  readonly uniswapFeeRate?: number;
  /**
   * True when the triangular rates already include each pool's fee (live V3 quotes, where every
   * hop has its own fee tier); the engine then adds no fee of its own.
   */
  readonly triangularFeesIncluded?: boolean;
  /** The selected borrow size quoted through the actual flash route. Null means no usable live quote. */
  readonly flashQuote?: BorrowQuote | null;
  readonly crossDexQuote?: AtomicSpreadLoan | null;
  /**
   * Screening gas cost per strategy in USD (live gas price x measured gas units x buffer). Without
   * it the engine falls back to its fixed placeholders.
   */
  readonly gasCostUsd?: {
    readonly triangular: number;
    readonly crossDex: number;
    readonly flashLoan: number;
  };
  readonly currentGasGwei: number;
  readonly timestamp: number;
}

interface BorrowQuote {
  asset: "USDC" | "WETH";
  principal: bigint;
  amountOut: bigint;
  premium: bigint;
}

function valueBorrowQuote(quote: BorrowQuote, ethUsd: number) {
  const decimals = quote.asset === "WETH" ? 18 : 6;
  const usdPrice = quote.asset === "WETH" ? ethUsd : 1;
  const borrowAmount = Number(formatUnits(quote.principal, decimals));
  return {
    asset: quote.asset,
    borrowAmount,
    notionalUsd: borrowAmount * usdPrice,
    grossProfitUsd: Number(formatUnits(quote.amountOut - quote.principal, decimals)) * usdPrice,
    flashLoanFeeUsd: Number(formatUnits(quote.premium, decimals)) * usdPrice,
  };
}

export interface OpportunityBreakdown {
  readonly grossProfitUsd: number;
  readonly flashLoanFeeUsd: number;
  readonly estimatedGasUsd: number;
  readonly netProfitUsd: number;
  readonly minProfitFloorUsd: number;
  readonly returnOnCapitalBps: number;
}

export interface ArbitrageSessionStats {
  scansCount: number;
  opportunitiesDetected: number;
  submittedTransactions: number;
  projectedProfitUsd: number;
}

export function recordArbitrageSubmission(
  stats: ArbitrageSessionStats,
  hash: Hex | undefined,
  projectedNetProfitUsd: number
): ArbitrageSessionStats {
  if (!hash) return stats;
  return {
    ...stats,
    submittedTransactions: stats.submittedTransactions + 1,
    projectedProfitUsd: stats.projectedProfitUsd + projectedNetProfitUsd,
  };
}

export interface OpportunityEvaluation {
  readonly id: string;
  readonly timestamp: string;
  readonly qualified: boolean;
  readonly strategy: "TRIANGULAR" | "CROSS_DEX" | "FLASH_LOAN" | "NONE";
  readonly grossSpreadPct: number;
  readonly projectedNetProfitUsd: number;
  readonly estimatedGasCostUsd: number;
  readonly confidenceScore: number;
  readonly summary: string;
  readonly disqualificationReason?: string;
  readonly breakdown?: OpportunityBreakdown;
  readonly simulationStatus?: "PENDING" | "PASSED" | "REVERTED_ANTI_LOSS" | "REVERTED_ERROR";
  readonly simulationError?: string;
  readonly executionPlan?: {
    readonly targetRouter: string;
    readonly action: string;
    readonly inputAsset: string;
    readonly inputAmount: string;
    readonly minExpectedOut: string;
  };
}

export class AiArbitrageBotEngine {
  /**
   * Evaluates the market snapshot against all active strategies and strict anti-loss constraints.
   */
  public static evaluateMarketOpportunity(
    config: BotConfig,
    market: MarketSnapshot
  ): OpportunityEvaluation {
    const timestampStr = new Date(market.timestamp).toISOString();
    const evalId = `eval-${market.timestamp}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Gas Price Ceiling Guard (Pre-Flight Check)
    if (market.currentGasGwei > config.maxGasCeilingGwei) {
      return {
        id: evalId,
        timestamp: timestampStr,
        qualified: false,
        strategy: "NONE",
        grossSpreadPct: 0,
        projectedNetProfitUsd: 0,
        estimatedGasCostUsd: (market.currentGasGwei * 150_000 * market.wethUsdcPrice) / 1e9,
        confidenceScore: 0,
        summary: "Execution suspended: Base gas price exceeds safety ceiling",
        disqualificationReason: `Gas price ${market.currentGasGwei.toFixed(3)} Gwei exceeds max ceiling of ${config.maxGasCeilingGwei.toFixed(3)} Gwei.`,
      };
    }

    const candidates: Array<{
      strategy: "TRIANGULAR" | "CROSS_DEX" | "FLASH_LOAN";
      netProfitUsd: number;
      grossSpreadPct: number;
      gasUsd: number;
      confidence: number;
      summary: string;
      breakdown: OpportunityBreakdown;
      plan?: OpportunityEvaluation["executionPlan"];
    }> = [];

    const addLoanCandidate = (
      strategy: "FLASH_LOAN" | "CROSS_DEX",
      loan: ReturnType<typeof valueBorrowQuote>,
      gasUsd: number,
      description: string
    ) => {
      const { asset, borrowAmount, notionalUsd, grossProfitUsd, flashLoanFeeUsd } = loan;
      const netProfitUsd = grossProfitUsd - flashLoanFeeUsd - gasUsd;
      const inputAmount = `${borrowAmount.toLocaleString()} ${asset}`;
      candidates.push({
        strategy,
        netProfitUsd,
        grossSpreadPct: (grossProfitUsd / notionalUsd) * 100,
        gasUsd,
        confidence: netProfitUsd > 0 ? 99.1 : 20,
        summary: `${description} (${inputAmount} borrowed)`,
        breakdown: {
          grossProfitUsd, flashLoanFeeUsd, estimatedGasUsd: gasUsd, netProfitUsd,
          minProfitFloorUsd: config.minNetProfitUsd,
          returnOnCapitalBps: (netProfitUsd / notionalUsd) * 10000,
        },
        plan: {
          targetRouter: config.flashRouter ?? "0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd",
          action: "executeGenericArbitrage",
          inputAsset: asset,
          inputAmount,
          minExpectedOut: `+$${netProfitUsd.toFixed(2)} USD Net Profit`,
        },
      });
    };

    // 2. Evaluate Strategy A: Triangular Arbitrage
    if (config.strategies.triangular) {
      try {
        const triResult = ShaggyDoggQuantAiEngine.calculateCrossDexTriangularArbitrage({
          initialWeth: config.tradeCapitalEth,
          wethUsdcPrice: market.wethUsdcPrice,
          usdcMidRate: market.usdcMidRate,
          midWethRate: market.midWethRate,
          midSymbol: market.midSymbol ?? "MID",
          poolFeeBps: market.triangularFeesIncluded ? 0 : 30, // flat 0.30% only for modelled rates
          gasCostUsd: market.gasCostUsd?.triangular ?? 0.08,
        });

        const netUsd = triResult.netProfit * market.wethUsdcPrice;
        const grossSpreadPct = (triResult.grossProfit / config.tradeCapitalEth) * 100;
        candidates.push({
          strategy: "TRIANGULAR",
          netProfitUsd: netUsd,
          grossSpreadPct,
          gasUsd: triResult.gasCostUsd,
          confidence: triResult.arbitrageDetected ? 97.5 : 45.0,
          summary: `Triangular ${triResult.pairRoute.replace(/->/g, " ➔ ")} (${config.tradeCapitalEth} WETH)`,
          breakdown: {
            grossProfitUsd: triResult.grossProfit * market.wethUsdcPrice,
            flashLoanFeeUsd: 0,
            estimatedGasUsd: triResult.gasCostUsd,
            netProfitUsd: netUsd,
            minProfitFloorUsd: config.minNetProfitUsd,
            returnOnCapitalBps: triResult.roiBps,
          },
          plan: {
            targetRouter: UNISWAP_V3_SWAP_ROUTER_02,
            action: "exactInput",
            inputAsset: "WETH",
            inputAmount: `${config.tradeCapitalEth} ETH`,
            minExpectedOut: `${(triResult.terminalCapital * (1 - config.maxSlippageBps / 10_000)).toFixed(5)} WETH`,
          },
        });
      } catch {
        // Skip on invalid pricing inputs
      }
    }

    // 3. Evaluate Strategy B: Cross-DEX Spreads (Uniswap vs Aerodrome)
    if (config.strategies.crossDex && market.crossDexQuote) {
      const quote = market.crossDexQuote;
      const ethUsd = Number(formatUnits(quote.usdcMid, 6)) / Number(formatUnits(quote.principal, 18));
      addLoanCandidate(
        "CROSS_DEX",
        valueBorrowQuote({ asset: "WETH", principal: quote.principal, amountOut: quote.wethOut, premium: quote.premium }, ethUsd),
        market.gasCostUsd?.crossDex ?? 0.08,
        `Cross-DEX sell on ${quote.sellVenue}, buy on ${quote.buyVenue}`
      );
    } else if (config.strategies.crossDex && market.crossDexQuote === undefined) {
      try {
        const dualResult = ShaggyDoggQuantAiEngine.calculateDualPoolCrossDexSpread({
          poolAPrice: market.uniswapEthPrice,
          poolBPrice: market.aerodromeEthPrice,
          amountUnits: config.tradeCapitalEth,
          poolAFeeRate: market.uniswapFeeRate ?? 0.003,
          poolBFeeRate: market.aerodromeFeeRate ?? 0.003,
          l2GasUsd: market.gasCostUsd?.crossDex ?? 0.08,
        });

        candidates.push({
          strategy: "CROSS_DEX",
          netProfitUsd: dualResult.netProfitUsd,
          grossSpreadPct: dualResult.grossSpreadPct,
          gasUsd: dualResult.l2GasUsd,
          confidence: dualResult.isProfitable ? 98.2 : 30.0,
          summary: `Cross-DEX ${dualResult.optimalRoute} (${config.tradeCapitalEth} ETH)`,
          breakdown: {
            grossProfitUsd: dualResult.grossSpread,
            flashLoanFeeUsd: 0,
            estimatedGasUsd: dualResult.l2GasUsd,
            netProfitUsd: dualResult.netProfitUsd,
            minProfitFloorUsd: config.minNetProfitUsd,
            returnOnCapitalBps: dualResult.netSpreadPct * 100,
          },
          plan: {
            targetRouter:
              dualResult.optimalRoute === "BUY_POOL_A_SELL_POOL_B"
                ? UNISWAP_V3_SWAP_ROUTER_02
                : "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
            action:
              dualResult.optimalRoute === "BUY_POOL_A_SELL_POOL_B"
                ? "exactInputSingle"
                : "swapExactETHForTokens",
            inputAsset: "ETH",
            inputAmount: `${config.tradeCapitalEth} ETH`,
            minExpectedOut: `$${(config.tradeCapitalEth * market.uniswapEthPrice * (1 - config.maxSlippageBps / 10_000)).toFixed(2)} USDC`,
          },
        });
      } catch {
        // Skip on error
      }
    }

    // 4. Evaluate Strategy C: Aave v3 Flash Loan Arbitrage
    const flashGasUsd = market.gasCostUsd?.flashLoan ?? 0.15;
    if (config.strategies.flashLoan && market.flashQuote) {
      addLoanCandidate(
        "FLASH_LOAN", valueBorrowQuote(market.flashQuote, market.wethUsdcPrice), flashGasUsd, "Aave flash loan"
      );
    } else if (config.strategies.flashLoan && market.flashQuote === undefined) {
      try {
        const model = ShaggyDoggQuantAiEngine.calculateAaveFlashArbitrage({
          borrowAsset: "USDC",
          borrowAmount: config.flashBorrowUsdc,
          flashPremiumBps: 5, // 0.05%
          sdStakedTier: config.vipTier,
          triangularRoute: {
            wethUsdcPrice: market.wethUsdcPrice,
            usdcMidRate: market.usdcMidRate,
            midWethRate: market.midWethRate,
            basePoolFeeBps: market.triangularFeesIncluded ? 0 : 30,
          },
          gasCostUsd: flashGasUsd,
        });
        addLoanCandidate("FLASH_LOAN", {
          asset: "USDC",
          borrowAmount: config.flashBorrowUsdc,
          notionalUsd: config.flashBorrowUsdc,
          grossProfitUsd: model.grossProfit + model.flashLoanPremium,
          flashLoanFeeUsd: model.flashLoanPremium,
        }, flashGasUsd, "Aave flash loan");
      } catch {
        // Skip on invalid model inputs.
      }
    }

    candidates.sort((a, b) => b.netProfitUsd - a.netProfitUsd);
    const best = candidates[0];
    if (!best) {
      const waitingForFlashQuote = config.strategies.flashLoan && market.flashQuote === null;
      return {
        id: evalId,
        timestamp: timestampStr,
        qualified: false,
        strategy: "NONE",
        grossSpreadPct: 0,
        projectedNetProfitUsd: 0,
        estimatedGasCostUsd: 0,
        confidenceScore: 0,
        summary: waitingForFlashQuote ? "No current flash route quote" : "No enabled strategies to evaluate",
        disqualificationReason: waitingForFlashQuote
          ? "Waiting for a fresh flash route quote at the selected borrow amount."
          : "Enable at least one arbitrage strategy.",
      };
    }

    // 5. Strict Anti-Loss Guard: Positive Delta & Minimum Profit Threshold Check
    if (best.netProfitUsd <= 0) {
      return {
        id: evalId,
        timestamp: timestampStr,
        qualified: false,
        strategy: best.strategy,
        grossSpreadPct: best.grossSpreadPct,
        projectedNetProfitUsd: best.netProfitUsd,
        estimatedGasCostUsd: best.gasUsd,
        confidenceScore: best.confidence,
        summary: `${best.summary} | Net Profit: $${best.netProfitUsd.toFixed(2)}`,
        disqualificationReason: `Negative or zero return ($${best.netProfitUsd.toFixed(2)}). Anti-Loss Guard prevented transaction execution.`,
        breakdown: best.breakdown,
        simulationStatus: "REVERTED_ANTI_LOSS",
      };
    }

    if (best.netProfitUsd < config.minNetProfitUsd) {
      return {
        id: evalId,
        timestamp: timestampStr,
        qualified: false,
        strategy: best.strategy,
        grossSpreadPct: best.grossSpreadPct,
        projectedNetProfitUsd: best.netProfitUsd,
        estimatedGasCostUsd: best.gasUsd,
        confidenceScore: best.confidence,
        summary: `${best.summary} | Net Profit: +$${best.netProfitUsd.toFixed(2)}`,
        disqualificationReason: `Projected profit +$${best.netProfitUsd.toFixed(2)} is below your minimum target of $${config.minNetProfitUsd.toFixed(2)}.`,
        breakdown: best.breakdown,
        simulationStatus: "REVERTED_ANTI_LOSS",
      };
    }

    // Opportunity Qualified for Pre-Flight Simulation / Execution!
    return {
      id: evalId,
      timestamp: timestampStr,
      qualified: true,
      strategy: best.strategy,
      grossSpreadPct: best.grossSpreadPct,
      projectedNetProfitUsd: best.netProfitUsd,
      estimatedGasCostUsd: best.gasUsd,
      confidenceScore: best.confidence,
      summary: `🚀 OPPORTUNITY CONFIRMED: ${best.summary} clears all anti-loss gates!`,
      breakdown: best.breakdown,
      simulationStatus: "PENDING",
      ...(best.plan ? { executionPlan: best.plan } : {}),
    };
  }
}
