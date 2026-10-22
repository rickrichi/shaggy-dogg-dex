import { arbitrum, base, mainnet, optimism, polygon, sepolia } from "viem/chains";

import { type EnvKey } from "./types";

// Keyless public RPCs. Provider keys come only from deployment environment variables.
const FALLBACK_PUBLIC_ENDPOINTS: Record<EnvKey, string> = {
  VITE_ALCHEMY_MAINNET_URL: mainnet.rpcUrls.default.http[0],
  VITE_ALCHEMY_BASE_URL: base.rpcUrls.default.http[0],
  VITE_ALCHEMY_ARBITRUM_URL: arbitrum.rpcUrls.default.http[0],
  VITE_ALCHEMY_OPTIMISM_URL: optimism.rpcUrls.default.http[0],
  VITE_ALCHEMY_POLYGON_URL: polygon.rpcUrls.default.http[0],
  VITE_ALCHEMY_SEPOLIA_URL: sepolia.rpcUrls.default.http[0],
};

/**
 * Vite: import.meta.env doesn't have an index signature.
 */
export function getEnvString(key: EnvKey): string {
  const envUnknown = import.meta.env as unknown;
  const env = (typeof envUnknown === "object" && envUnknown !== null ? envUnknown : {}) as Record<
    string,
    unknown
  >;

  const val = env[key];
  if (typeof val === "string" && val.trim().length > 0) {
    return val;
  }
  return FALLBACK_PUBLIC_ENDPOINTS[key];
}
