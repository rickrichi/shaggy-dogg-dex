// src/test/utils.tsx - Test utilities and helpers
import { BrowserRouter } from "react-router-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { http } from "viem";
import { vi } from "vitest";
import { WagmiProvider } from "wagmi";
import { createConfig } from "wagmi";
import { mainnet } from "wagmi/chains";

import type { ReactElement, ReactNode } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// MOCK WAGMI CONFIG
// ══════════════════════════════════════════════════════════════════════════════

export const mockWagmiConfig = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST PROVIDERS
// ══════════════════════════════════════════════════════════════════════════════

interface AllProvidersProps {
  children: ReactNode;
}

export function AllProviders({ children }: AllProvidersProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  return (
    <WagmiProvider config={mockWagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM RENDER
// ══════════════════════════════════════════════════════════════════════════════

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  route?: string;
}

export function renderWithProviders(ui: ReactElement, options?: CustomRenderOptions) {
  const { route = "/", ...renderOptions } = options || {};

  // Set initial route if provided
  if (route !== "/") {
    window.history.pushState({}, "Test page", route);
  }

  return render(ui, {
    wrapper: AllProviders,
    ...renderOptions,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ══════════════════════════════════════════════════════════════════════════════

export const mockToken = (
  overrides?: Partial<{
    symbol: string;
    name: string;
    address: string;
    decimals: number;
  }>
) => ({
  kind: "erc20" as const,
  symbol: "TEST",
  name: "Test Token",
  address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
  decimals: 18,
  chainId: 1,
  ...overrides,
});

export const mockNativeToken = () => ({
  kind: "native" as const,
  symbol: "ETH",
  name: "Ethereum",
  address: "native" as const,
  decimals: 18,
  chainId: 1,
});

export const mockBalance = (
  overrides?: Partial<{
    value: bigint;
    decimals: number;
    formatted: string;
    symbol: string;
  }>
) => ({
  value: BigInt("1000000000000000000"), // 1 ETH
  decimals: 18,
  formatted: "1.0",
  symbol: "ETH",
  ...overrides,
});

export const mockSwapState = (
  overrides?: Partial<{
    sellAmount: string;
    buyAmount: string;
    slippage: number;
  }>
) => ({
  sellAmount: "",
  buyAmount: "",
  sellToken: mockToken({ symbol: "ETH" }),
  buyToken: mockToken({ symbol: "USDC" }),
  slippage: 0.5,
  isQuoteLoading: false,
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════════
// MOCK HOOKS
// ══════════════════════════════════════════════════════════════════════════════

export const mockUseAccount = (overrides?: {
  address?: `0x${string}`;
  isConnected?: boolean;
  chainId?: number;
}) => ({
  address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
  isConnected: true,
  chainId: 1,
  ...overrides,
});

export const mockUseBalance = (overrides?: {
  data?: ReturnType<typeof mockBalance>;
  isLoading?: boolean;
  error?: Error;
}) => ({
  data: mockBalance(),
  isLoading: false,
  error: null,
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Wait for async updates to complete
 */
export const waitForUpdate = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Create a mock fetch response
 */
export const mockFetchResponse = (data: any, ok = true, status = 200) => {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response);
};

/**
 * Setup fetch mock
 */
export const setupFetchMock = (responses: Record<string, any>) => {
  (global.fetch as any).mockImplementation((url: string) => {
    const matchedUrl = Object.keys(responses).find((key) => url.includes(key));
    if (matchedUrl) {
      return mockFetchResponse(responses[matchedUrl]);
    }
    return mockFetchResponse({ error: "Not found" }, false, 404);
  });
};

/**
 * Create a spy on console methods
 */
export const spyOnConsole = (method: "log" | "error" | "warn" = "error") => {
  return vi.spyOn(console, method).mockImplementation(() => {});
};

// ══════════════════════════════════════════════════════════════════════════════
// ASYNC HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Wait for a condition to be true
 */
export const waitForCondition = async (
  condition: () => boolean,
  timeout = 5000,
  interval = 50
): Promise<void> => {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error("Timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

/**
 * Flush all pending promises
 */
export const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convert number to wei (18 decimals)
 */
export const toWei = (amount: number | string): bigint => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return BigInt(Math.floor(num * 1e18));
};

/**
 * Convert wei to number
 */
export const fromWei = (wei: bigint): number => {
  return Number(wei) / 1e18;
};

/**
 * Create mock transaction hash
 */
export const mockTxHash = (prefix = "tx"): `0x${string}` => {
  return `0x${prefix}${"0".repeat(64 - prefix.length)}` as `0x${string}`;
};

/**
 * Create mock address
 */
export const mockAddress = (suffix = "1"): `0x${string}` => {
  return `0x${"0".repeat(39)}${suffix}` as `0x${string}`;
};

// ══════════════════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export { vi } from "vitest";

// Override render to use our custom version by default
export { renderWithProviders as render };
