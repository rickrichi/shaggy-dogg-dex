import { parseAbi } from "viem";

// FeeDiscountStaking's deployed interface; this contract has no permit deposit.
export const STAKING_ABI = parseAbi([
  "function token() view returns (address)",
  "function stakedBalance(address) view returns (uint256)",
  "function stakeTimestamp(address) view returns (uint256)",
  "function getTier(address) view returns (uint16)",
  "function tiersLength() view returns (uint256)",
  "function tiers(uint256) view returns (uint256 stakeRequired, uint16 discountBps)",
  "function minimumStakePeriod() view returns (uint256)",
  "function withdrawalFeeBps() view returns (uint16)",
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
]);

export const BASE_STAKING = {
  name: "Base Mainnet",
  tokenName: "Astro Mutt",
  tokenSymbol: "AMUTT",
  tokenAddress: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7",
  stakingAddress: "0x055BB4eD8d5464C25D71391E940ce53CA30845fC",
  explorerUrl: "https://basescan.org",
} as const;
