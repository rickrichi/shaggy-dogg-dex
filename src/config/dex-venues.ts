import { BASE_V2_VENUES, BASE_V3_VENUES } from "@/config/contracts";
import {
  routeVenuesForChain,
  type SmartRouteVenue,
} from "@/lib/amm/smart-routing";

export type VenueKind = "v2" | "v3" | "aerodrome";

export interface DexVenueCapability {
  name: SmartRouteVenue;
  kind: VenueKind;
  ammType: string;
  factory?: `0x${string}`;
  fees?: readonly number[];
  rewardNote: string;
  actionHref?: string;
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
    actionHref: "https://aerodrome.finance/",
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
    rewardNote:
      "A separately funded incentive may be available; none is verified here.",
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
    rewardNote:
      "A separately funded incentive may be available; none is verified here.",
  },
  BaseSwap: {
    kind: "v2",
    ammType: "Constant product V2",
    ...BASE_V2_VENUES.BaseSwap,
    rewardNote: "Fees only unless a separate incentive is confirmed.",
  },
};

export const BASE_DEX_VENUES: readonly DexVenueCapability[] =
  routeVenuesForChain(8453).map((name) => ({ name, ...DETAILS[name] }));

/** PancakeSwap protocol that has a guided pool planner, if the venue is one. */
export const pancakeProtocolForVenue = (venue: string) =>
  venue === "PancakeSwap V3"
    ? ("v3" as const)
    : venue === "PancakeSwap V2"
      ? ("v2" as const)
      : undefined;

export const MRWD_ADDRESS =
  "0xC17227AAa33C54634B6cE7AD0bf33A156563c179" as const;
export const WETH_ADDRESS =
  "0x4200000000000000000000000000000000000006" as const;
export const USDC_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const MRWD_UNISWAP_V3_POOL =
  "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5" as const;
