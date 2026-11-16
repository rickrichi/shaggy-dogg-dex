import { isAddress } from "viem";
import { describe, expect, it } from "vitest";

import { BASE_MAINNET_TOKENS } from "./tokens";

describe("Base token catalog", () => {
  it("includes the canonical DSNAK deployment", () => {
    expect(BASE_MAINNET_TOKENS).toContainEqual(
      expect.objectContaining({
        address: "0x3F6eB1ddBFc665A8760BC77d00125bA486871CfB",
        symbol: "DSNAK",
        name: "Doggy Snacks",
        decimals: 18,
        chainId: 8453,
      })
    );
  });

  it("contains only ERC-20 addresses that viem can encode strictly", () => {
    const invalid = BASE_MAINNET_TOKENS.filter((token) => token.kind === "erc20").flatMap(
      (token) =>
        isAddress(token.address, { strict: true }) ? [] : [`${token.symbol}:${token.address}`]
    );

    expect(invalid).toEqual([]);
  });
});
