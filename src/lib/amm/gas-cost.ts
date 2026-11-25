// src/lib/amm/gas-cost.ts
// Real Base execution costs for the Auto-Pilot's routes.
//   screening   - before a transaction exists: measured gas units x live gas price, with a buffer
//   exact check - once the call is built: viem's OP-stack estimateTotalFee (L2 execution + L1 data fee)

import { type Abi, type Address, encodeFunctionData, type Hex, type PublicClient } from "viem";
import { base } from "viem/chains";
import { estimateTotalFee } from "viem/op-stack";

import { UNISWAP_V3_QUOTER_V2_ABI } from "@/config/abis";

/**
 * Gas used per route, measured with eth_estimateGas on Base on 2026-10-22 (the flash routes with a
 * state override so their profit check passed). Used only to screen; the exact fee gates dispatch.
 */
export const MEASURED_GAS_UNITS = {
  triangular: 453_000n, // SwapRouter02 multicall: 3-hop V3 exactInput + refundETH
  crossDex: 560_000n, // flash-borrowed WETH, two swaps (V3 + Aerodrome), repay
  flashLoan: 1_262_000n, // flash-borrowed asset, 3-hop V3 cycle, repay
} as const;

/** Profit must clear the real fee by this factor, so a gas spike between quote and inclusion still pays. */
export const GAS_SAFETY_BUFFER = 1.25;

export const bufferedGasFee = (feeWei: bigint) =>
  (feeWei * BigInt(Math.round(GAS_SAFETY_BUFFER * 100)) + 99n) / 100n;

/** The target and gas must be in the router's output currency. Round required amounts up. */
export function baseProfitBudget(asset: "USDC" | "WETH", targetUsd: number, ethUsd: number) {
  if (!Number.isFinite(targetUsd) || targetUsd < 0 || !Number.isFinite(ethUsd) || ethUsd <= 0) {
    throw new Error("A nonnegative USD profit target and a positive ETH price are required.");
  }
  const usdcPerWeth = BigInt(Math.round(ethUsd * 1e6));
  if (usdcPerWeth <= 0n) throw new Error("ETH price is below USDC precision.");
  const usdMicros = BigInt(Math.ceil(targetUsd * 1e6));
  const oneWeth = 10n ** 18n;
  const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
  return {
    target: asset === "USDC" ? usdMicros : ceil(usdMicros * oneWeth, usdcPerWeth),
    feeInAsset: (wei: bigint) => asset === "USDC" ? ceil(wei * usdcPerWeth, oneWeth) : wei,
  };
}

/** The L1 data fee changes with calldata. Reprice a tightened minimum before returning the call. */
export async function feeCheckedCall<T>(
  build: (minimum: bigint) => T,
  estimateFee: (call: T) => Promise<bigint>,
  initialMinimum: bigint,
  target: bigint,
  quotedMaximum: bigint,
  feeInAsset: (wei: bigint) => bigint = (wei) => wei
): Promise<T | null> {
  let minimum = initialMinimum > target ? initialMinimum : target;
  for (let attempt = 0; attempt < 3 && minimum <= quotedMaximum; attempt++) {
    const call = build(minimum);
    const required = target + feeInAsset(bufferedGasFee(await estimateFee(call)));
    if (minimum >= required) return call;
    minimum = required;
  }
  return null;
}

/** Screening cost in USD: measured units x gas price x buffer. The L1 data fee is checked exactly later. */
export function screeningGasUsd(units: bigint, gasPriceWei: bigint, ethUsd: number): number {
  return (Number(units * gasPriceWei) / 1e18) * ethUsd * GAS_SAFETY_BUFFER;
}

export interface BuiltCall {
  readonly address: Address;
  readonly abi: Abi | readonly unknown[];
  readonly functionName: string;
  readonly args?: readonly unknown[];
  readonly value?: bigint;
}

/**
 * Exact total fee in wei (L2 execution + L1 data) for a call from `account`. Throws when the call
 * would revert, because gas cannot be estimated for a failing transaction.
 */
export async function exactCallFeeWei(
  client: Parameters<typeof estimateTotalFee>[0],
  account: Address,
  call: BuiltCall
): Promise<bigint> {
  const data: Hex = encodeFunctionData({
    abi: call.abi as Abi,
    functionName: call.functionName,
    args: call.args ?? [],
  });
  return estimateTotalFee(client, {
    account,
    to: call.address,
    data,
    ...(call.value !== undefined ? { value: call.value } : {}),
    chain: base,
  });
}

/** Live USDC per WETH from Uniswap V3 (best of the main tiers), to convert fees into USDC. */
export async function liveEthUsd(
  client: Pick<PublicClient, "multicall">,
  quoter: Address,
  weth: Address,
  usdc: Address
): Promise<number | null> {
  const results = await client.multicall({
    allowFailure: true,
    contracts: [100, 500, 3000].map((fee) => ({
      address: quoter,
      abi: UNISWAP_V3_QUOTER_V2_ABI as Abi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: weth, tokenOut: usdc, amountIn: 10n ** 18n, fee, sqrtPriceLimitX96: 0n }],
    })),
  });
  const best = results.reduce<bigint>((max, r) => {
    const out = r.status === "success" && Array.isArray(r.result) ? r.result[0] : undefined;
    return typeof out === "bigint" && out > max ? out : max;
  }, 0n);
  return best > 0n ? Number(best) / 1e6 : null;
}
