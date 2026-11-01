import { describe, expect, it } from "vitest";

import { getSwapDropdownTokens } from "@/config/tokens";
import { tokenWatchlistForChain } from "@/lib/tokens";

import { CANONICAL_LAUNCHED_TOKENS } from "./storage";
import { tradeLinkFor } from "./tradeLink";

const SD = "0x051c758521971f5c5a84edaf18eea12854375469";

describe("tradeLinkFor", () => {
  it("uses the parameter Swap actually reads for a listed token", () => {
    expect(tradeLinkFor(SD)).toEqual({
      href: `/swap?output=${SD}`,
      external: false,
      label: "Trade Swap",
    });
  });

  it("matches addresses whatever their casing", () => {
    expect(tradeLinkFor(SD.toUpperCase().replace("0X", "0x") as `0x${string}`).external).toBe(
      false
    );
  });

  it("sends an unlisted launched token to Uniswap, not a wrong pair", () => {
    const token = "0x1111111111111111111111111111111111111111";
    expect(tradeLinkFor(token)).toMatchObject({
      href: `https://app.uniswap.org/swap?chain=base&outputCurrency=${token}`,
      external: true,
    });
  });

  it("keeps every project token with a market on this app's Swap", () => {
    for (const token of CANONICAL_LAUNCHED_TOKENS.filter((t) => !t.tradeNote)) {
      expect(tradeLinkFor(token.tokenAddress).external).toBe(false);
    }
  });
});

describe("project tokens", () => {
  const find = (symbol: string) =>
    CANONICAL_LAUNCHED_TOKENS.find((token) => token.tokenSymbol === symbol)!;

  it("records the supply and type read from Base", () => {
    expect(find("SD")).toMatchObject({
      initialSupply: "1,000,000",
      typeLabel: "Mintable, admin-controlled",
    });
    expect(find("MRWD")).toMatchObject({
      initialSupply: "1,000,000,000,000",
      typeLabel: "Fixed supply, no admin",
    });
    expect(find("FBA").typeLabel).toBe("Mintable, admin-controlled");
  });

  it("are all in the Portfolio holdings list", () => {
    const listed = tokenWatchlistForChain(8453).tokens.map((token) => token.address.toLowerCase());
    for (const token of CANONICAL_LAUNCHED_TOKENS) {
      expect(listed).toContain(token.tokenAddress.toLowerCase());
    }
  });

  it("keeps EQX off Swap until it has a market", () => {
    expect(getSwapDropdownTokens(8453).map((token) => token.symbol)).not.toContain("EQX");
    expect(getSwapDropdownTokens(8453).map((token) => token.symbol)).toContain("MRWD");
  });

  it("lists EQX as restricted, with no market to send people to", () => {
    expect(find("EQX")).toMatchObject({
      initialSupply: "150,000,000",
      typeLabel: "Restricted share token",
      tradeNote: "Not trading yet",
    });
  });

  it("belongs to the project wallet, so they appear under My Tokens", () => {
    for (const token of CANONICAL_LAUNCHED_TOKENS) {
      expect(token.creatorAddress).toBe("0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98");
    }
  });
});
