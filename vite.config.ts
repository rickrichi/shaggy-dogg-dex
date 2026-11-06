// vite.config.ts - Shaggy Dogg DEX (2025 Standards)
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'  // ⚡ Using SWC for 5x faster builds
import checker from 'vite-plugin-checker'
import fs from 'node:fs'
import path from 'node:path'
import { BASE_PUBLIC_RPC_URLS } from './src/lib/base-rpc'

const SITE_ORIGIN = 'https://dex.lumsian.com'
const SEO_ROUTES = [
  {
    route: '/swap',
    file: 'swap.html',
    title: 'Swap Tokens on Base · 8-Venue Smart Router & Mutt Rewards (MRWD) | Shaggy Mutt DEX',
    heading: 'Swap Tokens Across Eight Base DEX Venues',
    description: 'Compare live on-chain swap quotes across Uniswap V3, Uniswap V2, Aerodrome, PancakeSwap V3/V2, SushiSwap V3/V2, and BaseSwap on Base Mainnet (8453), or buy Mutt Rewards (MRWD, 0xC17227AAa33C54634B6cE7AD0bf33A156563c179).',
  },
  {
    route: '/stake',
    file: 'stake.html',
    title: 'Stake MRWD & Claim Uniswap V3 LP Rewards on Base | Shaggy Mutt DEX',
    heading: 'Mutt Rewards ($MRWD) Staking, Equilnyxs Pro & V3 LP Incentives',
    description: 'Claim Quarter 1 Mutt Rewards (MRWD, 0xC17227AAa33C54634B6cE7AD0bf33A156563c179) from UniswapV3Staker (0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1), lock 1B MRWD in MuttProStaking (0x67dBC193bF510225EBf189ab25dC3b34a32c1766) for Equilnyxs Pro, or stake Launchpad tokens.',
  },
  {
    route: '/stake/dexes',
    file: 'stake/dexes.html',
    title: 'Base DEX Liquidity Explorer · Compare 7 Active Liquidity Venues | Shaggy Mutt DEX',
    heading: 'Base DEX Liquidity Explorer & Pool Planner',
    description: 'Compare liquidity provision across seven active Base DEX venues (Uniswap V3, Uniswap V2, Aerodrome, PancakeSwap V3/V2, and SushiSwap V3/V2) and plan MRWD/WETH positions.',
  },
  {
    route: '/protocol',
    file: 'protocol.html',
    title: 'MRWD Protocol Hub · 16-Quarter Scheduler, Vesting & 56-Aggregator Audit | Shaggy Mutt DEX',
    heading: 'Mutt Rewards ($MRWD) Protocol Hub & On-Chain Custody Verification',
    description: 'Inspect live Base Mainnet state for Mutt Rewards (0xC17227AAa33C54634B6cE7AD0bf33A156563c179), MuttIncentiveScheduler (0xCAbf284806b800d9A771B55857B9fCF735ea7109), Treasury/Team MuttVesting, and the 56-Aggregator Routing Audit.',
  },
  {
    route: '/liquidity',
    file: 'liquidity.html',
    title: 'Uniswap V2 & V3 Liquidity Manager & Sovereign Timelock on Base | Shaggy Mutt DEX',
    heading: 'Manage Uniswap V2 Pools, Base V3 NFT Positions & Sovereign Timelocks',
    description: 'Mint, collect fees, stake in UniswapV3Staker, or lock Base Uniswap V3 LP NFTs in V3PositionTimelock (0xb5c9bedb57f4e348e40a5e6326c90de474072e25), plus manage classic Uniswap V2 pools.',
  },
  {
    route: '/launchpad',
    file: 'launchpad.html',
    title: 'Base Token & Sovereign DeFi Suite Launchpad | Shaggy Mutt DEX',
    heading: 'Launch Fixed-Supply ERC-20 Tokens & Atomic DeFi Suites on Base',
    description: 'Deploy verified FixedSupplyToken contracts, FeeDiscountStaking, Aave v3 and Compound v3 USDC yield vaults, and flash-loan routers atomically on Base Mainnet via LaunchpadSuiteDeployer.',
  },
  {
    route: '/launchpad/explore',
    file: 'launchpad/explore.html',
    title: 'Explore Verified Base Token Launches & Staking Suites | Shaggy Mutt DEX',
    heading: 'Explore Verified Base Token & DeFi Suite Launches',
    description: 'Browse tokens and DeFi suites deployed through the Shaggy Mutt DEX Launchpad on Base Mainnet (Chain ID 8453), trade pairs, and access holder staking.',
  },
  {
    route: '/markets',
    file: 'markets.html',
    title: 'Live Base & Multi-Chain Crypto Markets | Shaggy Mutt DEX',
    heading: 'Live Crypto & Base Ecosystem Token Markets',
    description: 'Track real-time token prices, 24-hour volume, and on-chain pool liquidity for Base ecosystem tokens including ETH, USDC, AERO, cbBTC, Mutt Rewards (MRWD), and SD.',
  },
  {
    route: '/market-data',
    file: 'market-data.html',
    title: 'On-Chain Base Pool & Exchange Price Data | Shaggy Mutt DEX',
    heading: 'Self-Hosted Exchange Medians & Base On-Chain Pool Analytics',
    description: 'Inspect live price feeds, liquidity depth floors, and historical charts from exchange order-book medians and Base Uniswap V2, V3, and Aerodrome pools.',
  },
  {
    route: '/arbitrage',
    file: 'arbitrage.html',
    title: 'Base DEX & Aave V3 Flash-Loan Arbitrage Scanner | Shaggy Mutt DEX',
    heading: 'Cross-Venue Base DEX Spreads & Atomic Flash-Loan Arbitrage',
    description: 'Scan live price spreads across Base Uniswap V3 and Aerodrome pools and execute atomic triangular or Aave V3 flash-loan routes via AtomicFlashArbitrageRouter (0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd).',
  },
  {
    route: '/arbitrage/matrix',
    file: 'arbitrage/matrix.html',
    title: 'CeFi vs. Base DEX Live Pair Matrix | Shaggy Mutt DEX',
    heading: 'Real-Time CeFi (Coinbase, Kraken, Binance, Bybit, OKX) vs. Base DEX Matrix',
    description: 'Stream live WebSocket order-book quotes from Coinbase, Kraken, Binance, Bybit, and OKX alongside Base DEX pool quotes to compare cross-market spreads.',
  },
  {
    route: '/paymaster',
    file: 'paymaster.html',
    title: 'Sponsored Reward Paymaster (ERC-4337 EntryPoint v0.7) on Base | Shaggy Mutt DEX',
    heading: 'ERC-4337 Sponsored Reward Paymaster (100 MRWD per Eligible Op)',
    description: 'Inspect SponsoredRewardPaymaster (0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4) on Base EntryPoint v0.7, designed to sponsor eligible swaps, transfers, and staking while rewarding 100 MRWD.',
  },
  {
    route: '/portfolio',
    file: 'portfolio.html',
    title: 'Web3 Portfolio & Staked Position Tracker on Base | Shaggy Mutt DEX',
    heading: 'Non-Custodial Base & Multi-Chain Portfolio Tracker',
    description: 'Track wallet token balances, staked Mutt Rewards (MRWD) in MuttProStaking and UniswapV3Staker, locked V3 positions in V3PositionTimelock, and Launchpad staking positions.',
  },
]

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function seoRoutesPlugin(): Plugin {
  return {
    name: 'shaggy-seo-routes',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      const baseHtmlPath = path.join(distDir, 'index.html')
      if (!fs.existsSync(baseHtmlPath)) return
      const templateHtml = fs.readFileSync(baseHtmlPath, 'utf8')
      for (const page of SEO_ROUTES) {
        const canonicalUrl = `${SITE_ORIGIN}${page.route}`
        let html = templateHtml
        html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
        html = html.replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
        html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
        html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(page.title)}" />`)
        html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`)
        html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonicalUrl}" />`)
        html = html.replace(
          /<main[\s\S]*?<\/main>/,
          `<main style="max-width:48rem;margin:3rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.55"><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p><p><strong>Official Mutt Rewards (MRWD) Token on Base (Chain ID 8453):</strong> <code>0xC17227AAa33C54634B6cE7AD0bf33A156563c179</code> · Canonical MRWD/WETH 0.30% Uniswap V3 Pool: <code>0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5</code></p><nav aria-label="Site navigation"><a href="${SITE_ORIGIN}/">Home</a> · <a href="${SITE_ORIGIN}/mrwd">Mutt Rewards (MRWD)</a> · <a href="${SITE_ORIGIN}/swap">Swap</a> · <a href="${SITE_ORIGIN}/stake">Stake &amp; Rewards</a> · <a href="${SITE_ORIGIN}/stake/dexes">DEX Explorer</a> · <a href="${SITE_ORIGIN}/protocol">Protocol Hub</a> · <a href="${SITE_ORIGIN}/liquidity">Liquidity</a> · <a href="${SITE_ORIGIN}/launchpad">Launchpad</a> · <a href="${SITE_ORIGIN}/launchpad/explore">Explore Launches</a> · <a href="${SITE_ORIGIN}/markets">Markets</a> · <a href="${SITE_ORIGIN}/market-data">Market Data</a> · <a href="${SITE_ORIGIN}/arbitrage">Arbitrage</a> · <a href="${SITE_ORIGIN}/paymaster">Paymaster</a> · <a href="${SITE_ORIGIN}/whitepaper">Whitepaper</a></nav></main>`
        )
        const outPath = path.join(distDir, page.file)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, html, 'utf8')
      }
    },
  }
}

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
      seoRoutesPlugin(),
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
          `connect-src ${arbOrigins} ${rpcOrigins} 'self' http://localhost:5173 http://localhost:8788 http://localhost:8000 http://127.0.0.1:8000 http://localhost:8010 ws://localhost:5173 ws://localhost:8000 ws://127.0.0.1:8000 https://ethereum.publicnode.com https://*.alchemy.com https://*.infura.io https://*.walletconnect.com https://*.walletconnect.org https://*.supabase.co https://*.supabase.in wss://*.walletconnect.com wss://*.walletconnect.org wss://*.supabase.co wss://*.supabase.in https://api.exchange.coinbase.com https://api.coinbase.com wss://ws-feed.exchange.coinbase.com https://*.coinbase.com wss://*.coinbase.com https://api.kraken.com wss://ws.kraken.com https://*.kraken.com wss://*.kraken.com wss://data-stream.binance.vision wss://stream.bybit.com wss://ws.okx.com:8443`,
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
        // Liquidation-bot summary (read-only) on the market-data VM
        '/api/mev': {
          target: 'https://34-9-52-175.sslip.io',
          changeOrigin: true,
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
          `connect-src ${arbOrigins} ${rpcOrigins} 'self' https://*.alchemy.com https://*.infura.io https://*.walletconnect.com https://*.walletconnect.org https://*.supabase.co https://*.supabase.in wss://*.walletconnect.com wss://*.walletconnect.org wss://*.supabase.co wss://*.supabase.in https://api.exchange.coinbase.com https://api.coinbase.com wss://ws-feed.exchange.coinbase.com https://api.kraken.com wss://ws.kraken.com wss://data-stream.binance.vision wss://stream.bybit.com wss://ws.okx.com:8443`,
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
