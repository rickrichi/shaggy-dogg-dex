import { describe, expect, it } from "vitest";

import {
  METAMASK_DESIGNATOR,
  sponsoredAccountProblem,
  SPONSORSHIP_UNAVAILABLE,
  SPONSORSHIP_UNAVAILABLE_REASONS,
} from "./accounts";
import { METAMASK_7702_DELEGATOR_ON_BASE, SIMPLE_7702_ACCOUNT_ON_BASE } from "./client";

const delegatedTo = (implementation: string) => `0xef0100${implementation.slice(2).toLowerCase()}`;

describe("sponsoredAccountProblem", () => {
  it("tells a plain browser wallet that the site cannot make it a smart account", () => {
    for (const code of [undefined, null, "0x"]) {
      const reason = sponsoredAccountProblem(code);
      expect(reason).toContain(SPONSORSHIP_UNAVAILABLE);
      expect(reason).toContain("cannot turn a browser wallet into one");
    }
  });

  it("tells a MetaMask Smart Account that MetaMask refuses the signature", () => {
    expect(METAMASK_DESIGNATOR).toBe(delegatedTo(METAMASK_7702_DELEGATOR_ON_BASE));
    const upper = METAMASK_DESIGNATOR.toUpperCase().replace("0X", "0x");
    for (const code of [METAMASK_DESIGNATOR, upper]) {
      const reason = sponsoredAccountProblem(code);
      expect(reason).toContain(SPONSORSHIP_UNAVAILABLE);
      expect(reason).toContain("MetaMask refuses to sign");
    }
  });

  it("tells a Simple 7702 account that it uses the wrong EntryPoint", () => {
    const reason = sponsoredAccountProblem(delegatedTo(SIMPLE_7702_ACCOUNT_ON_BASE));
    expect(reason).toContain("EntryPoint v0.8");
    expect(reason).toContain("paymaster runs on v0.7");
  });

  it("refuses any other delegation or contract wallet", () => {
    for (const code of [
      delegatedTo("0x000000000000000000000000000000000000dEaD"),
      "0x6080604052",
    ]) {
      expect(sponsoredAccountProblem(code)).toContain("does not support");
    }
  });

  it("explains every reason before a wallet is connected", () => {
    expect(SPONSORSHIP_UNAVAILABLE_REASONS).toContain("MetaMask refuses");
    expect(SPONSORSHIP_UNAVAILABLE_REASONS).toContain("Simple 7702");
  });
});
