# Flashbots MEV-Share Backrunner, Pool-Only After-the-Fact Scoring & Dashboard Session Record

- **Timestamp (Local):** `2026-11-07T20:27:21-08:00` (PST)
- **Timestamp (UTC):** `2026-11-08T04:27:21Z`
- **Networks:** Ethereum Mainnet (`Chain ID: 1`) & Base Mainnet (`Chain ID: 8453`)
- **Production Dashboard:** [https://dex.lumsian.com/mev](https://dex.lumsian.com/mev)
- **GCE Server Instance:** `market-data` (`us-central1-a`, project `gen-lang-client-0684646719`)
- **Bot Repository:** `D:\aave-mev`
- **Dashboard Repository:** `D:\shaggy-dogg-dex` ([https://github.com/rickrichi/shaggy-dogg-dex](https://github.com/rickrichi/shaggy-dogg-dex))

---

## 1. Executive Summary

During the 7 November 2026 session, the following milestones were completed, verified against live Ethereum Mainnet pools and the Flashbots MEV-Share stream, and packaged for deployment:

1. **Uniswap v2 / v3 / v4 Post-Block Arbitrage Evaluation (Base & Ethereum):**
   - Evaluated a 2-hour shadow run (`2,244` Base blocks, `539` Ethereum blocks; zero errors or rate limits).
   - Confirmed that post-block price gaps are already closed intra-block by backrunners: remaining gaps on Base (`cbBTC/USDC`, `wstETH/WETH`) sit in near-empty pools that lose value when simulated, while remaining gaps on Ethereum (`0.3–2 bp`) yield `0.000003–0.000014 ETH` before `~0.00002 ETH` of gas.
2. **Flashbots MEV-Share Backrunner (`src/arb/mevshare.ts`, `src/arb/backrun.ts`):**
   - Built an Ethereum MEV-Share listener (`https://mev-share.flashbots.net`) running inside the existing `uni-arb` process so no extra container is needed on the `e2-micro` VM.
   - For hints that share full `Swap`/`Sync` log data (`withSwapData`), reconstructs the pool's post-swap storage state via `eth_call` state overrides (`postStateOverride` for Uniswap v2 slot `8`, v3 slots `0`/`4`, and v4 `PoolManager` `_pools` mapping at slot `6`), identifies fee-beating routes (`backrunRoutes`), sizes the backrun via `ArbExecutor` simulation (`bestSize`), and prices gas plus the builder payment.
   - Enforces backrun-only ordering (`[userTx, ourTx]` via `mev_sendBundle` with `canRevert: false`), returning 90% of the builder payment to the user by default.
   - Added `moveKey` deduplication and 3-way concurrency (`MAX_INFLIGHT = 3`), cutting skipped hints on the VM from ~49% (`80/163`) down to `<4%` (`1/27`).
3. **After-the-Fact Scoring for Pool-Only MEV-Share Hints (`readBlockSwaps` & `bestBlindSize`):**
   - Default-privacy MEV-Share hints (`poolOnly`) reveal which pool was touched but omit swap direction and size (`data: "0x"`).
   - Built after-the-fact shadow scoring: when a pool-only hint touches one of our 50 watched Ethereum pools, the venue is queued for the next `blocks` window. Once each Ethereum block lands and its full `Swap`/`Sync` logs become public, `readBlockSwaps` fetches and sorts the block's logs (chunked at $\le 10$ addresses per `eth_getLogs` call for free-RPC compatibility), skips moves already announced with full swap data, overrides the pool into its exact post-swap state, and scores:
     1. **Ideal Backrun (`bestSize`):** What an omniscient backrun of that landed swap would have earned.
     2. **Fixed Blind Grid (`bestBlindSize`, `BLIND_USD = [100, 500, 2_500, 10_000]`):** What the best of 4 fixed blind trade sizes would have captured.
4. **Live `/mev` Dashboard Integration (`src/pages/MevArb.tsx`, `src/pages/MevBot.test.tsx`):**
   - Added the **Ethereum backruns (Flashbots MEV-Share)** card to `https://dex.lumsian.com/mev`, displaying live stream connection status, total hints seen, hints on watched pools (`withSwapData` vs. `poolOnly`), pool-only swaps matched and priced after landing, ideal vs. blind net ETH results, and Etherscan transaction links.
5. **TextTalk Installer Verification (`lumsian.com`):**
   - Verified that `https://lumsian.com/downloads/texttalk/TextTalk-Setup-1.0.0-x64.exe` is live on GoDaddy (`HTTP 200 OK`, `85,697,072 bytes`, `public_html/downloads/texttalk/TextTalk-Setup-1.0.0-x64.exe`) and resolved the `textalk` (single `t`) vs. `texttalk` (double `t`) URL typo.

---

## 2. Technical Architecture & Files Modified

### 2.1 Bot Repository (`D:\aave-mev`)

| File | Summary of Changes |
| :--- | :--- |
| `src/arb/mevshare.ts` | SSE stream parser (`parseSse`, `streamMevShare`), venue indexer (`indexVenues`), `Swap`/`Sync` log decoder (`matchSwaps`), storage overrides (`packSlot0`, `packV2Reserves`, `v4StateSlot`, `postStateOverride`), on-chain block log reader (`readBlockSwaps`), and `mev_sendBundle` signer (`backrunBundle`, `sendBackrunBundle`). |
| `src/arb/backrun.ts` | `backrunRoutes`, `moveKey` deduplication, `bestBlindSize` (`$100`, `$500`, `$2,500`, `$10,000`), real-time `withSwapData` evaluation, and per-block `onBlock` after-the-fact scoring for `poolOnly` hints (shadow-only). |
| `src/arb/summary.ts` | Added `BackrunSummary`, `BackrunRow`, and `PoolOnlyScore` (`poolOnlyLanded`, `poolOnlySimulated`, `blindWorthSending`, and per-row `poolOnly` blind metrics) with restart persistence in `data/arb-summary.json`. |
| `src/arb/live.ts` | Added `BackrunSettings` (`ARB_BACKRUN`, `ARB_BACKRUN_MIN_NET_WEI`, `ARB_BACKRUN_BID_FRACTION`, `ARB_BACKRUN_BLOCKS`, `MEV_SHARE_STREAM_URL`, `MEV_SHARE_RELAY_URL`). |
| `src/arb/main.ts` | Wired `startBackrunner` into the Ethereum scanner loop and passed `(block, states)` from each Ethereum block into `backrunner.onBlock(block, states)`. |
| `scripts/verify-backrun-overrides.ts` | Mainnet verification script proving `postStateOverride` writes the exact storage slots on live Uniswap v2, v3 (including negative ticks), and v4 pools while preserving untouched packed fields. |
| `test/backrun.test.ts` | 14 unit tests covering SSE parsing, v2/v3/v4 log decoding, pool-only hints, slot packing, route filtering, bundle formatting, relay signing, `moveKey` deduplication, `readBlockSwaps` log ordering, and `bestBlindSize` scoring. |
| `README.md` | Documented Flashbots MEV-Share backrunning, after-the-fact pool-only scoring, verification commands, and `/etc/uni-arb.env` settings. |

### 2.2 Dashboard Repository (`D:\shaggy-dogg-dex`)

| File | Summary of Changes |
| :--- | :--- |
| `src/pages/MevArb.tsx` | Added `BackrunCard`, `BackrunSummary`, and `BackrunRow` types and UI table displaying both real-time (`withSwapData`) and after-the-fact (`pool-only`) backrun evaluations, Etherscan tx links, and blind-grid net ETH comparisons. |
| `src/pages/MevBot.test.tsx` | Added unit test suite for `MEV-Share backrun card` verifying hint counters, after-the-fact matched/priced counts, route rendering, and blind net ETH display. |

---

## 3. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| Live Mainnet Storage Overrides (v2, v3, v4) | `npx tsx scripts/verify-backrun-overrides.ts` | **11 / 11 PASS** (reserves, `sqrtPriceX96`, negative ticks, liquidity, untouched fields preserved) |
| Bot TypeScript Typecheck | `npm run typecheck` (`D:\aave-mev`) | **PASS** (0 errors) |
| Bot Unit Test Suite | `npm test` (`D:\aave-mev`) | **50 / 50 PASS** across 4 test files (`summary`, `core`, `arb`, `backrun`) |
| Dashboard Unit Tests & ESLint | `npx vitest run src/pages/MevBot.test.tsx && npx eslint src/pages/MevArb.tsx src/pages/MevBot.test.tsx` | **7 / 7 PASS**, **0 lint warnings/errors** |
| GCE Server Bundle (`mev-backrun3.tar.gz`) | Built via `esbuild` + `tar` (`C:\Users\fbada\Desktop\mev-backrun3.tar.gz`) | **`2,660,509` bytes** (`dist/main.mjs`, `dist/arb.mjs`, `artifacts/`, `seed/`, `Dockerfile`, `setup-mev.sh`) |

---

## 4. Pending Deployment Commands (When Ready)

### 4.1 GCE Server (`market-data` VM in `us-central1-a`)
Open the browser SSH window:
`https://ssh.cloud.google.com/v2/ssh/projects/gen-lang-client-0684646719/zones/us-central1-a/instances/market-data`

```bash
rm -f ~/mev-backrun2.tar.gz ~/mev-backrun3.tar.gz && rm -rf ~/aave-mev
# Upload C:\Users\fbada\Desktop\mev-backrun3.tar.gz via UPLOAD FILE
ls -la ~/mev-backrun3.tar.gz   # Expected size: 2660509
mkdir -p ~/aave-mev && tar -xzf ~/mev-backrun3.tar.gz -C ~/aave-mev && sudo bash ~/aave-mev/setup-mev.sh
```

### 4.2 Production Dashboard (`https://dex.lumsian.com/mev`)
Commit and push `src/pages/MevArb.tsx` and `src/pages/MevBot.test.tsx` in `D:\shaggy-dogg-dex`, then deploy to Vercel production (`npx --yes vercel@63.1.2 deploy --prod --yes`).
