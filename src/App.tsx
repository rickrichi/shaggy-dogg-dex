// src/App.tsx
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "sonner";
import { WagmiProvider } from "wagmi";

import { Layout } from "./components/Layout";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { wagmiConfig } from "./wagmi";

import "@rainbow-me/rainbowkit/styles.css";

import type { JSX, ReactNode } from "react";

// Lazy-load pages to keep initial bundle lean
const Home = lazy(() => import("./pages/Home"));
const Swap = lazy(() => import("./pages/Swap"));
const Liquidity = lazy(() => import("./pages/Liquidity"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Activity = lazy(() => import("./pages/Activity"));
const Admin = lazy(() => import("./pages/Admin"));
const Launchpad = lazy(() => import("./pages/Launchpad"));
const ProtocolOps = lazy(() => import("./pages/ProtocolOps"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Optional (dev only): React Query Devtools
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools }))
    )
  : null;

// Centralized QueryClient with conservative defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // avoid noisy refetches while navigating
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
      staleTime: 30_000, // 30s
    },
    mutations: {
      retry: 0,
    },
  },
});

// Diagnostic component for API connectivity testing
const ApiDiagnostic = (): JSX.Element | null => {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkApi = async () => {
      try {
        if (!cancelled) setIsLoading(true);

        // Keep diagnostics on the same origin as the app. Vite proxies this in
        // development and the deployment platform serves the `/api` contract in
        // production, avoiding stale ports and browser CORS failures.
        const res = await fetch("/api/health", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const payload: unknown = await res.json();
        if (!cancelled) {
          setResult(payload);
          setError(null);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Request failed";
        if (!cancelled) {
          setResult(null);
          setError(msg);
        }
        console.error("API Diagnostic Error:", msg);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void checkApi();
    const interval = window.setInterval(() => void checkApi(), 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!import.meta.env.DEV || isDismissed) {
    return null; // Only show in development unless dismissed
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        title="Click to expand API Diagnostics"
        className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/95 dark:hover:bg-gray-750"
      >
        <span
          className={`size-2 rounded-full ${
            error
              ? "bg-red-500 animate-pulse"
              : result
                ? "bg-green-500"
                : "bg-amber-500"
          }`}
        />
        <span className="text-gray-700 dark:text-gray-300">
          API: {error ? "Err" : result ? "Online" : "Connecting..."}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-gray-200 bg-white/95 p-3.5 shadow-xl backdrop-blur transition-all dark:border-gray-700 dark:bg-gray-800/95">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/60">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            API Health Diagnostic
          </h3>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              error
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                : result
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300"
            }`}
          >
            {error ? "ERR" : result ? "OK" : "…"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 text-xs leading-none"
            title="Minimize"
          >
            —
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 text-xs leading-none"
            title="Dismiss diagnostic"
          >
            ✕
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          Checking backend health (port 8788)...
        </div>
      )}

      {result !== null && (
        <pre className="mt-1.5 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[11px] text-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {error && (
        <pre className="mt-1.5 rounded bg-red-50 p-2 text-[11px] text-red-600 dark:bg-red-900/20 dark:text-red-400">
          Error: {error}
        </pre>
      )}
    </div>
  );
};

interface RouterWrapperProps {
  children: ReactNode;
}

export const Providers = ({ children }: RouterWrapperProps): JSX.Element => (
  <ThemeProvider defaultTheme="light">
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <TooltipProvider>
            <Sonner />
            <Toaster />
            {children}
          </TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ThemeProvider>
);

export const AppRoutes = (): JSX.Element => (
  <Layout>
    <Suspense fallback={<div className="p-6 text-center text-sm text-gray-600">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/classic" element={<Swap />} />
        <Route path="/swap" element={<Swap />} />
        <Route path="/liquidity" element={<Liquidity />} />
        <Route path="/launchpad" element={<Launchpad />} />
        <Route path="/create-token" element={<Launchpad />} />
        <Route path="/protocol" element={<ProtocolOps />} />
        <Route path="/launchpad/manage" element={<ProtocolOps />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Devtools (only in dev builds) */}
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} position="bottom" />
        </Suspense>
      )}
    </Suspense>
  </Layout>
);

const App = (): JSX.Element => {
  // DEV-only noise filtering (this coexists fine with main.tsx filters)
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      const msg = String(args?.[0] ?? "");
      if (
        msg.includes("Extension ID") ||
        msg.includes("chrome.runtime") ||
        msg.includes("inpage.js") ||
        msg.includes("Cannot read properties of null") ||
        msg.includes("indexOf is not a function") ||
        msg.includes("sendMessage") ||
        msg.includes("cca-lite.coinbase.com")
      ) {
        return;
      }
      originalError(...args);
    };

    console.warn = (...args) => {
      const msg = String(args?.[0] ?? "");
      if (msg.includes("Lit is in dev mode") || msg.includes("Not recommended for production")) {
        return;
      }
      originalWarn(...args);
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <Providers>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />

        {/* API Diagnostic Panel - Development Only */}
        <ApiDiagnostic />
      </BrowserRouter>
    </Providers>
  );
};

export default App;
