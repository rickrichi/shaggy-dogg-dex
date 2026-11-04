import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://dex.lumsian.com";
const LASTMOD = "2026-11-04";

const SEO_ROUTES = [
  {
    route: "/swap",
    file: "swap.html",
    priority: "0.9",
    changefreq: "daily",
    title: "Swap Tokens on Base · 8-Venue Smart Router & Mutt Rewards (MRWD) | Shaggy Mutt DEX",
    heading: "Swap Tokens Across Eight Base DEX Venues",
    description:
      "Compare live on-chain swap quotes across Uniswap V3, Uniswap V2, Aerodrome, PancakeSwap V3/V2, SushiSwap V3/V2, and BaseSwap on Base Mainnet (8453), or buy Mutt Rewards (MRWD, 0xC17227AAa33C54634B6cE7AD0bf33A156563c179).",
    body: "Execute non-custodial token swaps on Base Mainnet (8453), Ethereum, Arbitrum, Optimism, and Polygon with 35% cross-venue outlier quote filtering and direct ETH → MRWD routing via canonical Uniswap V3 pool 0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5."
  },
  {
    route: "/stake",
    file: "stake.html",
    priority: "0.9",
    changefreq: "daily",
    title: "Stake MRWD & Claim Uniswap V3 LP Rewards on Base | Shaggy Mutt DEX",
    heading: "Mutt Rewards ($MRWD) Staking, Equilnyxs Pro & V3 LP Incentives",
    description:
      "Claim Quarter 1 Mutt Rewards (MRWD, 0xC17227AAa33C54634B6cE7AD0bf33A156563c179) from UniswapV3Staker (0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1), lock 1B MRWD in MuttProStaking (0x67dBC193bF510225EBf189ab25dC3b34a32c1766) for Equilnyxs Pro, or stake Launchpad tokens.",
    body: "Manage staked Uniswap V3 LP NFTs in the 600B MRWD 16-quarter incentive program, lock 1,000,000,000 MRWD for 30 days in ownerless MuttProStaking to unlock Equilnyxs Pro with 0% exit fee, and stake SD or launchpad ecosystem tokens in FeeDiscountStaking."
  },
  {
    route: "/stake/dexes",
    file: "stake/dexes.html",
    priority: "0.8",
    changefreq: "weekly",
    title: "Base DEX Liquidity Explorer · Compare 7 Active Liquidity Venues | Shaggy Mutt DEX",
    heading: "Base DEX Liquidity Explorer & Pool Planner",
    description:
      "Compare liquidity provision across seven active Base DEX venues (Uniswap V3, Uniswap V2, Aerodrome, PancakeSwap V3/V2, and SushiSwap V3/V2) and plan MRWD/WETH positions.",
    body: "Discover held and staked Base tokens across ecosystem contracts and plan concentrated or full-range liquidity positions across Uniswap V3, Uniswap V2, Aerodrome, PancakeSwap, and SushiSwap."
  },
  {
    route: "/protocol",
    file: "protocol.html",
    priority: "0.9",
    changefreq: "weekly",
    title: "MRWD Protocol Hub · 16-Quarter Scheduler, Vesting & 56-Aggregator Audit | Shaggy Mutt DEX",
    heading: "Mutt Rewards ($MRWD) Protocol Hub & On-Chain Custody Verification",
    description:
      "Inspect live Base Mainnet state for Mutt Rewards (0xC17227AAa33C54634B6cE7AD0bf33A156563c179), MuttIncentiveScheduler (0xCAbf284806b800d9A771B55857B9fCF735ea7109), Treasury/Team MuttVesting, and the 56-Aggregator Routing Audit.",
    body: "Verify the 1 trillion fixed-supply Mutt Rewards (MRWD) token distribution: 600B MRWD in ownerless MuttIncentiveScheduler across 16 quarters, 200B MRWD in locked launch position #6351512, 150B Treasury and 50B Team MuttVesting contracts, and live 56-aggregator routing checks."
  },
  {
    route: "/liquidity",
    file: "liquidity.html",
    priority: "0.8",
    changefreq: "weekly",
    title: "Uniswap V2 & V3 Liquidity Manager & Sovereign Timelock on Base | Shaggy Mutt DEX",
    heading: "Manage Uniswap V2 Pools, Base V3 NFT Positions & Sovereign Timelocks",
    description:
      "Mint, collect fees, stake in UniswapV3Staker, or lock Base Uniswap V3 LP NFTs in V3PositionTimelock (0xb5c9bedb57f4e348e40a5e6326c90de474072e25), plus manage classic Uniswap V2 pools.",
    body: "Add or remove liquidity on Base Uniswap V3 (including the canonical MRWD/WETH 0.30% pool 0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5) and Uniswap V2, and lock V3 NFT positions in the ownerless V3PositionTimelock contract."
  },
  {
    route: "/launchpad",
    file: "launchpad.html",
    priority: "0.9",
    changefreq: "weekly",
    title: "Base Token & Sovereign DeFi Suite Launchpad | Shaggy Mutt DEX",
    heading: "Launch Fixed-Supply ERC-20 Tokens & Atomic DeFi Suites on Base",
    description:
      "Deploy verified FixedSupplyToken contracts, FeeDiscountStaking, Aave v3 and Compound v3 USDC yield vaults, and flash-loan routers atomically on Base Mainnet via LaunchpadSuiteDeployer.",
    body: "Create fixed-supply ERC-20 tokens with self-transfer protection, configure 10%/25%/50%/75% vault fee-discount staking tiers, and seed initial liquidity on Base Uniswap V3, Uniswap V2, PancakeSwap V2, or Aerodrome."
  },
  {
    route: "/launchpad/explore",
    file: "launchpad/explore.html",
    priority: "0.8",
    changefreq: "daily",
    title: "Explore Verified Base Token Launches & Staking Suites | Shaggy Mutt DEX",
    heading: "Explore Verified Base Token & DeFi Suite Launches",
    description:
      "Browse tokens and DeFi suites deployed through the Shaggy Mutt DEX Launchpad on Base Mainnet (Chain ID 8453), trade pairs, and access holder staking.",
    body: "Inspect verified FixedSupplyToken deployments, check on-chain liquidity pools, and open holder staking panels for Base ecosystem tokens."
  },
  {
    route: "/markets",
    file: "markets.html",
    priority: "0.8",
    changefreq: "daily",
    title: "Live Base & Multi-Chain Crypto Markets | Shaggy Mutt DEX",
    heading: "Live Crypto & Base Ecosystem Token Markets",
    description:
      "Track real-time token prices, 24-hour volume, and on-chain pool liquidity for Base ecosystem tokens including ETH, USDC, AERO, cbBTC, Mutt Rewards (MRWD), and SD.",
    body: "Monitor live order-book medians and Base on-chain Uniswap V2, Uniswap V3, and Aerodrome pool prices with one-click navigation into swap and liquidity flows."
  },
  {
    route: "/market-data",
    file: "market-data.html",
    priority: "0.8",
    changefreq: "daily",
    title: "On-Chain Base Pool & Exchange Price Data | Shaggy Mutt DEX",
    heading: "Self-Hosted Exchange Medians & Base On-Chain Pool Analytics",
    description:
      "Inspect live price feeds, liquidity depth floors, and historical charts from exchange order-book medians and Base Uniswap V2, V3, and Aerodrome pools.",
    body: "View transparent on-chain pool pricing with a $100 firm-liquidity floor across Base Uniswap V3 (including MRWD/WETH 0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5), Uniswap V2, and Aerodrome volatile pools."
  },
  {
    route: "/arbitrage",
    file: "arbitrage.html",
    priority: "0.8",
    changefreq: "daily",
    title: "Base DEX & Aave V3 Flash-Loan Arbitrage Scanner | Shaggy Mutt DEX",
    heading: "Cross-Venue Base DEX Spreads & Atomic Flash-Loan Arbitrage",
    description:
      "Scan live price spreads across Base Uniswap V3 and Aerodrome pools and execute atomic triangular or Aave V3 flash-loan routes via AtomicFlashArbitrageRouter (0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd).",
    body: "Monitor live cross-DEX arbitrage spreads on Base Mainnet with L2 execution + L1 data gas accounting and atomic flash-loan settlement."
  },
  {
    route: "/arbitrage/matrix",
    file: "arbitrage/matrix.html",
    priority: "0.7",
    changefreq: "daily",
    title: "CeFi vs. Base DEX Live Pair Matrix | Shaggy Mutt DEX",
    heading: "Real-Time CeFi (Coinbase, Kraken, Binance, Bybit, OKX) vs. Base DEX Matrix",
    description:
      "Stream live WebSocket order-book quotes from Coinbase, Kraken, Binance, Bybit, and OKX alongside Base DEX pool quotes to compare cross-market spreads.",
    body: "Compare real-time centralized exchange bid/ask spreads against on-chain Base DEX liquidity across major crypto pairs."
  },
  {
    route: "/paymaster",
    file: "paymaster.html",
    priority: "0.7",
    changefreq: "weekly",
    title: "Sponsored Reward Paymaster (ERC-4337 EntryPoint v0.7) on Base | Shaggy Mutt DEX",
    heading: "ERC-4337 Sponsored Reward Paymaster (100 MRWD per Eligible Op)",
    description:
      "Inspect SponsoredRewardPaymaster (0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4) on Base EntryPoint v0.7, designed to sponsor eligible swaps, transfers, and staking while rewarding 100 MRWD.",
    body: "View live EntryPoint v0.7 deposit balances, MRWD reward reserves, allowlisted Base routers, and EIP-7702 smart-account compatibility status."
  },
  {
    route: "/portfolio",
    file: "portfolio.html",
    priority: "0.7",
    changefreq: "weekly",
    title: "Web3 Portfolio & Staked Position Tracker on Base | Shaggy Mutt DEX",
    heading: "Non-Custodial Base & Multi-Chain Portfolio Tracker",
    description:
      "Track wallet token balances, staked Mutt Rewards (MRWD) in MuttProStaking and UniswapV3Staker, locked V3 positions in V3PositionTimelock, and Launchpad staking positions.",
    body: "View live on-chain balances across Base, Ethereum, Arbitrum, Optimism, and Polygon with automatic discovery of staked MRWD and SD positions."
  }
];

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const distDir = path.resolve("dist");
const baseHtmlPath = path.join(distDir, "index.html");
if (!fs.existsSync(baseHtmlPath)) {
  throw new Error(`dist/index.html not found at ${baseHtmlPath}. Run vite build first.`);
}

const templateHtml = fs.readFileSync(baseHtmlPath, "utf8");

for (const page of SEO_ROUTES) {
  const canonicalUrl = `${SITE_ORIGIN}${page.route}`;
  let html = templateHtml;

  // Replace <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`);

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeHtml(page.description)}" />`
  );

  // Replace canonical link
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonicalUrl}" />`
  );

  // Replace og:title, og:description, og:url
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${canonicalUrl}" />`
  );

  // Replace pre-hydration <main> block inside <div id="root">
  html = html.replace(
    /<main[\s\S]*?<\/main>/,
    `<main style="max-width:48rem;margin:3rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.55">
        <h1>${escapeHtml(page.heading)}</h1>
        <p>${escapeHtml(page.description)}</p>
        <p>${escapeHtml(page.body)}</p>
        <p>
          <strong>Official Mutt Rewards (MRWD) Token on Base (Chain ID 8453):</strong>
          <code>0xC17227AAa33C54634B6cE7AD0bf33A156563c179</code> ·
          Canonical MRWD/WETH 0.30% Uniswap V3 Pool:
          <code>0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5</code>
        </p>
        <nav aria-label="Site navigation">
          <a href="${SITE_ORIGIN}/">Home</a> ·
          <a href="${SITE_ORIGIN}/mrwd">Mutt Rewards (MRWD)</a> ·
          <a href="${SITE_ORIGIN}/swap">Swap</a> ·
          <a href="${SITE_ORIGIN}/stake">Stake &amp; Rewards</a> ·
          <a href="${SITE_ORIGIN}/stake/dexes">DEX Explorer</a> ·
          <a href="${SITE_ORIGIN}/protocol">Protocol Hub</a> ·
          <a href="${SITE_ORIGIN}/liquidity">Liquidity</a> ·
          <a href="${SITE_ORIGIN}/launchpad">Launchpad</a> ·
          <a href="${SITE_ORIGIN}/launchpad/explore">Explore Launches</a> ·
          <a href="${SITE_ORIGIN}/markets">Markets</a> ·
          <a href="${SITE_ORIGIN}/market-data">Market Data</a> ·
          <a href="${SITE_ORIGIN}/arbitrage">Arbitrage</a> ·
          <a href="${SITE_ORIGIN}/paymaster">Paymaster</a> ·
          <a href="${SITE_ORIGIN}/whitepaper">Whitepaper</a>
        </nav>
      </main>`
  );

  const outPath = path.join(distDir, page.file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");
}

// Generate comprehensive sitemap.xml in both public/ and dist/
const allSitemapEntries = [
  { loc: `${SITE_ORIGIN}/`, lastmod: LASTMOD, changefreq: "daily", priority: "1.0" },
  { loc: `${SITE_ORIGIN}/mrwd`, lastmod: LASTMOD, changefreq: "daily", priority: "1.0" },
  { loc: `${SITE_ORIGIN}/whitepaper`, lastmod: LASTMOD, changefreq: "weekly", priority: "0.9" },
  ...SEO_ROUTES.map((r) => ({
    loc: `${SITE_ORIGIN}${r.route}`,
    lastmod: LASTMOD,
    changefreq: r.changefreq,
    priority: r.priority
  }))
];

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allSitemapEntries
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

fs.writeFileSync(path.resolve("public/sitemap.xml"), sitemapXml, "utf8");
fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemapXml, "utf8");

console.log(`Generated ${SEO_ROUTES.length} standalone canonical HTML pages and updated sitemap.xml (${allSitemapEntries.length} URLs).`);
