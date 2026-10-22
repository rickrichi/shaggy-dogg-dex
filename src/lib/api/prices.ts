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
  indicative: z.boolean().optional(),
  liquidityUsd: z.number().optional(),
});

const PricesOkSchema = z.object({
  success: z.literal(true),
  data: z.object({
    prices: z.array(PriceRowSchema),
    unpriced: z.array(AddressSchema).default([]),
    failed: z.array(AddressSchema).default([]),
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
  /** Also price pools below Market-Data's liquidity floor; those rows come back `indicative`. */
  readonly includeThin?: boolean;
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
  includeThin = false,
  signal,
  timeoutMs = 10_000,
}: FetchPricesParams): Promise<PricesOk> {
  // The timeout applies even when the caller also passes its own signal.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const abortFromCaller = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const res = await fetch("/api/prices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, addresses, ...(includeThin ? { includeThin } : {}) }),
      signal: ctrl.signal,
    });

    const json: unknown = await res.json().catch(() => undefined);

    // Network/HTTP error handling: surface the backend's error code when it sent one
    if (!res.ok) {
      const fail = PricesFailSchema.safeParse(json);
      throw new Error(fail.success ? fail.data.error : `HTTP ${res.status}`);
    }

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
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
