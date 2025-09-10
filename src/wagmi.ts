// src/wagmi.ts
import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, polygon, arbitrum, optimism, base } from 'wagmi/chains';
import { injected, metaMask, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// Use Vite client envs instead of process.env in browser code.
// Keep your existing hardcoded projectId as a safe fallback.
const WC_FALLBACK_PROJECT_ID = '8fcdca4beaae05f8565620e86da2afa4' as const;
const projectId: string =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? WC_FALLBACK_PROJECT_ID;

// Configure chains
const chains = [mainnet, sepolia, polygon, arbitrum, optimism, base] as const;

// Configure connectors
const connectors = [
  injected(),
  metaMask(),
  walletConnect({
    projectId, // <- uses Vite env (or fallback) instead of process.env
  }),
  coinbaseWallet({
    appName: 'shaggy-dogg-dex', // <-- fixed typo (was coibaseWallet)
  }),
] as const;

// Create wagmi config
export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
  },
  // In a Vite SPA (no SSR), keep this false to avoid server-side assumptions.
  // Set to true only if you're actually rendering on the server.
  ssr: false,
  // Optional: uncomment if you want wagmi to reconnect silently when possible.
  // autoConnect: true,
});
