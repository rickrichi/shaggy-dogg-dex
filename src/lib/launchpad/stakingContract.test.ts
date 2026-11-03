import { describe, expect, it } from "vitest";

import { isLaunchStakingCode } from "./stakingContract";
import fixture from "./stakingContract.fixture.json";

import type { Address, Hex } from "viem";

// Runtime code read from a Staking-card launch made by the site's deploy engine on a Base fork.
const code = fixture.code as Hex;
const token = fixture.token as Address;
const tokenWord = token.slice(2).toLowerCase().padStart(64, "0");

/** Replaces the hex byte at `byteIndex` of the runtime code. */
const withByte = (byteIndex: number, byte: string): Hex => {
  const at = 2 + byteIndex * 2;
  return `${code.slice(0, at)}${byte}${code.slice(at + 2)}` as Hex;
};
const slotByte = (code.slice(2).indexOf(tokenWord) + 62) / 2; // last byte of the token slot

describe("isLaunchStakingCode", () => {
  it("recognises a staking contract deployed by the Staking card", () => {
    expect(isLaunchStakingCode(code, token)).toBe(true);
    expect(isLaunchStakingCode(code, token.toUpperCase().replace("0X", "0x") as Address)).toBe(
      true
    );
  });

  it("refuses the same code paired with another token", () => {
    expect(isLaunchStakingCode(code, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBe(false);
  });

  it("refuses a contract changed by a single byte outside the token slot", () => {
    const original = code.slice(4, 6);
    expect(isLaunchStakingCode(withByte(1, original === "ff" ? "fe" : "ff"), token)).toBe(false);
  });

  it("refuses code whose token slot holds a different address", () => {
    expect(slotByte).toBeGreaterThan(0);
    const original = code.slice(2 + slotByte * 2, 4 + slotByte * 2);
    expect(isLaunchStakingCode(withByte(slotByte, original === "00" ? "01" : "00"), token)).toBe(
      false
    );
  });

  it("refuses empty, missing or truncated code", () => {
    expect(isLaunchStakingCode("0x", token)).toBe(false);
    expect(isLaunchStakingCode(undefined, token)).toBe(false);
    expect(isLaunchStakingCode(code, undefined)).toBe(false);
    expect(isLaunchStakingCode(code.slice(0, -2) as Hex, token)).toBe(false);
    expect(isLaunchStakingCode(`0x${code.slice(4)}` as Hex, token)).toBe(false);
  });
});
