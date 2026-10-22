import { erc20Abi } from "viem";

import { parseRewardManifest, REWARD_ABI } from "@/lib/rewards";

import type { Address, PublicClient } from "viem";
import type { RewardDeployment, RewardManifest } from "@/lib/rewards";

const MAX_EPOCHS = 520;
const MAX_MANIFEST_BYTES = 2_000_000;

async function readJson(path: string, limit: number, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error("Reward records could not be loaded. Please try again.");
  if (Number(response.headers.get("content-length")) > limit || !response.body) {
    throw new Error("Reward record is unavailable or too large.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error("Reward record is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function loadRewardManifests(deployment: RewardDeployment, signal: AbortSignal) {
  if (deployment.indexUrl !== "/rewards/index.json") throw new Error("Invalid reward index location.");
  const index = await readJson(deployment.indexUrl, 100_000, signal) as {
    version?: unknown; epochs?: unknown;
  } | null;
  if (index?.version !== 1 || !Array.isArray(index.epochs) || index.epochs.length > MAX_EPOCHS) {
    throw new Error("Invalid reward index. Allocations are temporarily unavailable.");
  }
  const entries = new Map<string, string>();
  for (const entry of index.epochs as Array<{ epochId?: unknown; path?: unknown } | null>) {
    if (!entry || typeof entry.epochId !== "string" || !/^[1-9][0-9]{0,77}$/.test(entry.epochId) ||
        entry.path !== `/rewards/epochs/${entry.epochId}.json`) {
      throw new Error("Invalid reward index entry.");
    }
    entries.set(entry.epochId, entry.path);
  }
  const manifests: RewardManifest[] = [];
  // Small batches bound network concurrency and parser work.
  const uniqueEntries = [...entries];
  for (let i = 0; i < uniqueEntries.length; i += 4) {
    const batch = await Promise.all(uniqueEntries.slice(i, i + 4).map(async ([epochId, path]) => {
      const manifest = parseRewardManifest(await readJson(path, MAX_MANIFEST_BYTES, signal), deployment);
      if (manifest.epochId !== epochId) throw new Error("Reward epoch does not match its index.");
      return manifest;
    }));
    manifests.push(...batch);
  }
  return manifests.sort((a, b) => BigInt(a.epochId) > BigInt(b.epochId) ? -1 : 1);
}

export async function verifyRewardDeployment(client: Pick<PublicClient, "readContract">, deployment: RewardDeployment) {
  if (!deployment.distributor || deployment.epochOrigin === null) throw new Error("Rewards are not available yet.");
  const [token, origin, decimals] = await Promise.all([
    client.readContract({ address: deployment.distributor, abi: REWARD_ABI, functionName: "rewardToken" }),
    client.readContract({ address: deployment.distributor, abi: REWARD_ABI, functionName: "epochOrigin" }),
    client.readContract({ address: deployment.rewardToken, abi: erc20Abi, functionName: "decimals" }),
  ]);
  if (token.toLowerCase() !== deployment.rewardToken.toLowerCase() || origin !== BigInt(deployment.epochOrigin) || decimals !== 6) {
    throw new Error("Reward contract settings do not match. Claims are unavailable.");
  }
}

export async function readRewardStatus(client: Pick<PublicClient, "readContract">, manifest: RewardManifest, account: Address) {
  const [epoch, claimed] = await Promise.all([
    client.readContract({ address: manifest.distributor, abi: REWARD_ABI, functionName: "epochs", args: [BigInt(manifest.epochId)] }),
    client.readContract({ address: manifest.distributor, abi: REWARD_ABI, functionName: "hasClaimed", args: [BigInt(manifest.epochId), account] }),
  ]);
  const allocation = manifest.claims.find((claim) => claim.account.toLowerCase() === account.toLowerCase());
  const valid = epoch[0].toLowerCase() === manifest.root.toLowerCase() &&
    epoch[1].toLowerCase() === manifest.ledgerHash.toLowerCase() &&
    epoch[2] === BigInt(manifest.allocation) && epoch[2] > 0n && epoch[3] <= epoch[2] &&
    (!allocation || claimed || epoch[2] - epoch[3] >= BigInt(allocation.amount));
  return { manifest, allocation, claimed, valid };
}
