import { encodeAbiParameters, getAddress, isAddress, keccak256, parseAbi } from "viem";

import type { Address, Hex } from "viem";

export const REWARD_WEEK = 604_800;
export const REWARD_ABI = parseAbi([
  "function rewardToken() view returns (address)",
  "function owner() view returns (address)",
  "function epochOrigin() view returns (uint64)",
  "function lastPublishedEpoch() view returns (uint256)",
  "function totalReserved() view returns (uint256)",
  "function epochs(uint256) view returns (bytes32 root, bytes32 ledgerHash, uint256 allocated, uint256 claimed)",
  "function hasClaimed(uint256,address) view returns (bool)",
  "function publishEpoch(uint256 epochId,bytes32 root,bytes32 ledgerHash,uint256 allocation)",
  "function claim(uint256 epochId,address account,uint256 amount,bytes32[] proof)",
  "event Claimed(uint256 indexed epochId,address indexed account,uint256 amount)",
  "event EpochPublished(uint256 indexed epochId,bytes32 root,bytes32 ledgerHash,uint256 allocation)",
]);

export interface RewardClaim {
  account: Address;
  amount: string;
  proof: Hex[];
}
export interface RewardManifest {
  version: 1;
  chainId: number;
  distributor: Address;
  rewardToken: Address;
  epochId: string;
  startTimestamp: number;
  endTimestamp: number;
  root: Hex;
  ledgerHash: Hex;
  allocation: string;
  claims: RewardClaim[];
}
export interface RewardDeployment {
  chainId: number;
  distributor: Address | null;
  rewardToken: Address;
  deploymentBlock: string | null;
  epochOrigin: number | null;
  indexUrl: string;
}

export const isBytes32 = (value: unknown): value is Hex =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
export const isUint = (value: unknown): value is string =>
  typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) < 2n ** 256n;

// Double hash separates leaves from 64-byte internal nodes. Chain and contract bind each proof.
export function rewardLeaf(chainId: number, distributor: Address, epochId: bigint, account: Address, amount: bigint): Hex {
  return keccak256(keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }],
    [BigInt(chainId), distributor, epochId, account, amount],
  )));
}
export function hashRewardPair(a: Hex, b: Hex): Hex {
  const [low, high] = BigInt(a) < BigInt(b) ? ([a, b] as const) : ([b, a] as const);
  return keccak256(`0x${low.slice(2)}${high.slice(2)}`);
}
export function verifyRewardProof(manifest: RewardManifest, claim: RewardClaim): boolean {
  let hash = rewardLeaf(manifest.chainId, manifest.distributor, BigInt(manifest.epochId), claim.account, BigInt(claim.amount));
  for (const sibling of claim.proof) hash = hashRewardPair(hash, sibling);
  return hash.toLowerCase() === manifest.root.toLowerCase();
}

export function parseRewardManifest(value: unknown, deployment: RewardDeployment): RewardManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid reward record.");
  const m = value as RewardManifest;
  if (m.version !== 1 || m.chainId !== deployment.chainId || !isAddress(m.distributor ?? "") ||
      m.distributor.toLowerCase() !== deployment.distributor?.toLowerCase() ||
      !isAddress(m.rewardToken ?? "") || m.rewardToken.toLowerCase() !== deployment.rewardToken.toLowerCase() ||
      !isUint(m.epochId) || BigInt(m.epochId) < 1n || !isUint(m.allocation) ||
      !isBytes32(m.root) || !isBytes32(m.ledgerHash) ||
      !Number.isSafeInteger(m.startTimestamp) || !Number.isSafeInteger(m.endTimestamp) ||
      deployment.epochOrigin === null ||
      BigInt(m.startTimestamp) !== BigInt(deployment.epochOrigin) + (BigInt(m.epochId) - 1n) * BigInt(REWARD_WEEK) ||
      m.endTimestamp - m.startTimestamp !== REWARD_WEEK || !Array.isArray(m.claims)) {
    throw new Error("Reward record does not match this deployment.");
  }
  const seen = new Set<string>();
  let sum = 0n;
  for (const claim of m.claims) {
    if (!isAddress(claim.account ?? "") || !isUint(claim.amount) || BigInt(claim.amount) === 0n ||
        !Array.isArray(claim.proof) || claim.proof.length > 64 || !claim.proof.every(isBytes32)) {
      throw new Error("Invalid reward allocation.");
    }
    const account = getAddress(claim.account);
    if (seen.has(account)) throw new Error("Duplicate reward recipient.");
    seen.add(account);
    if (!verifyRewardProof(m, claim)) throw new Error("Reward allocation proof is invalid.");
    sum += BigInt(claim.amount);
  }
  if (sum !== BigInt(m.allocation)) throw new Error("Reward allocation total is inconsistent.");
  return m;
}
