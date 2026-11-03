import { isAddress } from "viem";
import { describe, expect, it } from "vitest";

import { BASE_MAINNET_TOKENS } from "./tokens";

describe("Base token catalog", () => {
  it("contains only ERC-20 addresses that viem can encode strictly", () => {
    const invalid = BASE_MAINNET_TOKENS.filter((token) => token.kind === "erc20").flatMap(
      (token) =>
        isAddress(token.address, { strict: true }) ? [] : [`${token.symbol}:${token.address}`]
    );

    expect(invalid).toEqual([]);
  });
});
