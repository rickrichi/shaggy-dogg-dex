import { describe, expect, it } from "vitest";
import { encodeFunctionData, decodeFunctionData } from "viem";
import { LAUNCHPAD_ARTIFACTS } from "./launchpad/artifacts";
import { STAKING_ABI, BASE_STAKING } from "./staking";

describe("Staking interface compatibility", () => {
  it("encodes both wallet actions against the compiled contract ABI", () => {
    for (const functionName of ["stake", "unstake"] as const) {
      const data = encodeFunctionData({ abi: STAKING_ABI, functionName, args: [10n ** 18n] });
      const decoded = decodeFunctionData({ abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi, data });
      expect(decoded.functionName).toBe(functionName);
      expect(decoded.args).toEqual([10n ** 18n]);
    }
  });
  it("keeps every page read compatible with the compiled staking contract", () => {
    for (const fn of STAKING_ABI) {
      const args = fn.inputs.map((input) =>
        input.type === "address" ? BASE_STAKING.tokenAddress : 0n
      );
      const data = encodeFunctionData({ abi: [fn], functionName: fn.name, args });
      expect(
        decodeFunctionData({ abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi, data }).functionName
      ).toBe(fn.name);
    }
  });
});
