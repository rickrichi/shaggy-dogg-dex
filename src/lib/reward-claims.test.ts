import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRewardManifests, readRewardStatus, verifyRewardDeployment } from "./reward-claims";

import type { RewardDeployment, RewardManifest } from "./rewards";

const account = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const deployment: RewardDeployment = {
  chainId: 8453,
  distributor: "0x00000000000000000000000000000000000000D1",
  rewardToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  deploymentBlock: "1",
  epochOrigin: 1_700_000_000,
  indexUrl: "/rewards/index.json",
};
const manifest = {
  epochId: "1",
  distributor: deployment.distributor,
  root: `0x${"11".repeat(32)}`,
  ledgerHash: `0x${"22".repeat(32)}`,
  allocation: "100",
  claims: [{ account, amount: "60", proof: [] }],
} as unknown as RewardManifest;

function respond(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

describe("loadRewardManifests", () => {
  it("returns no epochs for an empty index", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ version: 1, epochs: [] })));
    await expect(loadRewardManifests(deployment, new AbortController().signal)).resolves.toEqual([]);
  });

  it.each([
    ["an off-origin path", { version: 1, epochs: [{ epochId: "1", path: "https://evil.example/1.json" }] }],
    ["a path for another epoch", { version: 1, epochs: [{ epochId: "1", path: "/rewards/epochs/2.json" }] }],
    ["an unknown version", { version: 2, epochs: [] }],
  ])("rejects an index with %s", async (_, index) => {
    const fetchMock = vi.fn().mockResolvedValue(respond(index));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadRewardManifests(deployment, new AbortController().signal)).rejects.toThrow(/Invalid reward index/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-standard index location", async () => {
    await expect(
      loadRewardManifests({ ...deployment, indexUrl: "https://evil.example/index.json" }, new AbortController().signal),
    ).rejects.toThrow(/location/);
  });
});

describe("on-chain checks", () => {
  const client = (values: Record<string, unknown>) => ({
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => values[functionName]),
  });

  it("rejects a distributor configured for another token or origin", async () => {
    await expect(verifyRewardDeployment(client({
      rewardToken: deployment.rewardToken, epochOrigin: 1n, decimals: 6,
    }) as never, deployment)).rejects.toThrow(/do not match/);
    await expect(verifyRewardDeployment(client({
      rewardToken: deployment.rewardToken, epochOrigin: 1_700_000_000n, decimals: 6,
    }) as never, deployment)).resolves.toBeUndefined();
  });

  it("is valid only when root, ledger hash and funded allocation match", async () => {
    const funded = [manifest.root, manifest.ledgerHash, 100n, 0n];
    await expect(readRewardStatus(client({ epochs: funded, hasClaimed: false }) as never, manifest, account))
      .resolves.toMatchObject({ valid: true, claimed: false, allocation: { amount: "60" } });
    await expect(readRewardStatus(client({ epochs: [manifest.root, `0x${"99".repeat(32)}`, 100n, 0n], hasClaimed: false }) as never, manifest, account))
      .resolves.toMatchObject({ valid: false });
    await expect(readRewardStatus(client({ epochs: [manifest.root, manifest.ledgerHash, 100n, 50n], hasClaimed: false }) as never, manifest, account))
      .resolves.toMatchObject({ valid: false });
  });
});
