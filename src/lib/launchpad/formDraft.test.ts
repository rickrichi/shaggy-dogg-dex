import { beforeEach, describe, expect, it } from "vitest";

import { clearFormDraft, loadFormDraft, saveFormDraft } from "./formDraft";

import type { LaunchpadFormState } from "./types";

const DEFAULTS: LaunchpadFormState = {
  tokenName: "",
  tokenSymbol: "",
  decimals: 18,
  initialSupply: "",
  description: "",
  selectedArchetype: "standard_governance",
  performanceFeeBps: 1000,
  stakingLockDays: 7,
  earlyUnstakeFeeBps: 100,
  enableDexSeeding: true,
  selectedDex: "uniswap_v3",
  pairAsset: "ETH",
  initialEthLiquidity: "0.01",
  initialTokenLiquidityPercent: 50,
  executionMode: "metamask",
  recipientAdminAddress: "",
};

describe("launchpad form draft", () => {
  beforeEach(() => sessionStorage.clear());

  it("starts from the defaults when nothing is saved or the draft is unreadable", () => {
    expect(loadFormDraft(DEFAULTS)).toEqual(DEFAULTS);
    sessionStorage.setItem("shaggy-launchpad-form-draft", "{not json");
    expect(loadFormDraft(DEFAULTS)).toEqual(DEFAULTS);
  });

  it("restores a saved draft", () => {
    const form = {
      ...DEFAULTS,
      tokenName: "Probe Token",
      tokenSymbol: "PRB",
      initialSupply: "1000000",
      selectedArchetype: "aave_v3_yield" as const,
      enableDexSeeding: false,
    };
    saveFormDraft(form);
    expect(loadFormDraft(DEFAULTS)).toEqual(form);
  });

  it("drops fields with the wrong type or a choice the wizard no longer offers", () => {
    sessionStorage.setItem(
      "shaggy-launchpad-form-draft",
      JSON.stringify({
        tokenName: "Kept",
        decimals: "18",
        performanceFeeBps: null,
        selectedArchetype: "moonwell_lending",
        selectedDex: "sushiswap",
        pairAsset: "DAI",
        enableDexSeeding: "yes",
        unknownField: 1,
      })
    );
    expect(loadFormDraft(DEFAULTS)).toEqual({ ...DEFAULTS, tokenName: "Kept" });
  });

  it("clears the draft after a launch", () => {
    saveFormDraft({ ...DEFAULTS, tokenName: "Launched" });
    clearFormDraft();
    expect(loadFormDraft(DEFAULTS)).toEqual(DEFAULTS);
  });
});
