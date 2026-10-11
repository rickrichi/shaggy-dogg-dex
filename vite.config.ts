// vite.config.ts - Shaggy Dogg DEX (2025 Standards)
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'  // ⚡ Using SWC for 5x faster builds
import checker from 'vite-plugin-checker'
import path from 'node:path'
import { BASE_PUBLIC_RPC_URLS } from './src/lib/base-rpc'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_ARB_');
  const apiUrl = (env.VITE_ARB_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const wsUrl = env.VITE_ARB_WS_URL || `${apiUrl.replace(/^http/, 'ws')}/ws`;
  const arbOrigins = `${new URL(apiUrl).origin} ${new URL(wsUrl).origin}`;
  const rpcOrigins = [...BASE_PUBLIC_RPC_URLS, 'https://arb1.arbitrum.io', 'https://mainnet.optimism.io', 'https://polygon-rpc.com', 'https://rpc.sepolia.org'].map(url => new URL(url).origin).join(' ');
  return {
    // ── Vite 7.x Configuration ──────────────────────────────────────────────
    appType: 'spa',

    // ── Plugins ─────────────────────────────────────────────────────────────
    plugins: [
      // Using SWC version for 5x faster refresh and builds
      react({
        tsDecorators: true,
      }),
      // Type checking in dev mode
      checker({
        typescript: {
          tsconfigPath: './tsconfig.app.json',
        },
        enableBuild: false,
        overlay: {
          initialIsOpen: false,
          position: 'tl',
          badgeStyle: 'z-index: 9999;',
        },
      }),
    ],

    // ── Module Resolution ───────────────────────────────────────────────────
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '~': path.resolve(__dirname, './'),
      },
      // Modern module resolution (removed deprecated jsnext:main)
      conditions: ['module', 'import', 'browser'],
      mainFields: ['module', 'browser', 'main'],
    },

    // ── Environment Variables ───────────────────────────────────────────────
    envPrefix: 'VITE_',
    envDir: './',

    // ── Global Constants ────────────────────────────────────────────────────
    define: {
      global: 'globalThis',
      'process.env': '{}',
      __DEV__: mode === 'development',
    },

    // ── Development Server ──────────────────────────────────────────────────
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      open: false,

      // Security headers for dev (Report-Only for HMR compatibility)
      headers: {
        'Content-Security-Policy-Report-Only': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
          "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          `connect-src ${arbOrigins} ${rpcOrigins} 'self' http://localhost:5173 http://localhost:8788 http://localhost:8000 http://127.0.0.1:8000 http://localhost:8010 ws://localhost:5173 ws://localhost:8000 ws://127.0.0.1:8000 https://ethereum.publicnode.com https://*.alchemy.com https://*.infura.io https://*.walletconnect.com https://*.walletconnect.org https://*.supabase.co https://*.supabase.in wss://*.walletconnect.com wss://*.walletconnect.org wss://*.supabase.co wss://*.supabase.in https://api.exchange.coinbase.com https://api.coinbase.com wss://ws-feed.exchange.coinbase.com https://*.coinbase.com wss://*.coinbase.com https://api.kraken.com wss://ws.kraken.com https://*.kraken.com wss://*.kraken.com`,
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; '),
      },

      // HMR Configuration
      hmr: {
        host: 'localhost',
        protocol: 'ws',
        port: 5173,
        overlay: true,
      },

      // WSL/Windows file watching optimization
      watch: {
        usePolling: true,
        interval: 100,
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      },

      // ── Proxy Configuration ─────────────────────────────────────────────
      proxy: {
        // cryptostream live exchange gateway (../cryptostream, port 8080): REST + WebSocket
        '/cryptostream': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/cryptostream/, ''),
        },
        // Main API → Hono backend on port 8788 (8787 is reserved locally)
        '/api': {
          target: 'http://localhost:8788',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 30000,
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              console.warn('⚠️ API Proxy Warning (backend offline on port 8788):', err.message)
              if (res && 'writeHead' in res && !(res as { headersSent?: boolean }).headersSent) {
                if (req.url === '/api/health') {
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ ok: true, devFallback: true, message: 'Backend on :8788 is offline or starting' }))
                  return
                }
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Backend server unavailable on port 8788', details: err.message }))
              }
            })
            proxy.on('proxyReq', (_proxyReq, req) => {
              console.log('🚀 API Request:', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`✅ API Response: ${proxyRes.statusCode} ${req.url}`)
            })
          },
        },
      },
    },

    // ── Dependency Optimization ─────────────────────────────────────────────
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-router-dom',
        'viem',
        'abitype',
        'wagmi',
        '@wagmi/core',
        '@wagmi/connectors',
        '@tanstack/react-query',
        '@supabase/supabase-js',
        'lucide-react',
        'eventemitter3',  // Fix CommonJS/ESM interop
        'ua-parser-js',   // Fix CommonJS/ESM interop (WalletConnect dependency)
      ],
      exclude: [
        // Exclude large deps that should be lazy-loaded
        '@rainbow-me/rainbowkit',
      ],
      esbuildOptions: {
        target: 'es2022',
        supported: {
          'top-level-await': true,
        },
        keepNames: true,
        define: {
          global: 'globalThis',
        },
      },
      force: mode === 'development',
    },

    // ── ESBuild Configuration ───────────────────────────────────────────────
    esbuild: {
      target: 'es2022',
      legalComments: 'none',
      keepNames: mode === 'development',
      logOverride: {
        'this-is-undefined-in-esm': 'silent',
      },
    },

    // ── JSON Configuration ──────────────────────────────────────────────────
    json: {
      stringify: true, // Faster for large JSON files
    },

    // ── Worker Configuration ────────────────────────────────────────────────
    worker: {
      format: 'es',
      plugins: () => [react()],
    },

    // ── Production Build ────────────────────────────────────────────────────
    build: {
      target: 'es2022',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      manifest: true,
      minify: mode === 'production' ? 'esbuild' : false,
      cssCodeSplit: true,
      cssMinify: mode === 'production',
      chunkSizeWarningLimit: 2000, // Higher limit for Web3 libraries (RainbowKit, Wagmi)
      reportCompressedSize: false, // Faster builds

      rollupOptions: {
        onwarn(warning, warn) {
          // Suppress known warnings that don't affect functionality
          const suppressCodes = ['EVAL', 'MODULE_LEVEL_DIRECTIVE', 'SOURCEMAP_ERROR']
          if (suppressCodes.includes(warning.code ?? '')) return
          warn(warning)
        },

        output: {
          // Let Rollup preserve dependency initialization order. Manual wallet
          // vendor groups introduced a Reown/WalletConnect circular initialization.
          // Clean file names
          chunkFileNames: (chunkInfo) => {
            const facadeName = chunkInfo.facadeModuleId
              ? chunkInfo.facadeModuleId.split('/').pop()?.replace(/\.[^.]+$/, '')
              : null
            const safeName = (chunkInfo.name ?? '') === 'index'
              ? (facadeName ?? 'chunk')
              : (chunkInfo.name ?? 'chunk')
            return `js/${safeName}-[hash].js`
          },
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const fileName = assetInfo.name ?? 'asset'
            // Organize by asset type
            if (/\.(woff2?|ttf|otf|eot)$/.test(fileName)) {
              return 'fonts/[name]-[hash][extname]'
            }
            if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(fileName)) {
              return 'images/[name]-[hash][extname]'
            }
            return 'assets/[name]-[hash][extname]'
          },

          // Compact output
          compact: mode === 'production',
          generatedCode: {
            constBindings: true,
            objectShorthand: true,
          },
        },

        // Aggressive tree-shaking
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
          unknownGlobalSideEffects: false,
        },
      },
    },

    // ── Preview Server ──────────────────────────────────────────────────────
    preview: {
      host: 'localhost',
      port: 4173,
      strictPort: true,
      open: false,
      headers: {
        // CSP for production preview
        // NOTE: 'unsafe-eval' required for Web3 libraries (RainbowKit, WalletConnect)
        // These libraries dynamically evaluate connector code for wallet integrations
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval'",  // Required for Web3 wallet connectors
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          `connect-src ${arbOrigins} ${rpcOrigins} 'self' https://*.alchemy.com https://*.infura.io https://*.walletconnect.com https://*.walletconnect.org https://*.supabase.co https://*.supabase.in wss://*.walletconnect.com wss://*.walletconnect.org wss://*.supabase.co wss://*.supabase.in`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  }
})
