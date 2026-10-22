// server/src/schemas/prices.ts
import { z } from 'zod'

/** EVM 0x-prefixed 20-byte address (no checksum enforcement here). */
export type AddressHex = `0x${string}`

/** Zod schema that validates and lowercases an address once at the edge. */
const Address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform(a => `0x${a.slice(2).toLowerCase()}` as AddressHex)

/** One price row in the response. */
export const PriceRowSchema = z.object({
  address: Address,
  priceUsd: z.number().nonnegative(),
  change24hPercent: z.number(), // may be negative or positive
  symbol: z.string().optional(),
  /** Pool below Market-Data's liquidity floor: cheap to move, shown only when asked for (includeThin). */
  indicative: z.boolean().optional(),
  liquidityUsd: z.number().nonnegative().optional(),
})

/** Request: chain + ERC20 list (native is added server-side). */
export const PricesRequestSchema = z.object({
  chainId: z.number().int().positive(),
  addresses: z.array(Address).max(100).default([]),
  includeThin: z.boolean().optional(),
})

/** Success payload. */
export const PricesResponseOkSchema = z.object({
  success: z.literal(true),
  data: z.object({
    prices: z.array(PriceRowSchema),
    /** Market-Data answered that it cannot price these (no contract, or no pool deep enough). */
    unpriced: z.array(Address).default([]),
    /** No answer from Market-Data in time; retry later. */
    failed: z.array(Address).default([]),
  }),
})

/** Failure payload. */
export const PricesResponseFailSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  chainId: z.number().int().positive().optional(),
})

export type PriceRow = z.infer<typeof PriceRowSchema>
export type PricesRequest = z.infer<typeof PricesRequestSchema>
export type PricesResponseOk = z.infer<typeof PricesResponseOkSchema>
export type PricesResponseFail = z.infer<typeof PricesResponseFailSchema>
