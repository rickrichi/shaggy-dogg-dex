import { type EnvKey } from "./types";

const FALLBACK_ALCHEMY_ENDPOINTS: Record<EnvKey, string> = {
  VITE_ALCHEMY_MAINNET_URL: "https://eth-mainnet.g.alchemy.com/v2/***REMOVED***",
  VITE_ALCHEMY_BASE_URL: "https://base-mainnet.g.alchemy.com/v2/***REMOVED***",
  VITE_ALCHEMY_ARBITRUM_URL: "https://arb-mainnet.g.alchemy.com/v2/***REMOVED***",
  VITE_ALCHEMY_OPTIMISM_URL: "https://opt-mainnet.g.alchemy.com/v2/***REMOVED***",
  VITE_ALCHEMY_POLYGON_URL: "https://polygon-mainnet.g.alchemy.com/v2/***REMOVED***",
  VITE_ALCHEMY_SEPOLIA_URL: "https://eth-sepolia.g.alchemy.com/v2/***REMOVED***",
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
  return FALLBACK_ALCHEMY_ENDPOINTS[key];
}
