// src/lib/amm/gas-cost.test.ts
import { describe, expect, it, vi } from "vitest";

import { GAS_SAFETY_BUFFER, liveEthUsd, MEASURED_GAS_UNITS, screeningGasUsd } from "./gas-cost";

const QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

describe("screeningGasUsd", () => {
  it("prices measured gas at the live gas price with the safety buffer", () => {
    // 453,000 gas x 0.006 gwei x $2,400 = $0.0065232, then the buffer
    const usd = screeningGasUsd(MEASURED_GAS_UNITS.triangular, 6_000_000n, 2400);
    expect(usd).toBeCloseTo(453_000 * 0.006e-9 * 2400 * GAS_SAFETY_BUFFER, 12);
  });

  it("scales with the gas price instead of a fixed figure", () => {
    const calm = screeningGasUsd(MEASURED_GAS_UNITS.flashLoan, 6_000_000n, 2400);
    const spike = screeningGasUsd(MEASURED_GAS_UNITS.flashLoan, 600_000_000n, 2400);
    expect(spike / calm).toBeCloseTo(100, 9);
  });
});

describe("liveEthUsd", () => {
  const ok = (usdc: bigint) => ({ status: "success" as const, result: [usdc, 0n, 0, 0n] });

  it("takes the best Uniswap V3 tier", async () => {
    const client = {
      multicall: vi
        .fn()
        .mockResolvedValue([ok(2_380_000_000n), ok(2_384_500_000n), { status: "failure" }]),
    };
    expect(await liveEthUsd(client, QUOTER, WETH, USDC)).toBe(2384.5);
  });

  it("returns null when no tier quotes", async () => {
    const client = {
      multicall: vi.fn().mockResolvedValue([{ status: "failure" }, { status: "failure" }]),
    };
    expect(await liveEthUsd(client, QUOTER, WETH, USDC)).toBeNull();
  });
});
