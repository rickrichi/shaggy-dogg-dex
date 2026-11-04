# MRWD On-Chain Liquidity Expansion, Whitepaper v2.0 & Google Search Indexing Session Record

- **Timestamp (Local):** `2026-11-04T03:33:00-08:00` (PST)
- **Timestamp (UTC):** `2026-11-04T11:33:00Z`
- **Network:** Base Mainnet (`Chain ID: 8453`)
- **Operator / Admin Wallet:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`
- **Production Application:** [https://dex.lumsian.com](https://dex.lumsian.com)
- **Canonical MRWD Page:** [https://dex.lumsian.com/mrwd](https://dex.lumsian.com/mrwd)
- **Technical Whitepaper:** [https://dex.lumsian.com/whitepaper](https://dex.lumsian.com/whitepaper) ([`docs/WHITEPAPER.md`](./WHITEPAPER.md))
- **GitHub Repository:** [https://github.com/rickrichi/shaggy-dogg-dex](https://github.com/rickrichi/shaggy-dogg-dex)

---

## 1. Executive Summary

During the 3–4 November 2026 session, the following milestones were completed, verified on-chain on Base Mainnet (`8453`), committed to `origin/main`, and deployed to production on `https://dex.lumsian.com`:

1. **Repository & Technical Whitepaper v2.0 Modernization:** Rewrote [`docs/WHITEPAPER.md`](./WHITEPAPER.md) (Version 2.0 · 4 November 2026) and regenerated `public/whitepaper.html` and `public/whitepaper.md` via `node scripts/build-whitepaper.mjs`, removing all retired `AMUTT` / `WeeklyUsdcDistributor` references across the repository (`README.md`, `SECURITY.md`, `audit/*`, `deployments/*`, `src/*`, `server/*`).
2. **Base Mainnet MRWD/WETH 0.30% V3 Pool Liquidity Expansion & Staking:** Executed two full-range (`-887220` to `887220`) liquidity additions and `UniswapV3Staker` deposits (`#6448087` and `#6448166`), increasing the canonical pool's WETH reserve from `0.03582540 WETH` (`$81.55`) to **`0.04633571 WETH` (`$107.43` single-sided WETH / `$214.86` total pool depth)** and lifting the `MRWD` spot price by **+12.3%** (from `$0.4469` to **`$0.5020` per `1B MRWD`**), clearing the `$100` firm-liquidity threshold.
3. **Buyer Conversion Upgrades (`/mrwd` & `/swap`):** Added direct 1-click **`Buy $MRWD (ETH → MRWD)`** CTAs, Uniswap Base deep links, GeckoTerminal/DexScreener chart links, and the **`1B MRWD` Equilnyxs Pro** utility highlight to `public/mrwd.html` and `src/pages/Swap.tsx`.
4. **Full 16-Route Search Engine & AI Indexing Architecture:** Built and deployed standalone canonical HTML pages for all 16 public routes via `seoRoutesPlugin()` in `vite.config.ts`, added Schema.org JSON-LD (`WebSite`, `WebPage`, `Thing`, `FAQPage`), created `public/llms.txt` and `public/tokenlist.json`, submitted all 16 URLs to **IndexNow (`HTTP 200`)**, queued the 11 top routes in **Google Search Console**, and submitted the 16-page `https://dex.lumsian.com/sitemap.xml`.

---

## 2. On-Chain Base Mainnet (`8453`) Transactions Executed

### 2.1 Tranche 1 — Option A (`25.87567 USDC → ETH`, Mint & Stake V3 NFT `#6448087`)

| Step | Action | Contract | Details | Tx Hash & Block |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Swap `USDC → ETH` | `SwapRouter02` (`0x2626664c2603336E57B271c5C0b26F421741e481`) | Swapped `25.87567 USDC` → `0.011185566360039449 ETH` via `multicall([exactInputSingle, unwrapWETH9])` | [`0x4e4624f6855f43447c4c9d762218687cbe0da7637369cb23429b38c943213401`](https://basescan.org/tx/0x4e4624f6855f43447c4c9d762218687cbe0da7637369cb23429b38c943213401) (Block `53,495,192`) |
| **2** | Mint Full-Range V3 LP (`#6448087`) | `NonfungiblePositionManager` (`0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`) | Paired `0.007042643753226072 ETH` (`~$16.03`) + `35,871,288,004.769264149348142989 MRWD` (`100%` of loose wallet MRWD) at ticks `-887220` to `887220` (`liquidity = 15,894,297,794,712,183,062,702`) | [`0x22600f0e6eb7ad8d91dbf7212a2fe624bbf20e0103fa3f85b706c903ddc8493c`](https://basescan.org/tx/0x22600f0e6eb7ad8d91dbf7212a2fe624bbf20e0103fa3f85b706c903ddc8493c) (Block `53,495,210`) |
| **3** | Stake V3 NFT (`#6448087`) | `UniswapV3Staker` (`0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`) | Transferred and staked `#6448087` into Quarter 1 `MRWD` incentive (`startTime = 1792973235`, `endTime = 1800857235`) | [`0x959ca76b4410f72fc77d66344973d6592154965f8e18d1a8ccb130e993e95698`](https://basescan.org/tx/0x959ca76b4410f72fc77d66344973d6592154965f8e18d1a8ccb130e993e95698) (Block `53,495,223`) |

### 2.2 Tranche 2 — Additional `$8.03` Buy & LP Deployment (Mint & Stake V3 NFT `#6448166`)

| Step | Action | Contract | Details | Tx Hash & Block |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Buy `MRWD` (`ETH → MRWD`) | `SwapRouter02` (`0x2626664c2603336E57B271c5C0b26F421741e481`) | Swapped `0.001694 ETH` (`~$3.92`) → `8,191,393,197.590893429187544345 MRWD` on the 0.30% pool | [`0x960ad314003cb4e72c3bb62e5bf57cfd219cea797fb3e3da7f219a5631dee5b8`](https://basescan.org/tx/0x960ad314003cb4e72c3bb62e5bf57cfd219cea797fb3e3da7f219a5631dee5b8) (Block `53,495,425`) |
| **2** | Mint Full-Range V3 LP (`#6448166`) | `NonfungiblePositionManager` (`0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`) | Paired `0.001773660955737443 ETH` (`~$4.11`) + `8,191,393,197.590893429187544345 MRWD` at ticks `-887220` to `887220` | [`0x4aca8f86c2b84f836036e24fa739937b56c5fbc83df2645255ce8685324d0246`](https://basescan.org/tx/0x4aca8f86c2b84f836036e24fa739937b56c5fbc83df2645255ce8685324d0246) (Block `53,495,427`) |
| **3** | Stake V3 NFT (`#6448166`) | `UniswapV3Staker` (`0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`) | Transferred and staked `#6448166` into Quarter 1 `MRWD` incentive | [`0x06b82bbeb8f8adf60acea487714cbd349f9cf74ba49f56cca9f2bbcbccfc3e95`](https://basescan.org/tx/0x06b82bbeb8f8adf60acea487714cbd349f9cf74ba49f56cca9f2bbcbccfc3e95) (Block `53,495,429`) |

---

## 3. Verified On-Chain Pool & Staking Snapshot (Block `53,497,806` · `2026-11-04 09:35:59 UTC`)

- **Canonical Pool (`0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5`):**
  - **WETH Reserve:** `0.046335705063088794 WETH` (`$107.43 USD` at `ETH = $2,318.47`)
  - **MRWD Reserve:** `171,444,979,246.109571333170455923 MRWD` (`~171.44B MRWD`)
  - **Total 2-Sided Pool Depth (`2 × WETH`):** **`$214.86 USD`** (above the `$100.00` firm-liquidity threshold)
  - **Active Tick / Rate:** Tick `291625` (`4,618,353,451,990.56 MRWD / WETH` → **`$0.5020` / `50.20¢` per `1B MRWD`**)
- **Active Staked Positions in `UniswapV3Staker` (`0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`):**
  - **`#6448166`:** `1,597,584.2780 MRWD` (`$0.0008` / `0.08¢`)
  - **`#6448087`:** `7,267,813.5011 MRWD` (`$0.0036` / `0.36¢`)
  - **`#6383553`:** `588,142,419.6849 MRWD` (`$0.2953` / `29.53¢`)
  - **`#6383541`:** `588,178,217.5710 MRWD` (`$0.2953` / `29.53¢`)
  - **`#6383531`:** `425,153,706.1912 MRWD` (`$0.2134` / `21.34¢`)
  - **`#6367926`:** `248,672,920.9612 MRWD` (`$0.1248` / `12.48¢`)
  - **Total Accrued (6 / 6 Staked):** **`1,859,012,662.1874 MRWD`** (**`$0.9332` / `93.32¢`**)
- **Other Staked / Locked Positions (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`):**
  - **`MuttProStaking` (`0x67dBC193bF510225EBf189ab25dC3b34a32c1766`):** `1,000,000,000 MRWD` (`$0.5020`), locked until `2026-11-27T08:16:31Z`
  - **`V3PositionTimelock` (`0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25`):** Launch NFT `#6351512` (`200B MRWD`), locked until `2028-10-24T23:11:39Z`
  - **Remaining Wallet Native Base ETH Gas Reserve:** `0.000695904865283479 ETH` (`~$1.61 USD`)

---

## 4. Search Engine & AI Discovery Architecture (`dex.lumsian.com`)

### 4.1 Crawlable Endpoints & Structured Data
- **`vite.config.ts` (`seoRoutesPlugin`)**: Generates 13 route-specific `.html` files in `dist/` during `npm run build` (alongside `/`, `/mrwd`, and `/whitepaper`, totaling **16 standalone canonical HTML pages**), each with a self-referencing `<link rel="canonical">`, route-specific `<title>`, `<meta name="description">`, Open Graph metadata, and crawlable `<main>` HTML containing `0xC17227AAa33C54634B6cE7AD0bf33A156563c179` and `0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5`.
- **`public/mrwd.html` & `index.html`**: Enriched with Schema.org `@graph` JSON-LD (`WebSite`, `WebPage`, `Thing` with CAIP-19 identifier `eip155:8453/erc20:0xC17227AAa33C54634B6cE7AD0bf33A156563c179`, `PropertyValue` list, and `FAQPage` answering canonical contract and pool queries).
- **`public/llms.txt` (`https://dex.lumsian.com/llms.txt`)**: AI search manifest disambiguating `Mutt Rewards (MRWD)` (`0xC17227AAa33C54634B6cE7AD0bf33A156563c179`) on Base (`8453`).
- **`public/tokenlist.json` (`https://dex.lumsian.com/tokenlist.json`)**: Standard Uniswap Token List JSON registering `MRWD`, `SD`, `WETH`, and `USDC` on Base Mainnet (`8453`).
- **`public/add-token.html` (`https://dex.lumsian.com/add-token.html`)**: 1-click MetaMask `wallet_watchAsset` importer for `MRWD` and `SD` on Base Mainnet (`8453`).

### 4.2 Google Search Console & IndexNow Status (as of `2026-11-04T03:31:10-08:00`)
- **IndexNow (`https://api.indexnow.org/indexnow`):** All 16 canonical URLs submitted with key `b4a8c92e1f3d47608a19c2d5e7f01234` → **`HTTP 200 OK`**.
- **Google Search Console Sitemap:** `https://dex.lumsian.com/sitemap.xml` (16 URLs, `lastmod: 2026-11-04`) resubmitted → **`Sitemap submitted successfully`**.
- **Google Search Console URL Inspection Priority Queue:**
  - **Queued on 2026-11-04 (11 URLs):**
    1. `https://dex.lumsian.com/mrwd`
    2. `https://dex.lumsian.com/whitepaper`
    3. `https://dex.lumsian.com/`
    4. `https://dex.lumsian.com/swap`
    5. `https://dex.lumsian.com/stake`
    6. `https://dex.lumsian.com/protocol`
    7. `https://dex.lumsian.com/launchpad`
    8. `https://dex.lumsian.com/launchpad/explore`
    9. `https://dex.lumsian.com/liquidity`
    10. `https://dex.lumsian.com/stake/dexes`
    11. `https://dex.lumsian.com/markets`
  - **Remaining 5 URLs (Included in `sitemap.xml` & Internal `<nav>` Links; Optional Manual Queue After 24h Quota Reset):**
    12. `https://dex.lumsian.com/market-data`
    13. `https://dex.lumsian.com/arbitrage`
    14. `https://dex.lumsian.com/arbitrage/matrix`
    15. `https://dex.lumsian.com/paymaster`
    16. `https://dex.lumsian.com/portfolio`
