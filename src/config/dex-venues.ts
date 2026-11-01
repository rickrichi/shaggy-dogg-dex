import { BASE_V2_VENUES, BASE_V3_VENUES } from "@/config/contracts";
import { routeVenuesForChain, type SmartRouteVenue } from "@/lib/amm/smart-routing";

export type VenueKind = "v2" | "v3" | "aerodrome";

export interface DexVenueCapability {
  name: SmartRouteVenue;
  kind: VenueKind;
  ammType: string;
  factory?: `0x${string}`;
  fees?: readonly number[];
  rewardNote: string;
}

const DETAILS: Record<SmartRouteVenue, Omit<DexVenueCapability, "name">> = {
  "Uniswap V3": {
    kind: "v3",
    ammType: "Concentrated liquidity V3",
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    fees: [100, 500, 3000, 10000],
    rewardNote: "Rewards are unverified for this token and pool.",
  },
  "Uniswap V2": {
    kind: "v2",
    ammType: "Constant product V2",
    factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    rewardNote: "Fees only unless a separate incentive is confirmed.",
  },
  Aerodrome: {
    kind: "aerodrome",
    ammType: "Classic stable / volatile",
    factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    rewardNote: "AERO emissions require an eligible gauge and voter support.",
  },
  "PancakeSwap V3": {
    kind: "v3",
    ammType: "Concentrated liquidity V3",
    ...BASE_V3_VENUES["PancakeSwap V3"],
    rewardNote: "Farm eligibility must be confirmed separately.",
  },
  "SushiSwap V3": {
    kind: "v3",
    ammType: "Concentrated liquidity V3",
    ...BASE_V3_VENUES["SushiSwap V3"],
    rewardNote: "A separately funded incentive may be available; none is verified here.",
  },
  "PancakeSwap V2": {
    kind: "v2",
    ammType: "Constant product V2",
    ...BASE_V2_VENUES["PancakeSwap V2"],
    rewardNote: "Fees only unless a separate incentive is confirmed.",
  },
  "SushiSwap V2": {
    kind: "v2",
    ammType: "Constant product V2",
    ...BASE_V2_VENUES["SushiSwap V2"],
    rewardNote: "A separately funded incentive may be available; none is verified here.",
  },
  BaseSwap: {
    kind: "v2",
    ammType: "Constant product V2",
    ...BASE_V2_VENUES.BaseSwap,
    rewardNote: "Fees only unless a separate incentive is confirmed.",
  },
};

/** Venues shown for liquidity. BaseSwap still routes swaps, but its site is parked. */
export const BASE_DEX_VENUES: readonly DexVenueCapability[] = routeVenuesForChain(8453)
  .filter((name) => name !== "BaseSwap")
  .map((name) => ({ name, ...DETAILS[name] }));

/** Single source of truth for public Base routing claims. */
export const BASE_SWAP_VENUE_NAMES = routeVenuesForChain(8453);
export const BASE_SWAP_VENUE_LABEL = BASE_SWAP_VENUE_NAMES.join(", ");

export interface PoolPlannerConfig {
  name: SmartRouteVenue;
  dexName: string;
  protocol: "v2" | "v3";
  /** Base V2 swap fees, read from each router's getAmountOut on-chain. */
  swapFee?: string;
  /** Base V3 tier for volatile pairs, read from each factory's feeAmountTickSpacing. */
  volatileFeeTier?: { value: number; label: string };
  /** Opens the pair on Base. Addresses are used as-is, so native ETH arrives as WETH. */
  liquidityUrl: (token: string, quote: string, feeTier: number) => string;
  rewardsCondition: string;
}

/** Aerodrome keeps these through its connect screen and opens the deposit for the pair. */
export const aerodromeDepositUrl = (token: string, quote: string) =>
  `https://aerodrome.finance/deposit?token0=${token}&token1=${quote}`;

const PANCAKESWAP_PLANNER = {
  dexName: "PancakeSwap",
  rewardsCondition: "farm eligibility and rewards are",
} as const;

const uniswapCreateUrl = (version: "v2" | "v3", token: string, quote: string) =>
  `https://app.uniswap.org/positions/create/${version}?currencyA=${token}&currencyB=${quote}&chain=base`;

const POOL_PLANNERS: Partial<Record<string, PoolPlannerConfig>> = {
  "Uniswap V3": {
    name: "Uniswap V3",
    dexName: "Uniswap",
    protocol: "v3",
    volatileFeeTier: { value: 3000, label: "0.30%" },
    liquidityUrl: (token, quote) => uniswapCreateUrl("v3", token, quote),
    rewardsCondition: "a separately funded incentive is",
  },
  "Uniswap V2": {
    name: "Uniswap V2",
    dexName: "Uniswap",
    protocol: "v2",
    swapFee: "0.30%",
    liquidityUrl: (token, quote) => uniswapCreateUrl("v2", token, quote),
    rewardsCondition: "a separately funded incentive is",
  },
  "PancakeSwap V3": {
    ...PANCAKESWAP_PLANNER,
    name: "PancakeSwap V3",
    protocol: "v3",
    volatileFeeTier: { value: 2500, label: "0.25%" },
    liquidityUrl: (token, quote, feeTier) =>
      `https://pancakeswap.finance/add/${token}/${quote}/${feeTier}?chain=base`,
  },
  "SushiSwap V3": {
    name: "SushiSwap V3",
    dexName: "SushiSwap",
    protocol: "v3",
    volatileFeeTier: { value: 3000, label: "0.30%" },
    liquidityUrl: () => "https://www.sushi.com/base/pool/v3/add",
    rewardsCondition: "a separately funded incentive is",
  },
  "PancakeSwap V2": {
    ...PANCAKESWAP_PLANNER,
    name: "PancakeSwap V2",
    protocol: "v2",
    swapFee: "0.25%",
    liquidityUrl: (token, quote) =>
      `https://pancakeswap.finance/v2/add/${token}/${quote}?chain=base`,
  },
  "SushiSwap V2": {
    name: "SushiSwap V2",
    dexName: "SushiSwap",
    protocol: "v2",
    swapFee: "0.30%",
    liquidityUrl: () => "https://www.sushi.com/base/pool/v2/add",
    rewardsCondition: "a separately funded incentive is",
  },
};

/** Guided pool planner for a venue, if it has one. */
export const poolPlannerForVenue = (venue: string) => POOL_PLANNERS[venue];

export const MRWD_ADDRESS = "0xC17227AAa33C54634B6cE7AD0bf33A156563c179" as const;
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const MRWD_UNISWAP_V3_POOL = "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5" as const;

/** Pools with a verified rewards program, each with live staking controls. */
const REWARD_PROGRAMS = [{ venue: "Uniswap V3", pool: MRWD_UNISWAP_V3_POOL }] as const;

export const hasRewardProgram = (venue: string, poolAddresses: readonly string[]) =>
  REWARD_PROGRAMS.some(
    (program) =>
      program.venue === venue &&
      poolAddresses.some((pool) => pool.toLowerCase() === program.pool.toLowerCase())
  );
