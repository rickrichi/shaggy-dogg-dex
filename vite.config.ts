// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'
import path from 'node:path'
import type { IncomingMessage } from 'http'

export default defineConfig(({ mode }) => {
  // Load .env (exposes only VITE_* below via envPrefix)
  const env = loadEnv(mode, process.cwd(), '')
  const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? ''

  // Helper: forward incoming Authorization if present
  const getIncomingAuth = (req: IncomingMessage): string | null => {
    const h = req.headers['authorization']
    if (typeof h === 'string' && h.trim().length > 0) return h
    if (Array.isArray(h) && typeof h[0] === 'string') return h[0]
    return null
  }

  return {
    plugins: [
      react(),
      checker({
        typescript: true,
        enableBuild: false,
        overlay: { initialIsOpen: false, position: 'tl' },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      conditions: ['module', 'import', 'browser'],
      mainFields: ['module', 'jsnext:main', 'browser', 'main'],
    },
    // Only expose VITE_* to the client
    envPrefix: 'VITE_',
    define: {
      global: 'globalThis',
      'process.env': {}, // some web3 libs expect it
    },
    server: {
      host: 'localhost', // stable HMR in WSL/Windows
      port: 5173,        // CLI --port overrides this if provided
      strictPort: true,
      // Dev-only CSP so HMR + some SDKs can eval during development
      headers: {
        'Content-Security-Policy': [
          "default-src 'self' http://localhost:5173",
          "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:5173",
          "style-src 'self' 'unsafe-inline' http://localhost:5173",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' http://localhost:8787 http://localhost:5173 ws://localhost:5173 https://api.coingecko.com https://*.alchemy.com https://*.supabase.co https://*.supabase.in",
          "frame-ancestors 'none'",
        ].join('; '),
      },
      hmr: {
        // Let Vite infer client port from actual URL.
        // Keeping only explicit host stabilizes WS in WSL.
        host: 'localhost',
        protocol: 'ws',
        overlay: true,
      },
      // Enable real-time file watching (WSL-friendly)
      watch: {
        usePolling: true,
        interval: 100,
      },
      proxy: {
        // =============== Main API → Hono server on :8787 ===============
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 30000,
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 API Proxy error:', err.message))
            proxy.on('proxyReq', (_proxyReq, req) => console.log('🚀 API Request:', req.method, req.url))
            proxy.on('proxyRes', (proxyRes, req) => console.log('✅ API Response:', proxyRes.statusCode, req.url))
            proxy.on('open', () => console.log('🔗 API WebSocket connection opened'))
            proxy.on('close', () => console.log('🔌 API WebSocket connection closed'))
          },
        },

        // =============== Optional Auth service on :3005 ===============
        '/auth': {
          target: 'http://localhost:3005',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 15000,
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Auth Service Proxy error:', err.message))
            proxy.on('proxyReq', (_proxyReq, req) => console.log('🔐 Auth Request:', req.method, req.url))
            proxy.on('proxyRes', (proxyRes, req) => console.log('🔓 Auth Response:', proxyRes.statusCode, req.url))
            proxy.on('open', () => console.log('🔗 Auth WebSocket connection opened'))
          },
        },

        // ========================= Supabase Proxies =========================
        '^/supabase/rest/.*': {
          target: SUPABASE_URL || 'https://example.supabase.co',
          changeOrigin: true,
          secure: true,
          ws: true,
          timeout: 30000,
          rewrite: (p) => p.replace(/^\/supabase\/rest/, '/rest/v1'),
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Supabase REST proxy error:', err.message))
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('apikey', SUPABASE_ANON_KEY)
              proxyReq.setHeader('Prefer', 'return=representation')
              const incoming = getIncomingAuth(req)
              proxyReq.setHeader('Authorization', incoming ?? `Bearer ${SUPABASE_ANON_KEY}`)
              console.log('📊 Supabase REST →', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req) =>
              console.log('📈 Supabase REST Response:', proxyRes.statusCode, req.url),
            )
          },
        },

        '^/supabase/storage/.*': {
          target: SUPABASE_URL || 'https://example.supabase.co',
          changeOrigin: true,
          secure: true,
          timeout: 60000,
          rewrite: (p) => p.replace(/^\/supabase\/storage/, '/storage/v1'),
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Supabase Storage proxy error:', err.message))
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('apikey', SUPABASE_ANON_KEY)
              const incoming = getIncomingAuth(req)
              proxyReq.setHeader('Authorization', incoming ?? `Bearer ${SUPABASE_ANON_KEY}`)
              console.log('📁 Supabase Storage →', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req) =>
              console.log('📂 Supabase Storage Response:', proxyRes.statusCode, req.url),
            )
          },
        },

        '^/supabase/functions/.*': {
          target: SUPABASE_URL || 'https://example.supabase.co',
          changeOrigin: true,
          secure: true,
          timeout: 45000,
          rewrite: (p) => p.replace(/^\/supabase\/functions/, '/functions/v1'),
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Supabase Functions proxy error:', err.message))
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('apikey', SUPABASE_ANON_KEY)
              const incoming = getIncomingAuth(req)
              proxyReq.setHeader('Authorization', incoming ?? `Bearer ${SUPABASE_ANON_KEY}`)
              console.log('⚡ Supabase Functions →', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req) =>
              console.log('⚡ Supabase Functions Response:', proxyRes.statusCode, req.url),
            )
          },
        },

        '^/supabase/realtime/.*': {
          target: SUPABASE_URL || 'https://example.supabase.co',
          changeOrigin: true,
          secure: true,
          ws: true,
          timeout: 0,
          rewrite: (p) => p.replace(/^\/supabase\/realtime/, '/realtime/v1'),
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Supabase Realtime proxy error:', err.message))
            proxy.on('open', () => console.log('🔴 Supabase Realtime WebSocket opened - Live data streaming active'))
            proxy.on('close', () => console.log('🔴 Supabase Realtime WebSocket closed - Attempting reconnection...'))
            proxy.on('proxyReqWs', (_proxyReq, req) => console.log('🔴 Supabase Realtime WS →', req.url))
          },
        },

        '^/supabase/auth/.*': {
          target: SUPABASE_URL || 'https://example.supabase.co',
          changeOrigin: true,
          secure: true,
          timeout: 15000,
          rewrite: (p) => p.replace(/^\/supabase\/auth/, '/auth/v1'),
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Supabase Auth proxy error:', err.message))
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('apikey', SUPABASE_ANON_KEY)
              console.log('🔐 Supabase Auth →', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req) =>
              console.log('🔓 Supabase Auth Response:', proxyRes.statusCode, req.url),
            )
          },
        },

        // Optional WS helpers you had:
        '/ws': {
          target: 'http://localhost:3006',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 0,
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 WebSocket Proxy error:', err.message))
            proxy.on('open', () => console.log('🔗 Real-time WebSocket connection established'))
            proxy.on('close', () => console.log('🔌 Real-time WebSocket connection closed'))
            proxy.on('proxyReqWs', (_proxyReq, req) => console.log('🌐 WebSocket Request:', req.url))
          },
        },

        '/realtime': {
          target: 'http://localhost:3008',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 0,
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('🔴 Real-time Trading Proxy error:', err.message))
            proxy.on('open', () => console.log('📈 Real-time trading data stream connected'))
            proxy.on('close', () => console.log('📉 Real-time trading data stream disconnected'))
          },
        },
      },
    },
    optimizeDeps: {
      include: ['viem', 'abitype', 'react', 'react-dom', '@supabase/supabase-js', 'wagmi'],
      esbuildOptions: { target: 'es2022', keepNames: true },
      force: mode === 'development',
    },
    esbuild: {
      target: 'es2022',
      legalComments: 'none',
      keepNames: mode === 'development',
    },
    build: {
      target: 'es2022',
      sourcemap: mode !== 'production',
      minify: 'esbuild',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'EVAL' || warning.code === 'MODULE_LEVEL_DIRECTIVE') return
          warn(warning)
        },
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            web3: ['viem', 'abitype', 'wagmi'],
            supabase: ['@supabase/supabase-js'],
          },
        },
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
        },
      },
    },
  }
})
