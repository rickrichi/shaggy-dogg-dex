// vite.config.ts - Shaggy Dogg DEX (2025 Standards)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'  // ⚡ Using SWC for 5x faster builds
import checker from 'vite-plugin-checker'
import path from 'node:path'

export default defineConfig(({ mode }) => {
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
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self' http://localhost:5173 http://localhost:8788 ws://localhost:5173 https://*.alchemy.com https://*.infura.io https://*.walletconnect.com https://*.walletconnect.org https://*.supabase.co https://*.supabase.in wss://*.walletconnect.com wss://*.walletconnect.org wss://*.supabase.co wss://*.supabase.in",
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
        // Main API → Hono backend on port 8788 (8787 is reserved locally)
        '/api': {
          target: 'http://localhost:8788',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 30000,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.error('🔴 API Proxy Error:', err.message)
            })
            proxy.on('proxyReq', (_proxyReq, req) => {
              console.log('🚀 API Request:', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`✅ API Response: ${proxyRes.statusCode} ${req.url}`)
            })
          },
        },
        // Binance price feed proxy to bypass CORS in dev
        '/proxy/binance': {
          target: 'https://api.binance.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/proxy\/binance/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.error('🔴 Binance Proxy Error:', err.message)
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
          // Manual chunk splitting for better caching
          manualChunks: (id) => {
            // Node modules only
            if (!id.includes('node_modules')) return

            // Core React
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react'
            }
            if (id.includes('react-router')) {
              return 'vendor-router'
            }

            // Radix UI Components (split into groups for better caching)
            if (id.includes('@radix-ui')) {
              // Group by complexity/size
              if (id.includes('dialog') || id.includes('dropdown') || id.includes('popover') || id.includes('select')) {
                return 'ui-radix-overlay'
              }
              if (id.includes('accordion') || id.includes('tabs') || id.includes('collapsible')) {
                return 'ui-radix-container'
              }
              return 'ui-radix-core'
            }

            // Form & Validation
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
              return 'vendor-forms'
            }

            // Web3 Core Stack
            if (id.includes('viem') || id.includes('abitype') || id.includes('/ox/')) {
              return 'web3-core'
            }
            if (id.includes('wagmi') || id.includes('@wagmi')) {
              return 'web3-wagmi'
            }
            // Split WalletConnect ecosystem into separate chunks (very large)
            if (id.includes('@walletconnect') || id.includes('qrcode')) {
              return 'web3-walletconnect'
            }
            if (id.includes('@reown')) {
              return 'web3-reown'
            }
            if (id.includes('porto')) {
              return 'web3-porto'
            }
            if (id.includes('@rainbow-me')) {
              return 'web3-rainbowkit'
            }

            // Data & Query Layer
            if (id.includes('@tanstack/react-query')) {
              return 'data-query'
            }
            if (id.includes('@supabase')) {
              return 'data-supabase'
            }

            // Charts & Visualization
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
            }

            // Animation & Motion
            if (id.includes('framer-motion')) {
              return 'vendor-motion'
            }

            // UI Utilities
            if (id.includes('lucide-react')) {
              return 'ui-icons'
            }
            if (id.includes('date-fns') || id.includes('react-day-picker')) {
              return 'vendor-dates'
            }
            if (id.includes('cmdk') || id.includes('vaul') || id.includes('sonner')) {
              return 'ui-components'
            }

            // Carousel & Embla
            if (id.includes('embla-carousel')) {
              return 'vendor-carousel'
            }

            // Markdown & Syntax Highlighting
            if (id.includes('marked') || id.includes('highlight.js')) {
              return 'vendor-markdown'
            }

            // Theme & Styling
            if (id.includes('next-themes') || id.includes('tailwind') || id.includes('class-variance-authority') || id.includes('clsx')) {
              return 'vendor-styling'
            }

            // Utility Libraries
            if (id.includes('react-resizable-panels') || id.includes('input-otp')) {
              return 'vendor-utils'
            }

            // Don't bundle everything else - let Vite decide
            // This prevents a massive vendor-misc chunk
          },

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
          "connect-src 'self' https://*.alchemy.com https://*.infura.io https://*.walletconnect.com https://*.walletconnect.org https://*.supabase.co https://*.supabase.in wss://*.walletconnect.com wss://*.walletconnect.org wss://*.supabase.co wss://*.supabase.in",
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
