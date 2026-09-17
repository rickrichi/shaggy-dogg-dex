import { type EnvKey } from "./types";

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
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new Error(`Environment variable ${key} is missing or empty`);
  }
  return val;
}
