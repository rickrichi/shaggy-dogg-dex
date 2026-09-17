// src/types/token.ts
// Central EVM address types + tiny helpers. Pure types; no external deps.

/** EVM 0x-prefixed 20-byte address (no checksum enforcement here). */
export type AddressHex = `0x${string}`;

/** Numeric EVM chain id. */
export type ChainId = number;

/** Canonical ZERO/sentinel address. */
export const ZERO_ADDRESS: AddressHex = "0x0000000000000000000000000000000000000000";

/** Type guard: narrow unknown → AddressHex (40 hex chars after 0x). */
export const isAddressHex = (v: unknown): v is AddressHex =>
  typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

/** Normalize an address to lowercase (keeps 0x prefix). */
export const normalizeAddress = (addr: AddressHex): AddressHex =>
  `0x${addr.slice(2).toLowerCase()}` as AddressHex;

/** Minimal token metadata used across the app. */
export interface Token {
  readonly address: AddressHex;
  readonly chainId: ChainId;
  readonly decimals: number;
  readonly symbol: string;
  readonly name: string;
  readonly logoURI?: string;
}
