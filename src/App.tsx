// src/App.tsx
import '@rainbow-me/rainbowkit/styles.css';
import { useEffect, lazy, Suspense } from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from './wagmi';
import { Toaster } from './components/ui/toaster';
// If you meant to use the 'sonner' package, install it and import as follows:
import { Toaster as Sonner } from 'sonner';
// Or, if the file exists locally, correct the path, e.g.:
// import { Toaster as Sonner } from './components/ui/sonner';
// If TooltipProvider is a local component, use the correct relative path:
import { TooltipProvider } from './components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';
import { Layout } from './components/Layout';
import type { JSX } from 'react';

// Lazy-load pages to keep initial bundle lean
const Home = lazy(() => import('./pages/Home'));
const Swap = lazy(() => import('./pages/Swap'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Activity = lazy(() => import('./pages/Activity'));
const Admin = lazy(() => import('./pages/Admin'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Optional (dev only): React Query Devtools
const ReactQueryDevtools =
  import.meta.env.DEV
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
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

const App = (): JSX.Element => {
  // DEV-only noise filtering (this coexists fine with main.tsx filters)
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      const msg = String(args?.[0] ?? '');
      if (
        msg.includes('Extension ID') ||
        msg.includes('chrome.runtime') ||
        msg.includes('inpage.js') ||
        msg.includes('Cannot read properties of null') ||
        msg.includes('indexOf is not a function') ||
        msg.includes('sendMessage') ||
        msg.includes('cca-lite.coinbase.com')
      ) {
        return;
      }
      originalError(...args);
    };

    console.warn = (...args) => {
      const msg = String(args?.[0] ?? '');
      if (msg.includes('Lit is in dev mode') || msg.includes('Not recommended for production')) {
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
    <ThemeProvider defaultTheme="light">
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <TooltipProvider>
              <Sonner />
              <Toaster />
              <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
                <Layout>
                  <Suspense
                    fallback={
                      <div className="p-6 text-center text-sm text-gray-600">Loading…</div>
                    }
                  >
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/swap" element={<Swap />} />
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
              </BrowserRouter>
            </TooltipProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
};

export default App;
// (Removed duplicate block)
