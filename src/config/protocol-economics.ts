// src/config/protocol-economics.ts
export interface ProtocolEconomicsConfig {
  status: "approved-not-live" | "finalized" | "draft" | "proposal-awaiting-owner-decision";
  chainId: number;
  enabled: boolean;
  rewards: {
    asset: `0x${string}`;
    assetSymbol: string;
    assetDecimals: number;
    stakerShareBps: number;
    treasuryShareBps: number;
    epochDays: number;
    profitBasis: string;
    eligibility: string;
    funding: string;
    unsettledExecutions: string;
    rounding: string;
  };
  governance: {
    mode: "advisory" | "binding";
    votingPeriodDays: number;
    quorumBps: number;
    approvalBps: number;
    votingPower: string;
    contractExecutionAuthority: boolean;
    automaticTreasuryAccess: boolean;
  };
}

export const PROTOCOL_ECONOMICS: ProtocolEconomicsConfig = {
  // Terms are approved, but nothing is paid: no distributor is deployed and the staking
  // contract has no reward function. Keep `enabled` false until payouts actually exist.
  status: "approved-not-live",
  chainId: 8453,
  enabled: false,
  rewards: {
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    assetSymbol: "USDC",
    assetDecimals: 6,
    stakerShareBps: 1000,
    treasuryShareBps: 9000,
    epochDays: 7,
    profitBasis: "settled-proceeds-minus-capital-fees-gas-and-carried-losses",
    eligibility: "time-weighted-AMUTT-staked-during-epoch",
    funding: "realized-USDC-only",
    unsettledExecutions: "block-epoch-finalization",
    rounding: "down-to-USDC-base-units; carry-dust-forward",
  },
  governance: {
    mode: "advisory",
    votingPeriodDays: 7,
    quorumBps: 500,
    approvalBps: 5001,
    votingPower: "AMUTT-staked-at-finalized-snapshot-block",
    contractExecutionAuthority: false,
    automaticTreasuryAccess: false,
  },
} as const;

export const BPS_DENOMINATOR = 10_000;

export function calculateProfitSplit(netProfitUsd: number) {
  if (netProfitUsd <= 0) {
    return {
      stakerRewardPoolUsd: 0,
      treasuryShareUsd: 0,
      carriedLossUsd: Math.abs(netProfitUsd),
    };
  }
  const stakerRewardPoolUsd =
    (netProfitUsd * PROTOCOL_ECONOMICS.rewards.stakerShareBps) / BPS_DENOMINATOR;
  const treasuryShareUsd =
    (netProfitUsd * PROTOCOL_ECONOMICS.rewards.treasuryShareBps) / BPS_DENOMINATOR;
  return {
    stakerRewardPoolUsd,
    treasuryShareUsd,
    carriedLossUsd: 0,
  };
}
