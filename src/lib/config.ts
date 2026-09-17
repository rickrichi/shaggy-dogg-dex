import { z } from "zod";

const envSchema = z.object({
  VITE_ALCHEMY_MAINNET_URL: z.string().optional(),
  VITE_ALCHEMY_BASE_URL: z.string().optional(),
  VITE_ALCHEMY_ARBITRUM_URL: z.string().optional(),
  VITE_ALCHEMY_OPTIMISM_URL: z.string().optional(),
  VITE_ALCHEMY_POLYGON_URL: z.string().optional(),
  VITE_ALCHEMY_SEPOLIA_URL: z.string().optional(),
  VITE_ZEROX_API_KEY: z.string().optional(),
  VITE_SUPABASE_URL: z.string().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  VITE_SUPPORTED_CHAINS: z.string().default("ethereum,base,arbitrum,optimism,polygon,sepolia"),
  VITE_DEFAULT_SLIPPAGE_BPS: z.string().default("50"),
  VITE_TOKENLIST_URLS: z.string().default("https://gateway.ipfs.io/ipns/tokens.uniswap.org"),
});

export const env = envSchema.parse(import.meta.env);

export const SUPPORTED_CHAINS = env.VITE_SUPPORTED_CHAINS.split(",");
export const DEFAULT_SLIPPAGE_BPS = parseInt(env.VITE_DEFAULT_SLIPPAGE_BPS);
export const TOKENLIST_URLS = env.VITE_TOKENLIST_URLS.split(",");

export const CHAIN_CONFIG = {
  ethereum: { id: 1, name: "Ethereum", rpc: env.VITE_ALCHEMY_MAINNET_URL },
  base: { id: 8453, name: "Base", rpc: env.VITE_ALCHEMY_BASE_URL },
  arbitrum: { id: 42161, name: "Arbitrum", rpc: env.VITE_ALCHEMY_ARBITRUM_URL },
  optimism: { id: 10, name: "Optimism", rpc: env.VITE_ALCHEMY_OPTIMISM_URL },
  polygon: { id: 137, name: "Polygon", rpc: env.VITE_ALCHEMY_POLYGON_URL },
  sepolia: { id: 11155111, name: "Sepolia", rpc: env.VITE_ALCHEMY_SEPOLIA_URL },
} as const;

export const checkEnvironment = () => {
  const missing = [];
  if (!env.VITE_SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!env.VITE_SUPABASE_ANON_KEY && !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  if (!env.VITE_ZEROX_API_KEY) missing.push("VITE_ZEROX_API_KEY");
  return { isValid: missing.length === 0, missing };
};
