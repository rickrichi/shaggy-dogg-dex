// src/lib/launchpad/constants.ts
import { type Address, parseAbi } from "viem";

import type { ArchetypeDefinition, DexVenueDefinition, RetiredArchetypeId } from "./types";

export const CANONICAL_BASE_CONTRACTS = {
  WETH: "0x4200000000000000000000000000000000000006" as Address,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  AaveV3Pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address,
  aUSDC: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" as Address,
  UniswapV2Router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as Address,
  UniswapV2Factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" as Address,
  UniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  UniswapV3Factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
  UniswapV3PositionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address,
  UniswapV3QuoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as Address,
  PancakeSwapV2Router: "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb" as Address,
  PancakeSwapV2Factory: "0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E" as Address,
  AerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address,
  AerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address,
  AtomicFlashArbitrageRouter: "0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd" as Address,
  CompoundComet: "0xb125E6687d4313864e53df431d5425969c15Eb2F" as Address,
  DeployerAdminWallet: "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98" as Address,
  LaunchpadFees: "0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b" as Address,
};

export const LAUNCHPAD_FEES_ABI = parseAbi([
  "function feeAmount() view returns (uint256)",
  "function payLaunchFee(address project) external",
]);

export const AERODROME_ROUTER_ABI = parseAbi([
  "function addLiquidityETH(address token, bool stable, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256, uint256, uint256)",
]);

export const LAUNCHPAD_ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: "standard_governance",
    name: "Standard Fixed-Supply ERC-20",
    category: "Standard",
    badge: "Lightweight",
    description:
      "Fixed-supply standard token: the whole supply is created once at deployment, with no mint function, owner, or admin. It goes to your wallet, minus any share you seed as liquidity.",
    architectureDetails:
      "Direct deployment of FixedSupplyToken.sol. The supply goes to your wallet, then any share you seed moves into the pool.",
    protocolsReferenced: ["ERC-20"],
    contractsDeployed: ["FixedSupplyToken.sol"],
    riskContagionModel: "None",
    riskDescription:
      "No privileged token controls or additional protocol contracts. Market, liquidity, and ordinary smart-contract risks still apply.",
  },
  {
    id: "staking_rewards",
    name: "Staking & Loyalty Ecosystem",
    category: "Staking & Loyalty",
    badge: "Community Driven",
    description:
      "Adds single-sided token staking with a configurable lock and unstake fee. Four on-chain tier signals are created for compatible integrations; this staking-only package does not itself apply discounts or pay staking rewards.",
    architectureDetails:
      "Deploys FixedSupplyToken.sol + FeeDiscountStaking.sol with your initial lock, unstake fee, and four tier signals. The recipient wallet controls the staking administrator and tier administrator roles.",
    protocolsReferenced: ["Shaggy Mutt VIP Staking"],
    contractsDeployed: ["FixedSupplyToken.sol", "FeeDiscountStaking.sol"],
    riskContagionModel: "Sovereign",
    riskDescription:
      "Your administrator can change tiers, the lock for future stakes (hard-capped at 365 days), and the unstake fee (up to 50%, including for existing stakes), and can withdraw collected fees. Existing unlock times cannot be extended by an admin change. Adding stake resets the lock for the user's entire position.",
  },
  {
    id: "aave_v3_yield",
    name: "Aave v3 CeDeFi Vault",
    category: "Next-Gen Lending",
    badge: "Deepest Liquidity",
    description:
      "Adds a pooled USDC vault that supplies deposits to Aave v3. Your token is not deposited. Performance fees are realized on withdrawal and sent to your treasury; staking your token reduces that fee.",
    architectureDetails:
      "Deploys FixedSupplyToken + FeeDiscountStaking + YieldStakingVault with immutable Base USDC, Aave v3 Pool, and aUSDC addresses.",
    protocolsReferenced: ["Aave v3 Base", "aToken Yield Streaming"],
    contractsDeployed: ["FixedSupplyToken.sol", "YieldStakingVault.sol", "FeeDiscountStaking.sol"],
    riskContagionModel: "Pooled + Sovereign",
    riskDescription:
      "Depositors share Aave v3, USDC, smart-contract, liquidity, and pooled-accounting risks. The administrator can pause new deposits and lower the performance fee while shares exist, but cannot raise it until the vault is empty. The administrator can also change the treasury and recover Aave assets only back into the paused vault for withdrawals. Withdrawals stay available while paused.",
  },
  {
    id: "full_defi_suite",
    name: "Full Sovereign Protocol Suite",
    category: "Full Suite",
    badge: "Enterprise",
    description:
      "The complete 5-contract Shaggy Dogg DeFi suite: Token + Staking + Aave Vault + Compound Vault + Aave Flash Loan Arbitrage Router. Staking your token lowers the fee in both vaults. The supply goes to your wallet, minus any share you seed as liquidity.",
    architectureDetails:
      "Deploys FixedSupplyToken + FeeDiscountStaking + an Aave v3 USDC vault and a Compound v3 USDC vault, both with immutable Base USDC, Aave v3 Pool, aUSDC and USDC Comet addresses and both discounted by the same staking tiers, + AtomicFlashArbitrageRouter. Every admin role goes to your wallet; the deployer keeps none.",
    protocolsReferenced: ["Aave v3", "Compound v3", "Uniswap V2"],
    contractsDeployed: [
      "FixedSupplyToken.sol",
      "FeeDiscountStaking.sol",
      "YieldStakingVault.sol",
      "CompoundYieldVault.sol",
      "AtomicFlashArbitrageRouter.sol",
    ],
    riskContagionModel: "Pooled + Sovereign",
    riskDescription:
      "Each vault's depositors share its lending market (Aave v3 or Compound v3), USDC, smart-contract, liquidity, and pooled-accounting risks; the two vaults keep separate books. In both vaults the administrator can pause new deposits and lower the performance fee while shares exist, but cannot raise it until that vault is empty. The administrator can also change the treasury and recover market funds only back into the paused vault for withdrawals. Withdrawals stay available while paused. The flash arbitrage router holds no depositor funds: only the administrator and operators it approves can run it, every flash loan reverts unless Aave is repaid, and operators can move any other token the router holds.",
  },
];

/** Display names for tokens launched before these cards were retired. */
export const RETIRED_ARCHETYPE_NAMES: Record<RetiredArchetypeId, string> = {
  moonwell_lending: "Isolated Vault (retired)",
  morpho_blue_isolated: "Isolated Vault (retired)",
  silo_isolated_vault: "Isolated Vault (retired)",
  fluid_hybrid_amm: "Isolated Vault (retired)",
};

export const DEX_VENUES: DexVenueDefinition[] = [
  {
    id: "uniswap_v3",
    name: "Uniswap V3 (Base Concentrated)",
    routerAddress: CANONICAL_BASE_CONTRACTS.UniswapV3Router,
    factoryAddress: CANONICAL_BASE_CONTRACTS.UniswapV3Factory,
    network: "Base Mainnet",
    description:
      "Capital-efficient concentrated liquidity AMM on Base with flexible fee tiers and NFT positions.",
  },
  {
    id: "uniswap_v2",
    name: "Uniswap V2 (Base Canonical)",
    routerAddress: CANONICAL_BASE_CONTRACTS.UniswapV2Router,
    factoryAddress: CANONICAL_BASE_CONTRACTS.UniswapV2Factory,
    network: "Base Mainnet",
    description:
      "The most trusted, universally recognized constant product AMM with 0.30% compounding LP fee.",
  },
  {
    id: "pancakeswap_v2",
    name: "PancakeSwap V2 (Base)",
    routerAddress: CANONICAL_BASE_CONTRACTS.PancakeSwapV2Router,
    factoryAddress: CANONICAL_BASE_CONTRACTS.PancakeSwapV2Factory,
    network: "Base Mainnet",
    description: "High-speed multi-chain DEX with low swap fees and global brand presence.",
  },
  {
    id: "aerodrome",
    name: "Aerodrome Finance (Base Native)",
    routerAddress: CANONICAL_BASE_CONTRACTS.AerodromeRouter,
    factoryAddress: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address,
    network: "Base Mainnet",
    description: "The #1 native AMM on Base by total value locked with veAERO voting incentives.",
  },
];
