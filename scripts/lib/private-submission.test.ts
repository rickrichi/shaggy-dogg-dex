import { describe, expect, it } from "vitest";

import { privateSubmissionConfig } from "./private-submission";

describe("private submission policy", () => {
  it("rejects public endpoints, missing configuration and wrong-chain provider hosts", () => {
    expect(() => privateSubmissionConfig({})).toThrow();
    for (const endpoint of ["https://mainnet.base.org", "http://base-mainnet.g.alchemy.com/v2/test", "https://eth-mainnet.g.alchemy.com/v2/test", "https://base-mainnet.g.alchemy.com.evil.test/v2/test"]) {
      expect(() => privateSubmissionConfig({ PRIVATE_BASE_RPC_PROVIDER: "alchemy", PRIVATE_BASE_RPC_HTTP: endpoint })).toThrow();
    }
  });
  it("requires the documented provider configuration", () => {
    expect(privateSubmissionConfig({ PRIVATE_BASE_RPC_PROVIDER: "alchemy", PRIVATE_BASE_RPC_HTTP: "https://base-mainnet.g.alchemy.com/v2/test" }).provider).toBe("alchemy");
    expect(() => privateSubmissionConfig({ PRIVATE_BASE_RPC_PROVIDER: "quicknode", PRIVATE_BASE_RPC_HTTP: "https://example.quiknode.pro/key" })).toThrow();
  });
});
