import { describe, expect, it } from "vitest";

import { isTokenIdentityValid, MAX_WHOLE_TOKEN_SUPPLY, tokenIdentityErrors } from "./identity";

const identity = (over: Partial<Parameters<typeof tokenIdentityErrors>[0]> = {}) => ({
  tokenName: "Alpha Coin",
  tokenSymbol: "ALPHA",
  initialSupply: "1000000",
  decimals: 18,
  ...over,
});

describe("token identity validation", () => {
  it("accepts a valid fixed-supply token identity", () => {
    expect(isTokenIdentityValid(identity())).toBe(true);
    expect(tokenIdentityErrors(identity())).toEqual({});
  });

  it("requires a name and a symbol", () => {
    expect(tokenIdentityErrors(identity({ tokenName: "  ", tokenSymbol: "" }))).toMatchObject({
      tokenName: "Token name is required.",
      tokenSymbol: "Token symbol is required.",
    });
  });

  it.each(["A", "ABCDEFG", "A-B", "A B", "alpha"])("rejects invalid ticker %s", (symbol) => {
    expect(tokenIdentityErrors(identity({ tokenSymbol: symbol })).tokenSymbol).toBeDefined();
  });

  it.each(["", "0", "-1", "1.5", "1e6", "+1"])("rejects invalid supply %s", (supply) => {
    expect(tokenIdentityErrors(identity({ initialSupply: supply })).initialSupply).toBeDefined();
  });

  it("accepts the largest whole-token supply that fits uint256 with 18 decimals", () => {
    expect(
      tokenIdentityErrors(identity({ initialSupply: MAX_WHOLE_TOKEN_SUPPLY.toString() }))
        .initialSupply
    ).toBeUndefined();
    expect(
      tokenIdentityErrors(identity({ initialSupply: (MAX_WHOLE_TOKEN_SUPPLY + 1n).toString() }))
        .initialSupply
    ).toContain("cannot exceed");
  });
});
