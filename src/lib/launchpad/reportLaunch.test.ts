import { describe, expect, it, vi } from "vitest";

import { reportLaunch } from "./reportLaunch";

const hash = `0x${"ab".repeat(32)}` as const;

describe("launch reporting", () => {
  it("posts the deployment transaction for server-side verification", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    await expect(reportLaunch(hash, fetchImpl)).resolves.toEqual({ recorded: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/launches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash: hash }),
    });
  });

  it("reports the server's rejection reason and never throws", async () => {
    const rejected = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ reason: "not_launchpad_template" }), { status: 422 })
      );
    await expect(reportLaunch(hash, rejected)).resolves.toEqual({
      recorded: false,
      reason: "not_launchpad_template",
    });
    const offline = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    await expect(reportLaunch(hash, offline)).resolves.toEqual({
      recorded: false,
      reason: "Failed to fetch",
    });
  });
});
