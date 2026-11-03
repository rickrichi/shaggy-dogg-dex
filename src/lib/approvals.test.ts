import { describe, expect, it, vi } from "vitest";

import { approvalSequence } from "./approvals";

const TARGET = {
  token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  owner: "0x00000000000000000000000000000000c0ffee01",
  spender: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  amount: 200n,
} as const;

const client = (allowance: bigint, directApproveReverts = false) => ({
  readContract: vi.fn().mockResolvedValue(allowance),
  simulateContract: vi.fn(() =>
    directApproveReverts ? Promise.reject(new Error("reverted")) : Promise.resolve({ request: {} })
  ),
});

describe("approvalSequence", () => {
  it("needs nothing when the allowance already covers the amount", async () => {
    const c = client(200n);
    expect(await approvalSequence(c as never, TARGET)).toEqual([]);
    expect(c.simulateContract).not.toHaveBeenCalled();
  });

  it("approves the exact amount from zero", async () => {
    const c = client(0n);
    expect(await approvalSequence(c as never, TARGET)).toEqual([200n]);
    expect(c.simulateContract).not.toHaveBeenCalled();
  });

  it("raises a leftover allowance directly when the token allows it", async () => {
    const c = client(100n);
    expect(await approvalSequence(c as never, TARGET)).toEqual([200n]);
    expect(c.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "approve", args: [TARGET.spender, 200n] })
    );
  });

  it("resets to zero first for a USDT-style token that refuses non-zero to non-zero", async () => {
    expect(await approvalSequence(client(100n, true) as never, TARGET)).toEqual([0n, 200n]);
  });
});
