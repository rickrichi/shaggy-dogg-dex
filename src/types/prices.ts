// src/types/prices.ts
// Shared types for the /api/prices contract (frontend ↔ backend).
// Keep pure types here (no runtime logic).

import type { AddressHex } from "./token";

/** One price row returned by the backend. */
export interface PriceRow {
  readonly address: AddressHex;
  readonly priceUsd: number;
  readonly change24hPercent: number;
  readonly symbol?: string;
  /** Pool below Market-Data's liquidity floor: cheap to move, returned only when asked for. */
  readonly indicative?: boolean;
  readonly liquidityUsd?: number;
}

/** Successful response shape from /api/prices */
export interface PricesResponseOk {
  readonly success: true;
  readonly data: {
    readonly prices: readonly PriceRow[];
    /** Market-Data answered that it cannot price these (no contract, or no pool deep enough). */
    readonly unpriced?: readonly AddressHex[];
    /** No answer from Market-Data in time; retry later. */
    readonly failed?: readonly AddressHex[];
  };
}

/** Failure response shape from /api/prices */
export interface PricesResponseFail {
  readonly success: false;
  readonly error: string;
  readonly chainId?: number;
}

/** Union of all possible responses from /api/prices */
export type PricesApiResponse = PricesResponseOk | PricesResponseFail;

/** EVM chain id (numeric) */
export type ChainId = number;
