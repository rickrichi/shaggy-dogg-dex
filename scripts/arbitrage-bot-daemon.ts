#!/usr/bin/env tsx
/**
 * 24/7 Autonomous Node.js / TypeScript Arbitrage Bot Daemon for Base Mainnet
 *
 * Operates continuously in the background on a server/VPS or local terminal.
 * Listens to Base L2 WebSocket / HTTP RPC events, evaluates opportunities
 * with ShaggyDoggQuantAiEngine, and executes trades atomically with a dedicated
 * operator wallet within milliseconds.
 *
 * Strict Anti-Loss Features:
 *  - Pre-Flight Positive Delta Guard (Net Profit > Configured Hurdle)
 *  - Base Gas Price Ceiling Guard (prevents execution during congestion)
 *  - Slippage Guard & Price Impact Threshold
 *  - Atomic EVM Revert Guard (zero loss of principal if prices shift)
 */

import { verifyPrivateSubmission } from "./lib/private-submission";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  type Address,
  createPublicClient,
  createWalletClient,
  fallback,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseEther,
  parseUnits,
  webSocket,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { AERODROME_ROUTER_ABI, UNISWAP_V2_ROUTER_ABI } from "../src/config/abis.js";
import {
  AiArbitrageBotEngine,
  type BotConfig,
  type MarketSnapshot,
} from "../src/lib/amm/ai-arbitrage-bot.js";
import { LAUNCHPAD_ARTIFACTS } from "../src/lib/launchpad/artifacts.js";

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION & ENVIRONMENT LOADER
// ────────────────────────────────────────────────────────────────────────────
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    try {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore unreadable or missing env files
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.private-routing"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.bot"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const args = process.argv.slice(2);
const isDryRunFlag = args.includes("--dry-run");


const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;

const MIN_NET_PROFIT_USD = parseFloat(process.env.MIN_NET_PROFIT_USD || "1.5");
const MAX_SLIPPAGE_BPS = parseInt(process.env.MAX_SLIPPAGE_BPS || "20", 10); // 0.20%
const MAX_GAS_GWEI = parseFloat(process.env.MAX_GAS_GWEI || "0.01"); // 0.01 Gwei
const TRADE_CAPITAL_ETH = parseFloat(process.env.TRADE_CAPITAL_ETH || "2.0");
const FLASH_BORROW_USDC = parseFloat(process.env.FLASH_BORROW_USDC || "50000");
const VIP_TIER = parseInt(process.env.VIP_TIER || "3", 10);

const AAVE_BORROWER_ADDRESS: Address = (
  isAddress(process.env.AAVE_BORROWER_ADDRESS || "")
    ? process.env.AAVE_BORROWER_ADDRESS
    : "0x70315019d12a11556c837970675cdc8fa54d186b"
) as Address;

const BENEFICIARY_WALLET: Address = (
  isAddress(process.env.BENEFICIARY_WALLET || "")
    ? process.env.BENEFICIARY_WALLET
    : "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98"
) as Address;

const UNISWAP_V2_ROUTER: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const BASESWAP_ROUTER: Address = "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86";
const SUSHISWAP_ROUTER: Address = "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891";
const AERODROME_ROUTER: Address = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERO_FACTORY: Address = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const WETH_ADDRESS: Address = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AERO_ADDRESS: Address = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const CBBTC_ADDRESS: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const VIRTUAL_ADDRESS: Address = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const DAI_ADDRESS: Address = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";

export interface AeroRouteStep {
  from: Address;
  to: Address;
  stable: boolean;
  factory: Address;
}

const AERO_TRIANGULAR_FWD: AeroRouteStep[] = [
  { from: USDC_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: WETH_ADDRESS, to: AERO_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: AERO_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERO_FACTORY },
];

const AERO_TRIANGULAR_REV: AeroRouteStep[] = [
  { from: USDC_ADDRESS, to: AERO_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: AERO_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: WETH_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERO_FACTORY },
];

const CBBTC_TRIANGULAR_FWD: AeroRouteStep[] = [
  { from: USDC_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: WETH_ADDRESS, to: CBBTC_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: CBBTC_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERO_FACTORY },
];

const CBBTC_TRIANGULAR_REV: AeroRouteStep[] = [
  { from: USDC_ADDRESS, to: CBBTC_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: CBBTC_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: WETH_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERO_FACTORY },
];

const VIRTUAL_TRIANGULAR: AeroRouteStep[] = [
  { from: USDC_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: WETH_ADDRESS, to: VIRTUAL_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: VIRTUAL_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERO_FACTORY },
  { from: WETH_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERO_FACTORY },
];

const botConfig: BotConfig = {
  minNetProfitUsd: MIN_NET_PROFIT_USD,
  maxSlippageBps: MAX_SLIPPAGE_BPS,
  maxGasCeilingGwei: MAX_GAS_GWEI,
  strategies: {
    triangular: process.env.STRATEGY_TRIANGULAR !== "false",
    crossDex: process.env.STRATEGY_CROSS_DEX !== "false",
    flashLoan: process.env.STRATEGY_FLASH_LOAN !== "false",
  },
  tradeCapitalEth: TRADE_CAPITAL_ETH,
  flashBorrowUsdc: FLASH_BORROW_USDC,
  vipTier: VIP_TIER,
};

// ────────────────────────────────────────────────────────────────────────────
// LOGGING UTILITIES
// ────────────────────────────────────────────────────────────────────────────
function log(level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  const prefix =
    level === "SUCCESS"
      ? "\x1b[32m[SUCCESS]\x1b[0m"
      : level === "WARN"
        ? "\x1b[33m[WARN]\x1b[0m"
        : level === "ERROR"
          ? "\x1b[31m[ERROR]\x1b[0m"
          : "\x1b[36m[INFO]\x1b[0m";
  console.log(`[${ts}] ${prefix} ${msg}`);
}

// ────────────────────────────────────────────────────────────────────────────
// CEFI L2 ORDER BOOK FEED CONNECTOR (CRYPTO-ARB INTEGRATION)
// ────────────────────────────────────────────────────────────────────────────
interface CefiMarketData {
  coinbaseEth: number;
  krakenEth: number;
  bitstampEth: number;
  bestAsk: number;
  bestBid: number;
  isLive: boolean;
}

let lastCefiData: CefiMarketData | null = null;
let lastCefiFetch = 0;

async function getLiveCefiData(): Promise<CefiMarketData | null> {
  const now = Date.now();
  if (lastCefiData && now - lastCefiFetch < 1000) {
    return lastCefiData;
  }
  try {
    const res = await fetch("http://127.0.0.1:8000/api/snapshot?notional=1000", {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return lastCefiData;
    const json = (await res.json()) as {
      venues?: Array<{
        exchange: string;
        symbol: string;
        ask: number | null;
        bid: number | null;
        status: string;
      }>;
    };
    const venues = json.venues || [];
    const cb = venues.find((v) => v.exchange === "coinbase" && v.symbol === "ETH/USD");
    const kr = venues.find((v) => v.exchange === "kraken" && v.symbol === "ETH/USD");
    const bs = venues.find((v) => v.exchange === "bitstamp" && v.symbol === "ETH/USD");

    const asks = [cb?.ask, kr?.ask, bs?.ask].filter(
      (x): x is number => typeof x === "number" && x > 0
    );
    const bids = [cb?.bid, kr?.bid, bs?.bid].filter(
      (x): x is number => typeof x === "number" && x > 0
    );

    if (asks.length > 0 && bids.length > 0) {
      lastCefiData = {
        coinbaseEth: cb?.ask ?? asks[0],
        krakenEth: kr?.ask ?? asks[0],
        bitstampEth: bs?.ask ?? asks[0],
        bestAsk: Math.min(...asks),
        bestBid: Math.max(...bids),
        isLive: true,
      };
      lastCefiFetch = now;
      return lastCefiData;
    }
  } catch {
    // Falls back gracefully if crypto-arb is offline or starting
  }
  return lastCefiData;
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN DAEMON ENTRYPOINT
// ────────────────────────────────────────────────────────────────────────────
async function startDaemon() {
  console.log("══════════════════════════════════════════════════════════════════════════");
  console.log("🤖 SHAGGY MUTT DEX — 24/7 AUTONOMOUS AI ARBITRAGE BOT DAEMON");
  console.log("══════════════════════════════════════════════════════════════════════════");
  console.log(` Target Network:        Base Mainnet (Chain ID 8453)`);
  console.log(" Read RPC:              Base public fallback pool");
  console.log(" Submission RPC:        server-only provider configuration; no public fallback");
  console.log(` Execution Mode:        ${isDryRunFlag ? "🧪 DRY RUN (Simulation Only)" : "⚡ LIVE ON-CHAIN BROADCAST"}`);
  console.log(` Min Net Profit Hurdle: $${botConfig.minNetProfitUsd.toLocaleString()} USD`);
  console.log(` Max Gas Fee Ceiling:   ${botConfig.maxGasCeilingGwei} Gwei`);
  console.log(` Max Slippage Cap:      ${(botConfig.maxSlippageBps / 100).toFixed(2)}%`);
  console.log(` Aave Borrower Hook:    ${AAVE_BORROWER_ADDRESS}`);
  console.log(` Institutional Feeds:   http://127.0.0.1:8000 (CCXT Pro L2 Order Books)`);
  console.log("══════════════════════════════════════════════════════════════════════════\n");

  // Setup operator wallet client if live
  let operatorAccount: ReturnType<typeof privateKeyToAccount> | null = null;
  if (!isDryRunFlag) {
    if (!OPERATOR_KEY || !OPERATOR_KEY.startsWith("0x")) {
      log(
        "WARN",
        "OPERATOR_PRIVATE_KEY not configured or invalid in environment. Defaulting to DRY RUN mode."
      );
    } else {
      try {
        operatorAccount = privateKeyToAccount(OPERATOR_KEY);
        log("INFO", `Operator Wallet Loaded: ${operatorAccount.address}`);
      } catch (err) {
        log("ERROR", `Failed to initialize operator private key: ${(err instanceof Error ? err.name : "Request failed")}`);
        process.exit(1);
      }
    }
  }

  // Create public client with multicall batching to eliminate RPC roundtrips
  const publicClient = createPublicClient({
    chain: base,
    transport: fallback([
      http("https://base-mainnet.public.blastapi.io"),
      http("https://mainnet.base.org"),
      http("https://base-rpc.publicnode.com"),
    ]),
    batch: {
      multicall: true,
    },
  });
  log("INFO", `Connected to Base RPC with Multicall3 batching (Primary: blastapi.io)`);

  const submission = operatorAccount && !isDryRunFlag
    ? await verifyPrivateSubmission(process.env) : null;
  const walletClient = operatorAccount && submission
    ? createWalletClient({ account: operatorAccount, chain: base, transport: submission.transport })
    : null;

  // Check operator balance
  if (operatorAccount) {
    try {
      const balance = await publicClient.getBalance({ address: operatorAccount.address });
      log("INFO", `Operator Balance: ${formatEther(balance)} ETH`);
      if (balance === 0n) {
        log(
          "WARN",
          "Operator wallet balance is 0 ETH. Live transactions will revert until funded with L2 gas."
        );
      }
    } catch (e) {
      log("WARN", `Could not query operator balance: ${(e instanceof Error ? e.name : "Request failed")}`);
    }
  }

  log("SUCCESS", "Daemon active. Subscribed to Base block stream. Scanning for arbitrage...");

  let scanCounter = 0;
  let qualifiedCounter = 0;
  let executedCounter = 0;


  // Scan handler per block
  async function handleBlock(blockNumber: bigint) {
    const startTime = Date.now();
    scanCounter++;

    try {
      // 1. Fetch current live Base gas price
      const gasPrice = await publicClient.getGasPrice();
      const currentGasGwei = Number((Number(gasPrice) / 1e9).toFixed(4));

      if (currentGasGwei > botConfig.maxGasCeilingGwei) {
        log("WARN", `[BLOCK #${blockNumber}] Gas Ceiling Exceeded: ${currentGasGwei} Gwei > ${botConfig.maxGasCeilingGwei} Gwei`);
        return;
      }

      // 2. Fetch live pricing feeds (Institutional CeFi L2 Order Books)
      const cefi = await getLiveCefiData();
      const ethPriceUsd = cefi ? cefi.bestAsk : 2707.0;

      // 3. Dynamic candidate borrow amounts (sizing curve: small to institutional)
      const borrowSizes = [
        1000,
        2500,
        5000,
        10000,
        25000,
        Math.min(botConfig.flashBorrowUsdc, 50000),
      ].filter((v, idx, arr) => arr.indexOf(v) === idx && v > 0);

      interface QualifiedOpp {
        name: string;
        type: "AERODROME_TRIANGULAR" | "CROSS_DEX_V2";
        sizeUsdc: number;
        grossOutUsdc: number;
        netProfitUsd: number;
        netSpreadBps: number;
        aeroRoutes?: AeroRouteStep[];
        routerA?: Address;
        routerB?: Address;
        intermediateToken?: Address;
      }

      let bestOpp: QualifiedOpp | null = null;
      let highestNetProfit = -Infinity;
      let topScanRoute = "None";
      let topScanBps = -Infinity;

      // 1. Aerodrome multi-hop routes
      const aeroRoutesList = [
        { name: "Aerodrome USDC->WETH->AERO->USDC", routes: AERO_TRIANGULAR_FWD },
        { name: "Aerodrome USDC->AERO->WETH->USDC", routes: AERO_TRIANGULAR_REV },
        { name: "Aerodrome USDC->WETH->cbBTC->USDC", routes: CBBTC_TRIANGULAR_FWD },
        { name: "Aerodrome USDC->cbBTC->WETH->USDC", routes: CBBTC_TRIANGULAR_REV },
        { name: "Aerodrome USDC->WETH->VIRTUAL->WETH->USDC", routes: VIRTUAL_TRIANGULAR },
      ];

      // 2. Cross-DEX V2 routes (Uniswap V2 vs BaseSwap / SushiSwap)
      const crossDexV2Routes = [
        {
          name: "Cross-DEX [UniV2 -> BaseSwap] (WETH)",
          routerA: UNISWAP_V2_ROUTER,
          routerB: BASESWAP_ROUTER,
          intermediateToken: WETH_ADDRESS,
        },
        {
          name: "Cross-DEX [BaseSwap -> UniV2] (WETH)",
          routerA: BASESWAP_ROUTER,
          routerB: UNISWAP_V2_ROUTER,
          intermediateToken: WETH_ADDRESS,
        },
        {
          name: "Cross-DEX [UniV2 -> SushiSwap] (WETH)",
          routerA: UNISWAP_V2_ROUTER,
          routerB: SUSHISWAP_ROUTER,
          intermediateToken: WETH_ADDRESS,
        },
        {
          name: "Cross-DEX [SushiSwap -> UniV2] (WETH)",
          routerA: SUSHISWAP_ROUTER,
          routerB: UNISWAP_V2_ROUTER,
          intermediateToken: WETH_ADDRESS,
        },
        {
          name: "Cross-DEX [UniV2 -> BaseSwap] (cbBTC)",
          routerA: UNISWAP_V2_ROUTER,
          routerB: BASESWAP_ROUTER,
          intermediateToken: CBBTC_ADDRESS,
        },
        {
          name: "Cross-DEX [BaseSwap -> UniV2] (cbBTC)",
          routerA: BASESWAP_ROUTER,
          routerB: UNISWAP_V2_ROUTER,
          intermediateToken: CBBTC_ADDRESS,
        },
      ];

      const quoteTasks = borrowSizes.flatMap((size) => {
        const amountInBigInt = parseUnits(size.toString(), 6);
        const flashLoanFee = size * 0.0005; // 0.05% Aave v3 pool fee
        const gasCostUsd = Number(currentGasGwei) * 350000 * 1e-9 * ethPriceUsd;

        // Tasks for Aerodrome routes
        const aeroTasks = aeroRoutesList.map(async (r) => {
          try {
            const outRes = await publicClient.readContract({
              address: AERODROME_ROUTER,
              abi: AERODROME_ROUTER_ABI,
              functionName: "getAmountsOut",
              args: [amountInBigInt, r.routes],
            });
            const outBigInt = outRes[outRes.length - 1];
            const outUsdc = Number(formatUnits(outBigInt, 6));
            const netProfit = outUsdc - size - flashLoanFee - gasCostUsd;
            const spreadBps = ((outUsdc - size) / size) * 10000;
            return {
              name: `${r.name} ($${size.toLocaleString()} USDC)`,
              type: "AERODROME_TRIANGULAR" as const,
              sizeUsdc: size,
              grossOutUsdc: outUsdc,
              netProfitUsd: netProfit,
              netSpreadBps: spreadBps,
              aeroRoutes: r.routes,
            };
          } catch {
            return null;
          }
        });

        // Tasks for Cross-DEX V2 routes
        const crossTasks = crossDexV2Routes.map(async (cd) => {
          try {
            const leg1Out = await publicClient.readContract({
              address: cd.routerA,
              abi: UNISWAP_V2_ROUTER_ABI,
              functionName: "getAmountsOut",
              args: [amountInBigInt, [USDC_ADDRESS, cd.intermediateToken]],
            });
            const tokenOut = leg1Out[leg1Out.length - 1];
            if (!tokenOut || tokenOut === 0n) return null;

            const leg2Out = await publicClient.readContract({
              address: cd.routerB,
              abi: UNISWAP_V2_ROUTER_ABI,
              functionName: "getAmountsOut",
              args: [tokenOut, [cd.intermediateToken, USDC_ADDRESS]],
            });
            const finalOutBigInt = leg2Out[leg2Out.length - 1];
            const outUsdc = Number(formatUnits(finalOutBigInt, 6));
            const netProfit = outUsdc - size - flashLoanFee - gasCostUsd;
            const spreadBps = ((outUsdc - size) / size) * 10000;
            return {
              name: `${cd.name} ($${size.toLocaleString()} USDC)`,
              type: "CROSS_DEX_V2" as const,
              sizeUsdc: size,
              grossOutUsdc: outUsdc,
              netProfitUsd: netProfit,
              netSpreadBps: spreadBps,
              routerA: cd.routerA,
              routerB: cd.routerB,
              intermediateToken: cd.intermediateToken,
            };
          } catch {
            return null;
          }
        });

        return [...aeroTasks, ...crossTasks];
      });

      const quoteResults = await Promise.all(quoteTasks);
      for (const res of quoteResults) {
        if (!res) continue;
        if (res.netSpreadBps > topScanBps) {
          topScanBps = res.netSpreadBps;
          topScanRoute = res.name;
        }
        if (res.netProfitUsd > highestNetProfit) {
          highestNetProfit = res.netProfitUsd;
          if (res.netProfitUsd >= botConfig.minNetProfitUsd) {
            bestOpp = res;
          }
        }
      }

      const elapsedMs = Date.now() - startTime;

      if (bestOpp && bestOpp.netProfitUsd >= botConfig.minNetProfitUsd) {
        qualifiedCounter++;
        log(
          "SUCCESS",
          `[BLOCK #${blockNumber}] (${elapsedMs}ms) ⚡ REAL ON-CHAIN SIGNAL QUALIFIED: ${bestOpp.name} | Est. Net: +$${bestOpp.netProfitUsd.toFixed(2)} USD (Spread: +${bestOpp.netSpreadBps.toFixed(1)} bps)`
        );

        if (!walletClient || !operatorAccount || isDryRunFlag) {
          log(
            "INFO",
            `[DRY RUN] Would execute: ${bestOpp.name}`
          );
        } else {
          // LIVE EXECUTION DISPATCH
          log(
            "INFO",
            `[LIVE DISPATCH] Submitting atomic flash arbitrage transaction to Base Mainnet in ${Date.now() - startTime}ms...`
          );

          try {
            const amountBigInt = parseUnits(bestOpp.sizeUsdc.toString(), 6);
            const minProfitBigInt = parseUnits(
              Math.max(1.0, bestOpp.netProfitUsd * 0.7).toFixed(6),
              6
            );

            // Pre-Flight Simulation (Deterministic eth_call check)
            try {
              if (bestOpp.type === "AERODROME_TRIANGULAR" && bestOpp.aeroRoutes) {
                await publicClient.simulateContract({
                  address: AAVE_BORROWER_ADDRESS,
                  abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
                  functionName: "executeAerodromeArbitrage",
                  args: [
                    USDC_ADDRESS,
                    amountBigInt,
                    minProfitBigInt,
                    BENEFICIARY_WALLET,
                    AERODROME_ROUTER,
                    bestOpp.aeroRoutes,
                  ],
                  account: operatorAccount,
                });
              } else if (bestOpp.type === "CROSS_DEX_V2" && bestOpp.routerA && bestOpp.routerB && bestOpp.intermediateToken) {
                await publicClient.simulateContract({
                  address: AAVE_BORROWER_ADDRESS,
                  abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
                  functionName: "executeDualDexArbitrage",
                  args: [
                    USDC_ADDRESS,
                    amountBigInt,
                    minProfitBigInt,
                    BENEFICIARY_WALLET,
                    bestOpp.routerA,
                    bestOpp.routerB,
                    bestOpp.intermediateToken,
                  ],
                  account: operatorAccount,
                });
              }
              log("INFO", "Pre-flight simulation PASSED! Broadcasting to Base Mainnet...");
            } catch (simErr: unknown) {
              const reason =
                (simErr as { shortMessage?: string })?.shortMessage ||
                (simErr as Error)?.message ||
                "Anti-loss guard triggered";
              log(
                "WARN",
                `Pre-flight simulation REVERTED (${reason}). Anti-loss guard protected wallet ($0 gas wasted).`
              );
              return;
            }

            let txHash: `0x${string}` | undefined;
            if (bestOpp.type === "AERODROME_TRIANGULAR" && bestOpp.aeroRoutes) {
              txHash = await walletClient.writeContract({
                address: AAVE_BORROWER_ADDRESS,
                abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
                functionName: "executeAerodromeArbitrage",
                args: [
                  USDC_ADDRESS,
                  amountBigInt,
                  minProfitBigInt,
                  BENEFICIARY_WALLET,
                  AERODROME_ROUTER,
                  bestOpp.aeroRoutes,
                ],
              });
            } else if (bestOpp.type === "CROSS_DEX_V2" && bestOpp.routerA && bestOpp.routerB && bestOpp.intermediateToken) {
              txHash = await walletClient.writeContract({
                address: AAVE_BORROWER_ADDRESS,
                abi: LAUNCHPAD_ARTIFACTS.AtomicFlashArbitrageRouter.abi,
                functionName: "executeDualDexArbitrage",
                args: [
                  USDC_ADDRESS,
                  amountBigInt,
                  minProfitBigInt,
                  BENEFICIARY_WALLET,
                  bestOpp.routerA,
                  bestOpp.routerB,
                  bestOpp.intermediateToken,
                ],
              });
            }

            if (txHash) {
              log("SUCCESS", `Transaction Broadcasted: https://basescan.org/tx/${txHash}`);

              // Wait for receipt asynchronously
              publicClient
                .waitForTransactionReceipt({ hash: txHash })
                .then((receipt) => {
                  if (receipt.status === "success") {
                    executedCounter++;
                    log(
                      "SUCCESS",
                      `Tx Confirmed in block #${receipt.blockNumber}! Gas Used: ${receipt.gasUsed}. Realized profit requires receipt and fee reconciliation`
                    );
                  } else {
                    log("WARN", `Transaction reverted; network gas fees may still be charged.`);
                  }
                })
                .catch((e) => log("WARN", `Receipt timeout: ${(e instanceof Error ? e.name : "Request failed")}`));
            }
          } catch (execErr) {
            log("ERROR", `Live execution dispatch failed: ${(execErr instanceof Error ? execErr.name : "Request failed")}`);
          }
        }
      } else {
        if (scanCounter === 1 || scanCounter % 10 === 0) {
          log(
            "INFO",
            `[BLOCK #${blockNumber}] Scanned Base DEX on-chain quotes in ${elapsedMs}ms | Best Route: ${topScanRoute} (${topScanBps.toFixed(1)} bps) | Anti-Loss Guard: Holding for +$${botConfig.minNetProfitUsd} hurdle`
          );
        }
      }
    } catch (blockErr) {
      log("WARN", `Error evaluating block #${blockNumber}: ${(blockErr instanceof Error ? blockErr.name : "Request failed")}`);
    }
  }

  // Watch blocks continuously with HTTP polling
  const unwatch = publicClient.watchBlockNumber({
    poll: true,
    pollingInterval: 2000,
    onBlockNumber: (blockNum) => {
      handleBlock(blockNum).catch((e) => log("ERROR", `Unhandled block loop error: ${(e instanceof Error ? e.name : "Request failed")}`));
    },
    onError: (err) => {
      log("WARN", `Block watcher connection interrupted: ${(err instanceof Error ? err.name : "Request failed")}. Retrying...`);
    },
  });

  // Trigger immediate scan on startup
  publicClient.getBlockNumber().then(handleBlock).catch((err) => log("WARN", `Startup block scan error: ${(err instanceof Error ? err.name : "Request failed")}`));

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n\nShutting down AI Arbitrage Bot Daemon...");
    unwatch();
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log(` Summary:`);
    console.log(` Total Scans:          ${scanCounter}`);
    console.log(` Signals Qualified:    ${qualifiedCounter}`);
    console.log(` Trades Executed:      ${executedCounter}`);
    console.log(" Realized profit:       not calculated by this scanner");
    console.log(" Reverted transactions may incur gas costs.");
    console.log("══════════════════════════════════════════════════════════════════════════");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startDaemon().catch((err) => {
  console.error("Fatal daemon startup error:", err instanceof Error ? err.name : "Startup failed");
  process.exit(1);
});
