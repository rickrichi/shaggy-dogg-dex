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
