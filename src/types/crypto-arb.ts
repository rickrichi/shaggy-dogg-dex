// src/types/crypto-arb.ts
// Wire contract mirrored from crypto-arb backend (FastAPI / CCXT Pro)

export type VenueStatus = "live" | "stale" | "connecting" | "error" | "unlisted";

export interface VenueState {
  exchange: string;
  symbol: string;
  status: VenueStatus;
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  ageMs: number | null;
  takerFee: number | null;
  error: string | null;
}

export interface Opportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  topSpreadBps: number;
  buyVwap: number;
  sellVwap: number;
  qtyBase: number;
  notionalQuote: number;
  grossBps: number;
  netBps: number;
  netPnlQuote: number;
  fullyFilled: boolean;
  maxAgeMs: number;
}

export interface Snapshot {
  type: "snapshot";
  ts: number;
  seq: number;
  notional: number;
  venues: VenueState[];
  opportunities: Opportunity[];
}

export interface Subscription {
  notional: number;
  minNetBps: number;
  symbols: string[] | null;
}

export type ConnState = "connecting" | "open" | "reconnecting" | "closed";

export interface CeDeFiOpportunity {
  id: string;
  symbol: string;
  cexExchange: string;
  cexVwap: number;
  dexVenue: string;
  dexPrice: number;
  direction: "BUY_CEX_SELL_DEX" | "BUY_DEX_SELL_CEX";
  spreadBps: number;
  netBps: number;
  estNetProfitUsd: number;
  dexRouterAddress: string;
  timestamp: number;
}

export function isSnapshot(x: unknown): x is Snapshot {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Snapshot).type === "snapshot" &&
    Array.isArray((x as Snapshot).venues) &&
    Array.isArray((x as Snapshot).opportunities)
  );
}
