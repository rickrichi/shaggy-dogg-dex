import { type Address, parseAbi, type PublicClient } from "viem";

import { SPONSORED_REWARD_PAYMASTER_ABI } from "./artifact";

export const BASE_ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
export const BASE_ENTRYPOINT_V08 = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as const;
export const METAMASK_7702_DELEGATOR_ON_BASE =
  "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B" as const;
export const SIMPLE_7702_ACCOUNT_ON_BASE =
  "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
export const MRWD_ON_BASE = "0xC17227AAa33C54634B6cE7AD0bf33A156563c179" as const;
export const SPONSORED_REWARD_PAYMASTER_ON_BASE =
  "0x221A9765844511Ef01E383273b396c45372E462a" as const;

const entryPointStakeAbi = parseAbi([
  "function getDepositInfo(address account) view returns ((uint256 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime) info)",
]);

export const rewardTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address recipient, uint256 amount) returns (bool)",
]);

export interface PaymasterStatus {
  address: Address;
  entryPoint: Address;
  owner: Address;
  pendingOwner: Address;
  signer: Address;
  rewardToken: Address;
  rewardSymbol: string;
  rewardDecimals: number;
  rewardAmount: bigint;
  availableRewards: bigint;
  reservedRewards: bigint;
  maxCostPerOp: bigint;
  cooldownSeconds: number;
  paused: boolean;
  deposit: bigint;
  stake: bigint;
  staked: boolean;
  unstakeDelaySec: number;
  withdrawTime: number;
}

export async function readPaymasterStatus(
  client: PublicClient,
  address: Address
): Promise<PaymasterStatus> {
  if (client.chain?.id !== 8453) throw new Error("Paymaster monitoring requires Base Mainnet.");
  const code = await client.getBytecode({ address });
  if (!code || code === "0x") throw new Error("No contract exists at that address on Base.");

  const [
    entryPoint,
    owner,
    pendingOwner,
    signer,
    rewardToken,
    rewardAmount,
    availableRewards,
    reservedRewards,
    maxCostPerOp,
    cooldownSeconds,
    paused,
  ] = await Promise.all([
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "entryPoint",
    }),
    client.readContract({ address, abi: SPONSORED_REWARD_PAYMASTER_ABI, functionName: "owner" }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "pendingOwner",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "sponsorSigner",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "rewardToken",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "rewardAmount",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "availableRewards",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "reservedRewards",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "maxCostPerOp",
    }),
    client.readContract({
      address,
      abi: SPONSORED_REWARD_PAYMASTER_ABI,
      functionName: "cooldownSeconds",
    }),
    client.readContract({ address, abi: SPONSORED_REWARD_PAYMASTER_ABI, functionName: "paused" }),
  ]);
  const epLower = entryPoint.toLowerCase();
  if (
    epLower !== BASE_ENTRYPOINT_V07.toLowerCase() &&
    epLower !== BASE_ENTRYPOINT_V08.toLowerCase()
  ) {
    throw new Error(
      "That contract uses a different EntryPoint. This console supports ERC-4337 v0.7 and v0.8."
    );
  }
  if (rewardToken.toLowerCase() !== MRWD_ON_BASE.toLowerCase()) {
    throw new Error("That paymaster rewards a different token. This program rewards MRWD.");
  }
  const [depositInfo, decimals, symbol] = await Promise.all([
    client.readContract({
      address: entryPoint,
      abi: entryPointStakeAbi,
      functionName: "getDepositInfo",
      args: [address],
    }),
    client.readContract({ address: rewardToken, abi: rewardTokenAbi, functionName: "decimals" }),
    client.readContract({ address: rewardToken, abi: rewardTokenAbi, functionName: "symbol" }),
  ]);
  return {
    address,
    entryPoint,
    owner,
    pendingOwner,
    signer,
    rewardToken,
    rewardSymbol: symbol,
    rewardDecimals: decimals,
    rewardAmount,
    availableRewards,
    reservedRewards,
    maxCostPerOp,
    cooldownSeconds,
    paused,
    deposit: depositInfo.deposit,
    stake: depositInfo.stake,
    staked: depositInfo.staked,
    unstakeDelaySec: depositInfo.unstakeDelaySec,
    withdrawTime: Number(depositInfo.withdrawTime),
  };
}
