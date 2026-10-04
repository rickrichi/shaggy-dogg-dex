import { isAddress, zeroAddress } from "viem";

import type { Address } from "viem";

export const DEX_CHAIN_ID = 8453;
export const DEX_WETH: Address = "0x4200000000000000000000000000000000000006";
export const DEX_STORAGE_KEY = "shaggy-dex-base-v1";
export interface DexDeployment {
  factory: Address;
  router: Address;
}
export function parseDeployment(value: unknown): DexDeployment | null {
  if (!value || typeof value !== "object") return null;
  const { factory, router } = value as Record<string, unknown>;
  if (
    typeof factory !== "string" ||
    typeof router !== "string" ||
    !isAddress(factory) ||
    !isAddress(router) ||
    factory.toLowerCase() === zeroAddress ||
    router.toLowerCase() === zeroAddress ||
    factory.toLowerCase() === router.toLowerCase()
  )
    return null;
  return { factory, router };
}
export function loadDexDeployment(): DexDeployment | null {
  const configured = parseDeployment({
    factory: import.meta.env.VITE_SHAGGY_FACTORY_ADDRESS,
    router: import.meta.env.VITE_SHAGGY_ROUTER_ADDRESS,
  });
  if (configured) return configured;
  try {
    return parseDeployment(JSON.parse(localStorage.getItem(DEX_STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}
