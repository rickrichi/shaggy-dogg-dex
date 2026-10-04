import { keccak256 } from "viem";
import { describe, expect, it } from "vitest";

import artifacts from "@/config/dex/artifacts.json";
import { parseDeployment } from "@/config/dex/deployment";

import { normalizedRuntime, positiveAmount } from "./own-dex";

import type { Hex } from "viem";

describe("Own DEX artifact and input validation", () => {
  it("pins the pair creation hash expected by Router02", () => {
    expect(keccak256(artifacts.pair.bytecode as Hex)).toBe(
      "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
    );
    expect(
      normalizedRuntime(artifacts.router.runtime as Hex, artifacts.router.immutableRanges)
    ).toBe(artifacts.router.runtime);
  });
  it("does not accept invalid or identical deployment addresses", () => {
    expect(parseDeployment(null)).toBeNull();
    expect(
      parseDeployment({ factory: "0x0000000000000000000000000000000000000000", router: "bad" })
    ).toBeNull();
    const address = "0x4200000000000000000000000000000000000006";
    expect(parseDeployment({ factory: address, router: address })).toBeNull();
  });
  it("rejects exponent notation, rounding, negatives and nonfinite amounts", () => {
    for (const amount of ["0", "-1", "1e8", "NaN", "Infinity", "0.0000001", " "])
      expect(positiveAmount(amount, 6)).toBe(false);
    expect(positiveAmount("0.000001", 6)).toBe(true);
    expect(positiveAmount("1.5", 18)).toBe(true);
  });
});
