import { describe, expect, it } from "vitest";

import { ARBITRAGE_PAGE_META, TAB_ALIASES, TAB_URL_PATHS } from "./Arbitrage";

describe("Arbitrage Sub-Page Routing & Metadata Configuration", () => {
  it("defines distinct page titles and descriptions for all 7 sub-views", () => {
    const requiredViews = [
      "matrix",
      "cedefi",
      "autopilot",
      "triangular",
      "dualpool",
      "flashloan",
      "console",
    ];

    const names = new Set<string>();
    const subtitles = new Set<string>();
    const docTitles = new Set<string>();

    for (const viewId of requiredViews) {
      const meta = ARBITRAGE_PAGE_META[viewId];
      expect(meta).toBeDefined();
      if (!meta) throw new Error(`Missing metadata for ${viewId}`);
      expect(meta.id).toBe(viewId);
      expect(meta.name.length).toBeGreaterThan(5);
      expect(meta.subtitle.length).toBeGreaterThan(10);
      expect(meta.documentTitle.length).toBeGreaterThan(5);
      expect(meta.badge.length).toBeGreaterThan(2);

      // Verify each sub-page has a completely UNIQUE name, subtitle, and browser tab title
      expect(names.has(meta.name)).toBe(false);
      expect(subtitles.has(meta.subtitle)).toBe(false);
      expect(docTitles.has(meta.documentTitle)).toBe(false);

      names.add(meta.name);
      subtitles.add(meta.subtitle);
      docTitles.add(meta.documentTitle);
    }

    expect(names.size).toBe(7);
  });

  it("assigns appropriate metadata to the 100-pair matrix view", () => {
    const matrixMeta = ARBITRAGE_PAGE_META.matrix;
    expect(matrixMeta.name).toContain("Spot Arbitrage Pair Matrix");
    expect(matrixMeta.subtitle).toContain("Kraken balances");
    expect(matrixMeta.documentTitle).toContain("Pair Matrix");
  });

  it("assigns appropriate metadata to CeDeFi L2 Books view", () => {
    const cedeFiMeta = ARBITRAGE_PAGE_META.cedefi;
    expect(cedeFiMeta.name).toContain("CeDeFi L2 Order Book Scanner");
    expect(cedeFiMeta.badge).toContain("CCXT Pro");
    expect(cedeFiMeta.subtitle).toContain("Level-2");
  });

  it("assigns appropriate metadata to AI Auto-Pilot view", () => {
    const autopilotMeta = ARBITRAGE_PAGE_META.autopilot;
    expect(autopilotMeta.name).toContain("AI Autonomous Arbitrage Auto-Pilot");
    expect(autopilotMeta.category).toContain("Autonomous Multi-Strategy MEV");
  });

  it("maps URL path segments accurately to canonical sub-views", () => {
    expect(TAB_URL_PATHS.matrix).toBe("matrix");
    expect(TAB_URL_PATHS.cedefi).toBe("cedefi");
    expect(TAB_URL_PATHS.autopilot).toBe("autopilot");
    expect(TAB_URL_PATHS.triangular).toBe("triangular");
    expect(TAB_URL_PATHS.dualpool).toBe("cross-dex");
    expect(TAB_URL_PATHS.flashloan).toBe("flash-loans");
    expect(TAB_URL_PATHS.console).toBe("console");

    // Verify aliases
    expect(TAB_ALIASES["100-pair-matrix"]).toBe("matrix");
    expect(TAB_ALIASES["cross-dex"]).toBe("dualpool");
    expect(TAB_ALIASES["flash-loans"]).toBe("flashloan");
    expect(TAB_ALIASES["ai-autopilot"]).toBe("autopilot");
  });
});
