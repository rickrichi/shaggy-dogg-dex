import { describe, expect, it } from "vitest";

import {
  aerodromeDepositUrl,
  BASE_DEX_VENUES,
  hasRewardProgram,
  MRWD_UNISWAP_V3_POOL,
  poolPlannerForVenue,
} from "./dex-venues";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const urlFor = (venue: string, fee = 2500) => poolPlannerForVenue(venue)!.liquidityUrl(A, B, fee);

describe("venue liquidity links", () => {
  it("leaves no venue without a way to add liquidity", () => {
    for (const { name } of BASE_DEX_VENUES) {
      expect(name === "Aerodrome" || Boolean(poolPlannerForVenue(name))).toBe(true);
    }
  });

  it("opens Uniswap on Base with the pair selected", () => {
    expect(urlFor("Uniswap V3")).toBe(
      `https://app.uniswap.org/positions/create/v3?currencyA=${A}&currencyB=${B}&chain=base`
    );
    expect(urlFor("Uniswap V2")).toBe(
      `https://app.uniswap.org/positions/create/v2?currencyA=${A}&currencyB=${B}&chain=base`
    );
  });

  it("opens PancakeSwap on Base with the pair and chosen fee tier", () => {
    expect(urlFor("PancakeSwap V3", 500)).toBe(
      `https://pancakeswap.finance/add/${A}/${B}/500?chain=base`
    );
    expect(urlFor("PancakeSwap V2")).toBe(
      `https://pancakeswap.finance/v2/add/${A}/${B}?chain=base`
    );
  });

  it("opens the Aerodrome deposit for the pair", () => {
    expect(aerodromeDepositUrl(A, B)).toBe(
      `https://aerodrome.finance/deposit?token0=${A}&token1=${B}`
    );
  });
});

describe("hasRewardProgram", () => {
  it("matches on venue and pool, whatever the address casing", () => {
    expect(hasRewardProgram("Uniswap V3", [MRWD_UNISWAP_V3_POOL.toLowerCase()])).toBe(true);
    expect(hasRewardProgram("Uniswap V2", [MRWD_UNISWAP_V3_POOL])).toBe(false);
    expect(hasRewardProgram("Uniswap V3", [])).toBe(false);
  });
});
