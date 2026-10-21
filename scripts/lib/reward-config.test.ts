// scripts/lib/reward-config.test.ts
// Guards the published promise that project wallets do not share the staker pool.
import { readFileSync } from "node:fs";

import { getAddress, isAddress } from "viem";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync("config/reward-deployment.json", "utf8")) as {
  owner: string;
  excludedAccounts: Array<{ address: string; label: string }>;
};

describe("reward deployment configuration", () => {
  const excluded = config.excludedAccounts.map((e) => getAddress(e.address));

  it("lists valid, labelled, unique exclusions", () => {
    for (const entry of config.excludedAccounts) {
      expect(isAddress(entry.address)).toBe(true);
      expect(entry.label.trim()).not.toBe("");
    }
    expect(new Set(excluded).size).toBe(excluded.length);
  });

  it("excludes the distributor owner and the AMUTT project wallet", () => {
    expect(excluded).toContain(getAddress(config.owner));
    expect(excluded).toContain(getAddress("0x88315fb3A3dC6ce4c997caeCdc74637C72857d28"));
  });
});
