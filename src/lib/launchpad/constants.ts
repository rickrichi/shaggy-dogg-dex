// src/lib/launchpad/constants.ts
import type { Address } from "viem";
import type { ArchetypeDefinition, DexVenueDefinition } from "./types";

export const CANONICAL_BASE_CONTRACTS = {
  WETH: "0x4200000000000000000000000000000000000006" as Address,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  AaveV3Pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address,
  aUSDC: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" as Address,
  MoonwellComptroller: "0xFbb21d0380bee3312b33C4353c7936a0F13ef26C" as Address,
  MoonwellWethMarket: "0x628ff693426583D9a7FB391E54366292F509D457" as Address,
  MoonwellUsdcMarket: "0xeDC817a28e8B93Ca120334C48696d70d740E7D2B" as Address,
  MorphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as Address,
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
  AtomicFlashArbitrageRouter: "0x70315019d12a11556c837970675cdc8fa54d186b" as Address,
  CompoundComet: "0xb125E6687d4313864e53df431d5425969c15Eb2F" as Address,
  DeployerAdminWallet: "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98" as Address,
};

export const LAUNCHPAD_ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: "standard_governance",
    name: "Standard Fixed-Supply ERC-20",
    category: "Standard",
    badge: "Lightweight",
    description:
      "Fixed-supply standard token: the whole supply is created once at deployment, with no mint function, owner, or admin. Ready for DEX trading and wallet custody.",
    architectureDetails:
      "Direct deployment of FixedSupplyToken.sol with 100% genesis allocation to creator.",
    protocolsReferenced: ["ERC-20"],
    contractsDeployed: ["FixedSupplyToken.sol"],
    riskContagionModel: "None",
  },
  {
    id: "staking_rewards",
    name: "Staking & Loyalty Ecosystem",
    category: "Staking & Loyalty",
    badge: "Community Driven",
    description:
      "Bundles your token with a single-sided staking vault featuring 4 VIP fee discount tiers and time-lock dump protection.",
    architectureDetails:
      "Deploys FixedSupplyToken.sol + FeeDiscountStaking.sol linked together with configurable lock duration and early exit fees.",
    protocolsReferenced: ["Shaggy Mutt VIP Staking", "Uniswap V2 Fee Tier"],
    contractsDeployed: ["FixedSupplyToken.sol", "FeeDiscountStaking.sol"],
    riskContagionModel: "Sovereign",
  },
  {
    id: "moonwell_lending",
    name: "Moonwell Base Flagship Money Market",
    category: "Next-Gen Lending",
    badge: "Base Native Flagship",
    description:
      "Connects your token to Moonwell—the dominant native lending protocol on Base Layer 2. Enables high-speed, sub-cent lending.",
    architectureDetails:
      "Deploys FixedSupplyToken + IsolatedLendingVault wired to Moonwell mToken markets with creator treasury fee streaming.",
    protocolsReferenced: ["Moonwell Finance", "Compound v2/v3 Architecture", "Base L2"],
    contractsDeployed: [
      "FixedSupplyToken.sol",
      "IsolatedLendingVault.sol",
      "FeeDiscountStaking.sol",
    ],
    riskContagionModel: "Pooled",
  },
  {
    id: "morpho_blue_isolated",
    name: "Morpho Blue Isolated Risk Primitive",
    category: "Isolated Risk",
    badge: "Zero Contagion",
    description:
      "Next-generation isolated market architecture. Prevents bad-debt spillover by decoupling collateral into independent 2-asset markets.",
    architectureDetails:
      "Deploys FixedSupplyToken + IsolatedLendingVault with custom LLTV (Liquidation Loan-to-Value) parameters targeting Morpho Blue.",
    protocolsReferenced: ["Morpho Blue", "ERC-4626 Vault Standard", "Base L2"],
    contractsDeployed: ["FixedSupplyToken.sol", "IsolatedLendingVault.sol"],
    riskContagionModel: "Isolated",
  },
  {
    id: "silo_isolated_vault",
    name: "Silo / Sovereign ERC-4626 Vault",
    category: "Isolated Risk",
    badge: "Risk Isolated",
    description:
      "Autonomous dual-asset bridge market (Token + USDC or Token + ETH). Localized liquidations guarantee zero systemic contagion.",
    architectureDetails:
      "Deploys FixedSupplyToken + IsolatedLendingVault acting as a sovereign standalone lending pool for your token.",
    protocolsReferenced: ["Silo Finance Concept", "ERC-4626 Tokenized Vaults"],
    contractsDeployed: [
      "FixedSupplyToken.sol",
      "IsolatedLendingVault.sol",
      "FeeDiscountStaking.sol",
    ],
    riskContagionModel: "Isolated",
  },
  {
    id: "aave_v3_yield",
    name: "Aave v3 CeDeFi Vault",
    category: "Next-Gen Lending",
    badge: "Deepest Liquidity",
    description:
      "Supplies stablecoin/ETH reserves to Aave v3 on Base to capture institutional lending APR while streaming performance fees to treasury.",
    architectureDetails:
      "Deploys FixedSupplyToken + YieldStakingVault wired directly to Aave v3 Pool (0xA238Dd...8d1c5).",
    protocolsReferenced: ["Aave v3 Base", "aToken Yield Streaming"],
    contractsDeployed: ["FixedSupplyToken.sol", "YieldStakingVault.sol", "FeeDiscountStaking.sol"],
    riskContagionModel: "Pooled",
  },
  {
    id: "fluid_hybrid_amm",
    name: "Fluid AMM-Lending Hybrid Engine",
    category: "Next-Gen Lending",
    badge: "Capital Efficient",
    description:
      "Merges automated market making with lending. LP positions simultaneously capture DEX swap fees while acting as collateral.",
    architectureDetails:
      "Deploys FixedSupplyToken + FeeDiscountStaking + Uniswap V2 LP Yield Vault.",
    protocolsReferenced: ["Fluid Concept", "Uniswap V2 LP", "Dual Yield Engine"],
    contractsDeployed: ["FixedSupplyToken.sol", "IsolatedLendingVault.sol", "Uniswap V2 Pair"],
    riskContagionModel: "Sovereign",
  },
  {
    id: "full_defi_suite",
    name: "Full Sovereign Protocol Suite",
    category: "Full Suite",
    badge: "Enterprise",
    description:
      "The complete 5-contract Shaggy Dogg DeFi suite: Token + Staking + Aave Vault + Compound Vault + Uncollateralized Flash Loan Arbitrageur.",
    architectureDetails:
      "All 5 core contracts deployed and cross-linked with 100% root ownership assigned to your wallet.",
    protocolsReferenced: ["Aave v3", "Compound v3", "Uniswap V2", "Moonwell"],
    contractsDeployed: [
      "FixedSupplyToken.sol",
      "FeeDiscountStaking.sol",
      "YieldStakingVault.sol",
      "CompoundYieldVault.sol",
      "AaveFlashBorrower.sol",
    ],
    riskContagionModel: "Sovereign",
  },
];

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
