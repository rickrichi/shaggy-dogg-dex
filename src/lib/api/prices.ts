// src/lib/api/prices.ts
import { z } from "zod";

import type { AddressHex } from "@/types/token";

// ---- Schemas (mirror the backend contract) ----
const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => `0x${v.slice(2).toLowerCase()}` as AddressHex);

const PriceRowSchema = z.object({
  address: AddressSchema,
  priceUsd: z.number(),
  change24hPercent: z.number(),
  symbol: z.string().optional(),
});

const PricesOkSchema = z.object({
  success: z.literal(true),
  data: z.object({
    prices: z.array(PriceRowSchema),
  }),
});

const PricesFailSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  chainId: z.number().int().positive().optional(),
});

export type PricesOk = z.infer<typeof PricesOkSchema>;
export type PricesFail = z.infer<typeof PricesFailSchema>;
export type PricesResponse = PricesOk | PricesFail;

// ---- Client fetcher ----
export interface FetchPricesParams {
  readonly chainId: number;
  readonly addresses: readonly AddressHex[];
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Fetch prices from the backend Hono route (/api/prices).
 * Throws on backend-declared failure or malformed payload.
 */
export async function fetchPrices({
  chainId,
  addresses,
  signal,
  timeoutMs = 10_000,
}: FetchPricesParams): Promise<PricesOk> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch("/api/prices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, addresses }),
      signal: signal ?? ctrl.signal,
    });

    // Network/HTTP error handling
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json: unknown = await res.json();

    // Shape-check against backend contract
    const ok = PricesOkSchema.safeParse(json);
    if (ok.success) return ok.data;

    const fail = PricesFailSchema.safeParse(json);
    if (fail.success) {
      // Server replied with an explicit error
      throw new Error(fail.data.error);
    }

    // Neither success nor fail matched → backend/contract drift
    throw new Error("Malformed response from /api/prices");
  } finally {
    clearTimeout(timer);
  }
}
