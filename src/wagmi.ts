// src/wagmi.ts
import { createConfig, http } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon, sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";

import type { Config } from "wagmi";

// ---------- ENV ----------
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined;
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  | string
  | undefined;
const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || "Shaggy Dogg DEX";

// ---------- CHAINS ----------
const supportedChains = [mainnet, base, arbitrum, optimism, polygon, sepolia] as const;
type SupportedChains = typeof supportedChains;

const isTestnet = (chainId: number) => chainId === sepolia.id;
const getMainnetChains = () => supportedChains.filter((c) => !isTestnet(c.id));
const getTestnetChains = () => supportedChains.filter((c) => isTestnet(c.id));

// ---------- VALIDATION (non-fatal in dev) ----------
const validateConfig = () => {
  const issues: string[] = [];
  if (import.meta.env.PROD) {
    if (!ALCHEMY_API_KEY) issues.push("Alchemy API key recommended for production RPC stability");
    // WalletConnect is optional; only warn if you expect multi-wallet UX in prod
    if (!WALLETCONNECT_PROJECT_ID)
      issues.push("WalletConnect project ID missing (multi-wallet QR disabled)");
  }
  if (issues.length) {
    const msg = `Wagmi config: ${issues.join("; ")}`;
    if (import.meta.env.PROD) console.warn(msg);
    else console.info(msg);
  }
};
validateConfig();

// ---------- RPC HELPERS ----------
const ALCHEMY_NETWORK: Record<string, string> = {
  mainnet: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  optimism: "opt-mainnet",
  polygon: "polygon-mainnet",
  sepolia: "eth-sepolia",
};

const PUBLIC_FALLBACK: Record<string, string | undefined> = {
  mainnet: undefined, // default wagmi
  base: "https://mainnet.base.org",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  optimism: "https://mainnet.optimism.io",
  polygon: "https://polygon-rpc.com",
  sepolia: undefined, // default wagmi
};

const buildAlchemyUrl = (network: string) =>
  ALCHEMY_API_KEY && ALCHEMY_NETWORK[network]
    ? `https://${ALCHEMY_NETWORK[network]}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : undefined;

const createTransport = (network: string) => {
  const alchemy = buildAlchemyUrl(network);
  const fallback = PUBLIC_FALLBACK[network];
  const common = { batch: true, retryCount: 3, retryDelay: 1000 };

  // Prefer Alchemy if available, else explicit public RPC, else default
  if (alchemy) return http(alchemy, common);
  if (fallback) return http(fallback, common);
  return http(undefined, common);
};

// ---------- CONNECTORS ----------
const connectors = [
  metaMask({
    dappMetadata: {
      name: APP_NAME,
      url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
    },
  }),
  injected({ shimDisconnect: true }), // Other injected wallets
  coinbaseWallet({
    appName: APP_NAME,
    preference: "smartWalletOnly",
  }),
  ...(WALLETCONNECT_PROJECT_ID
    ? [
        walletConnect({
          projectId: WALLETCONNECT_PROJECT_ID,
          showQrModal: true,
          metadata: {
            name: APP_NAME,
            description: `${APP_NAME} - Decentralized Exchange`,
            url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
            icons: [],
          },
        }),
      ]
    : []),
];

// ---------- CONFIG ----------
export const wagmiConfig: Config<SupportedChains> = createConfig({
  chains: supportedChains,
  connectors,
  transports: {
    [mainnet.id]: createTransport("mainnet"),
    [base.id]: createTransport("base"),
    [arbitrum.id]: createTransport("arbitrum"),
    [optimism.id]: createTransport("optimism"),
    [polygon.id]: createTransport("polygon"),
    [sepolia.id]: createTransport("sepolia"),
  },
  batch: { multicall: true },
  ssr: true,
});

// ---------- UTILITIES ----------
export const getSupportedChainIds = (): number[] => supportedChains.map((c) => c.id);
export const isSupportedChain = (chainId: number) => getSupportedChainIds().includes(chainId);
export const getChainById = (chainId: number) => supportedChains.find((c) => c.id === chainId);
export const getChainName = (chainId: number) => getChainById(chainId)?.name ?? "Unknown";
export const getProductionChains = () => getMainnetChains();
export { getTestnetChains, isTestnet };
export type { SupportedChains };

// Simple abort controller helper (keep if you actually use it)
export const createTimeoutController = (timeoutMs = 10_000) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
};

// ---------- DEV LOG ----------
if (import.meta.env.DEV) {
  console.group("🔗 Wagmi Configuration");
  console.log("App:", APP_NAME);
  console.log("Alchemy:", ALCHEMY_API_KEY ? "✅" : "⚠️ public RPC");
  console.log("WalletConnect:", WALLETCONNECT_PROJECT_ID ? "✅" : "—");
  console.log("Chains:", supportedChains.map((c) => c.name).join(", "));
  console.groupEnd();
}
