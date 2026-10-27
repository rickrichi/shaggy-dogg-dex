import { describe, expect, it } from "vitest";

import { PRO_STAKE, proLockedThrough } from "./mrwd-pro";

const B = 10n ** 27n; // 1 billion MRWD in base units

describe("proLockedThrough", () => {
  it("is null without enough locked MRWD", () => {
    expect(proLockedThrough([], PRO_STAKE, 100n)).toBeNull();
    expect(proLockedThrough([{ amount: B - 1n, unlockAt: 500n }], PRO_STAKE, 100n)).toBeNull();
  });

  it("returns the unlock time of a single sufficient deposit", () => {
    expect(proLockedThrough([{ amount: B, unlockAt: 500n }], PRO_STAKE, 100n)).toBe(500n);
  });

  it("counts later deposits first, so the result is the latest time enough stays locked", () => {
    const deposits = [
      { amount: B / 2n, unlockAt: 300n },
      { amount: B / 2n, unlockAt: 900n },
      { amount: B / 2n, unlockAt: 600n },
    ];
    expect(proLockedThrough(deposits, PRO_STAKE, 100n)).toBe(600n);
  });

  it("ignores deposits that have already unlocked", () => {
    expect(proLockedThrough([{ amount: 2n * B, unlockAt: 100n }], PRO_STAKE, 100n)).toBeNull();
  });
});
