import { zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  BASE_DEX_VENUES,
  MRWD_ADDRESS,
  WETH_ADDRESS,
} from "@/config/dex-venues";

import { inspectVenuePools } from "./useDexPoolMatrix";

const POOL = "0x1111111111111111111111111111111111111111" as const;

describe("inspectVenuePools", () => {
  it("preserves a discovered V3 pool and marks a failed liquidity read unknown", async () => {
    const venue = BASE_DEX_VENUES.find((item) => item.name === "Uniswap V3")!;
    let factoryRead = 0;
    const readContract = vi.fn(async (request: Record<string, unknown>) => {
      if (request.functionName === "getPool")
        return factoryRead++ === 0 ? POOL : zeroAddress;
      throw new Error("RPC unavailable");
    });
    const result = await inspectVenuePools(
      { readContract },
      venue,
      MRWD_ADDRESS,
      WETH_ADDRESS,
    );
    expect(result.state).toBe("partial");
    expect(result.pools).toEqual([
      { address: POOL, fee: 100, liquidity: "unknown" },
    ]);
  });

  it("does not call a partial factory scan missing", async () => {
    const venue = BASE_DEX_VENUES.find((item) => item.name === "Aerodrome")!;
    let call = 0;
    const readContract = vi.fn(async () => {
      if (call++ === 0) return zeroAddress;
      throw new Error("timeout");
    });
    const result = await inspectVenuePools(
      { readContract },
      venue,
      MRWD_ADDRESS,
      WETH_ADDRESS,
    );
    expect(result.state).toBe("partial");
    expect(result.pools).toHaveLength(0);
  });

  it("describes a zero-liquidity V3 pool as inactive, not empty or missing", async () => {
    const venue = BASE_DEX_VENUES.find((item) => item.name === "Uniswap V3")!;
    const readContract = vi.fn(async (request: Record<string, unknown>) =>
      request.functionName === "getPool" ? POOL : 0n,
    );
    const result = await inspectVenuePools(
      { readContract },
      { ...venue, fees: [3000] },
      MRWD_ADDRESS,
      WETH_ADDRESS,
    );
    expect(result.state).toBe("inactive");
    expect(result.pools[0]?.liquidity).toBe("inactive");
  });
});
