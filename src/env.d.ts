/// <reference types="vite/client" />

/**
 * Shaggy Dogg DEX - TypeScript Type Definitions
 * Comprehensive type declarations for environment variables and Web3 globals
 */

// ========================================================================
// Environment Variables (Vite)
// ========================================================================

interface ImportMetaEnv {
  // Application Config
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_URL?: string;

  // Blockchain RPC Providers
  readonly VITE_ALCHEMY_API_KEY?: string;
  readonly VITE_INFURA_API_KEY?: string;

  // Wallet Integration
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;

  // Backend Services
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_API_KEY?: string;

  // Feature Flags
  readonly VITE_ENABLE_TESTNET?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly VITE_ANALYTICS_ENABLED?: string;
  readonly VITE_ANALYTICS_FORCE?: string;
  readonly VITE_ANALYTICS_BACKEND_ENABLED?: string;
  readonly VITE_ANALYTICS_GA_ENABLED?: string;
  readonly VITE_ANALYTICS_MIXPANEL_ENABLED?: string;
  readonly VITE_ANALYTICS_REQUIRE_CONSENT?: string;
  readonly VITE_ANALYTICS_RESPECT_DNT?: string;
  readonly VITE_ANALYTICS_REDACT_UA?: string;
  readonly VITE_ANALYTICS_REDACT_REFERRER?: string;
  readonly VITE_ANALYTICS_MAX_QUEUE?: string;

  // Development
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: "development" | "production" | "test";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ========================================================================
// Web3 Window Extensions
// ========================================================================

interface EthereumProvider {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  request: (request: { method: string; params?: Array<unknown> }) => Promise<unknown>;
  on: (event: string, handler: (...args: Array<unknown>) => void) => void;
  removeListener: (event: string, handler: (...args: Array<unknown>) => void) => void;
  selectedAddress: string | null;
  chainId: string | null;
}

interface Window {
  ethereum?: EthereumProvider;

  // Additional wallet providers
  coinbaseWalletExtension?: EthereumProvider;
  phantom?: {
    ethereum?: EthereumProvider;
  };
}

// ========================================================================
// Module Declarations (for packages without types)
// ========================================================================

// Uncomment if needed for packages without TypeScript definitions:
// declare module 'some-untyped-package' {
//   export default function something(): void;
// }

// ========================================================================
// Global Type Utilities
// ========================================================================

type Nullable<T> = T | null;
type Optional<T> = T | undefined;
type Address = `0x${string}`;
type HexString = `0x${string}`;
type ChainId = number;

// ========================================================================
// Vite-specific Types
// ========================================================================

declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module "*?url" {
  const url: string;
  export default url;
}

declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  import type { FunctionComponent, SVGProps } from "react";
  export const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.gif" {
  const value: string;
  export default value;
}

declare module "*.webp" {
  const value: string;
  export default value;
}

declare module "*.avif" {
  const value: string;
  export default value;
}
