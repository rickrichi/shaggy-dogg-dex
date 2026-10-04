import { fallback, http } from "viem";

// Keep the matrix and wallet reads on the same browser-accessible endpoints.
// An Alchemy URL intended for server use may reject browser origins.
export const BASE_PUBLIC_RPC_URLS = [
  "https://mainnet.base.org",
  "https://1rpc.io/base",
  "https://base.meowrpc.com",
] as const;

// Optional Shaggy-Dogg gateway (docs/shaggy-rpc.md). Its key is visible to browser users,
// so use a dedicated low-quota key. Public endpoints remain as fallback if it fails or is throttled.
const GATEWAY_URL = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  ?.VITE_SHAGGY_RPC_URL;

export function createBaseReadTransport() {
  const transports = [
    ...(GATEWAY_URL
      ? [http(GATEWAY_URL, { batch: { batchSize: 20, wait: 16 }, timeout: 8_000, retryCount: 0 })]
      : []),
    ...BASE_PUBLIC_RPC_URLS.map((url) =>
      http(url, {
        batch: true,
        timeout: 8_000,
        retryCount: 0,
      })
    ),
  ];
  return fallback(transports, { retryCount: 1 });
}
