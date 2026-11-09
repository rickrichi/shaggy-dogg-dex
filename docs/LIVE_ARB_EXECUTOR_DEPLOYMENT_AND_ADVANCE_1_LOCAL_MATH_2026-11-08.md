# Live `ArbExecutor` Mainnet Deployment (Base & Ethereum), Funding, and Advance #1 (`< 1 ms` Local Math Trade Sizing) Session Record

- **Timestamp (Local):** `2026-11-08T04:18:26-08:00` (PST)
- **Timestamp (UTC):** `2026-11-08T12:18:26Z`
- **Networks:** Ethereum Mainnet (`Chain ID: 1`) & Base Mainnet (`Chain ID: 8453`)
- **Production Dashboard:** [https://dex.lumsian.com/mev](https://dex.lumsian.com/mev)
- **Live Bot Telemetry Endpoint:** [https://34-9-52-175.sslip.io/api/mev/arb/summary](https://34-9-52-175.sslip.io/api/mev/arb/summary)
- **GCE Server Instance:** `market-data` (`34.9.52.175`, `us-central1-a`, project `gen-lang-client-0684646719`)
- **Bot Repository:** `D:\aave-mev`
- **Dashboard Repository:** `D:\shaggy-dogg-dex` ([https://github.com/rickrichi/shaggy-dogg-dex](https://github.com/rickrichi/shaggy-dogg-dex))

---

## 1. Executive Summary

During the 8 November 2026 session, the Uniswap v2 / v3 / v4 Arbitrage & Flashbots MEV-Share Backrun system transitioned from **`shadow`** mode to **`live`** mode on both **Base Mainnet** and **Ethereum Mainnet**, followed by the implementation and GCE deployment of **Advance #1 (`< 1 ms` Local Math Trade Sizing & Cached Block State)**:

1. **In-Browser `ArbExecutor` Deploy & Fund Studio (`src/components/ArbExecutorDeployCard.tsx`):**
   - Added a one-click deployment, gas-funding, and Base $\rightarrow$ Ethereum L1 Relay bridge UI directly on [https://dex.lumsian.com/mev](https://dex.lumsian.com/mev), pre-configured for the owner wallet **ShaggyDogg (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`)**.
   - Added dynamic EIP-1559 fee overrides (`maxFeePerGas = 2 * baseFeePerGas + 0.02 gwei`) so MetaMask does not over-estimate Ethereum Mainnet deployment and transfer gas.
2. **On-Chain `ArbExecutor` Contract Deployments & Wallet Funding:**
   - Deployed `ArbExecutor.sol` on **Base Mainnet** (`0x48a3e5e013B30E12d66008b62fF74840aA9611E5`) and **Ethereum Mainnet** (`0xeB9b695770BE083b6bE7f40B9F4682EcC5793179`).
   - Funded the **Operator Hot Wallet (`0x804E445427A0B867278a838C2d81a93A3A3200Be`)** on Base (`0.0020 ETH`) and Ethereum Mainnet (`0.001478 ETH` via Relay Protocol instant bridge), and funded the **Ethereum `ArbExecutor`** with `0.0005 ETH` for `block.coinbase` builder bribes.
   - Activated **`mode: "live"`** across Base Arbitrage, Ethereum Arbitrage, and Ethereum Flashbots MEV-Share Backruns on the GCE `market-data` VM.
3. **Advance #1 — `< 1 ms` Local Math Trade Sizing & Zero-RPC Cached Block State (`D:\aave-mev`):**
   - Eliminated ~80–85% of per-hint and per-block RPC round-trips by computing exact Uniswap v2 constant-product and Uniswap v3/v4 single-tick-range `SqrtPriceMath` swap outputs locally in CPU memory (`< 0.1 ms`, `0` RPC calls) and verifying a 4-point bracket in **1 single batched `eth_call` round-trip** instead of 2 sequential rounds of 15 `eth_call`s.
   - Cached the latest Ethereum block's pool states (`states`), `baseFeePerGas`, `bribeFloat`, and static upper storage slot words (`slot0` / `slot8`) so incoming Flashbots MEV-Share hints evaluate immediately without waiting on redundant HTTP RPC queries.

---

## 2. On-Chain Deployments, Wallets & Funding Ledger

| Role / Contract | Network | Address | Transaction Hash / Block | Balance / Config |
| :--- | :--- | :--- | :--- | :--- |
| **Owner (`owner`, Cold Profit Recipient)** | Base & Ethereum | `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` | — | Receives all `sweep()` profits (`onlyOwner`) |
| **Operator (`operator`, Hot Signer)** | Base & Ethereum | `0x804E445427A0B867278a838C2d81a93A3A3200Be` | Base fund: `0x6fbcb7cb706a0af5275bad364e4f8d8e8a77607d5a65e25fdfa256dc26dbd5a7`<br>Relay bridge (Base $\rightarrow$ ETH): `0x8c23bbb182c083d7b0e4d6369f29161282c6fe543aa9d9ebbd73085e9f61010b` | `0.0020 ETH` (Base)<br>`0.001478 ETH` (Ethereum) |
| **Flashbots Auth Key (`FLASHBOTS_AUTH_KEY`)** | Ethereum | `0xE2c3f102Ce0DfE7E6A468D81c3Eb69ef303c5f14` | Off-chain `X-Flashbots-Signature` reputation key | Separate from `operator` |
| **Base `ArbExecutor` (`ARB_EXECUTOR_BASE`)** | Base Mainnet (`8453`) | `0x48a3e5e013B30E12d66008b62fF74840aA9611E5` | Deploy tx: `0x0a6b63a039f028898234fb281b3ff57ec13bc4b04dfda4ca8adf7c25e89883eb` (`#54695651`) | Verified on-chain (`poolManager`, `weth`, `owner`, `operator`) |
| **Ethereum `ArbExecutor` (`ARB_EXECUTOR_ETHEREUM`)** | Ethereum Mainnet (`1`) | `0xeB9b695770BE083b6bE7f40B9F4682EcC5793179` | Deploy tx: `0xd2673b6960c6d6b1791b972450a21cd67cbc15b68530f3bfa49ac744ef33c345` (`#26369685`)<br>Bribe float tx: `0x9b4cee6407aa61b8d0c57f84ad7339b76beea9a078a609bf95af4f1ea0cf1d7e` | `0.0005 ETH` builder bribe float |

---

## 3. Advance #1: `< 1 ms` Local Math Trade Sizing & Cached Block State

### 3.1 Problem Diagnosed
Previously, when a Flashbots MEV-Share event arrived in `src/arb/backrun.ts`, `evaluate()` executed up to **9 sequential RPC round-trips (~20+ RPC requests, `500–900 ms` over HTTP)** before submitting a bundle:
1. `getBlockNumber()` (1 RTT)
2. `readStates()` multicall across 50 pools (1 RTT)
3. `postStateOverride()` `eth_getStorageAt` calls (1 RTT)
4. `getBlock()` (1 RTT)
5. `getBalance(executor)` (1 RTT)
6. `bestSize()` coarse 9-point `eth_call` grid (1 RTT)
7. `bestSize()` fine 6-point `eth_call` refinement (1 RTT)
8. `simulateArb()` pre-decision gas check (1 RTT)
9. `simulateArb(final)` + sequential `getTransactionCount()` (2 RTTs)

### 3.2 Closed-Form / Local Integer Swap Math (`src/arb/scan.ts` & `src/arb/venues.ts`)
1. **Raw Pool Parameters (`RawPoolState` on `VenueState` in `src/arb/venues.ts`):**
   - `readStates()` now preserves the exact `bigint` reserves (`{ kind: 2, reserve0, reserve1 }`) for Uniswap v2 and `{ kind: 3 | 4, sqrtPriceX96, liquidity, tick }` for Uniswap v3/v4 on every `VenueState`.
   - In `src/arb/backrun.ts`, when a MEV-Share `SwapHint` supplies post-swap state (`h.post`), `adjusted` updates both `price` and `raw` with the exact post-swap reserves or `sqrtPriceX96`/`liquidity`.
2. **Exact Single-Range Swap Math (`localSwapOut` in `src/arb/scan.ts`):**
   - **Uniswap v2 (`kind === 2`):**
     $$\Delta y = \frac{\Delta x \cdot (10^6 - f) \cdot R_{\text{out}}}{R_{\text{in}} \cdot 10^6 + \Delta x \cdot (10^6 - f)}$$
   - **Uniswap v3 / v4 (`kind === 3 | 4`, within active tick range $L$, $\sqrt{P} = \text{sqrtPriceX96}$):**
     - For `zeroForOne = true` ($\text{token}_0 \rightarrow \text{token}_1$, $\sqrt{P}$ decreases):
       $$\Delta y = \frac{L \cdot \Delta x_{\text{eff}} \cdot \sqrt{P}^2}{(L \cdot 2^{96} + \Delta x_{\text{eff}} \cdot \sqrt{P}) \cdot 2^{96}}$$
     - For `zeroForOne = false` ($\text{token}_1 \rightarrow \text{token}_0$, $\sqrt{P}$ increases):
       $$\Delta x = \frac{L \cdot \Delta y_{\text{eff}} \cdot 2^{192}}{\sqrt{P} \cdot (L \cdot \sqrt{P} + \Delta y_{\text{eff}} \cdot 2^{96})}$$
3. **Sub-Millisecond Local Optimizer (`localBestSize` & `bestSize` fast-path in `src/arb/scan.ts`):**
   - `localBestSize(buy, sell, lo, hi)` evaluates a 24-point geometric grid + 16-step ternary refinement in pure `bigint` CPU arithmetic in **`< 0.1 ms` (`0` RPC calls)**.
   - `bestSize(profit, lo, hi, { buy, sell })` then probes a 4-point bracket (`[lo, a*/2, a*, 3a*/2]`) in **1 single batched `eth_call` round-trip** to verify the exact on-chain `ArbExecutor` profit (and automatically refines `[lo, a*/2]` if a narrow tick boundary was crossed).

### 3.3 Block-State & Storage-Slot Caching (`src/arb/backrun.ts`, `src/arb/mevshare.ts`, `src/arb/main.ts`)
- **Zero-RPC Hint Context (`latestSnapshot` & `latestBlockMeta` in `src/arb/backrun.ts`):**
  - `onBlock(block, states)` caches the latest Ethereum block's `states` (valid for 20s), and `evaluate()` caches `baseFeePerGas` and `bribeFloat` per block number so hints arriving within a block make **0 RPC calls** for block/pool/balance metadata.
- **60-Second High-Bit Slot Cache (`slotWordCache` in `src/arb/mevshare.ts`):**
  - `postStateOverride` caches the static high bits of `slot0` (v3/v4 `unlocked`, `feeProtocol`, `lpFee`) and `slot8` (v2 `blockTimestampLast`) for 60 seconds per pool, eliminating per-hint `eth_getStorageAt` round-trips.
- **Parallel Final Recheck & Nonce Lookup (`src/arb/backrun.ts` & `src/arb/main.ts`):**
  - Removed the redundant pre-decision `simulateArb` gas check and parallelized `simulateArb(final)` with `getTransactionCount({ blockTag: "pending" })` in a single `Promise.all`.

---

## 4. Advance #2: Multi-DEX Expansion (7 DEX Protocols, 470 Pairs / 843 Funded Pools) & Hot/Cold Tiered Scanning

### 4.1 Multi-DEX Factory Integration (Zero Smart-Contract Redeployment)
Because `ArbExecutor.sol` executes standard `IUniswapV2Pair.swap` (`kind = 2`) and `IUniswapV3Pool.swap` with `uniswapV3SwapCallback` (`kind = 3`), we added every compatible DEX factory on Ethereum and Base directly into [`src/arb/config.ts`](file:///D:/aave-mev/src/arb/config.ts) and [`src/arb/venues.ts`](file:///D:/aave-mev/src/arb/venues.ts):

- **Ethereum Mainnet (`15` DEX/tier slots per pair):**
  - **Uniswap v2** (`0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f`)
  - **SushiSwap v2** (`0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac`)
  - **PancakeSwap v2** (`0x1097053Fd2ea711dad45caCcc45EfF7548fCB362`)
  - **Uniswap v3** (`0x1F98431c8aD98523631AE4a59f267346ea31F984`, 4 tiers: `0.01%`, `0.05%`, `0.3%`, `1%`)
  - **SushiSwap v3** (`0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F`, 4 tiers: `0.01%`, `0.05%`, `0.3%`, `1%`)
  - **Uniswap v4** (`0x000000000004444c5dc75cB358380D2e3dE08A90`, 4 tiers: `0.01%`, `0.05%`, `0.3%`, `1%`)
- **Base Mainnet (`16` DEX/tier slots per pair):**
  - **Uniswap v2** (`0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6`)
  - **SushiSwap v2** (`0x71524B4f93c58fcbF659783284E38825f0622859`)
  - **PancakeSwap v2** (`0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E`)
  - **BaseSwap v2** (`0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB`)
  - **Uniswap v3** (`0x33128a8fC17869897dcE68Ed026d694621f6FDfD`, 4 tiers)
  - **SushiSwap v3** (`0xc35DADB65012eC5796536bD9864eD8773aBc74C4`, 4 tiers)
  - **Uniswap v4** (`0x498581ff718922c3f8e6a244956af099b2652b2b`, 4 tiers)

### 4.2 470-Pair Universe & Live Discovery Pruning
- Expanded [`src/arb/config.ts`](file:///D:/aave-mev/src/arb/config.ts) to **369 Ethereum pairs** + **101 Base pairs** = **470 total pairs** (`7,151` candidate DEX/tier pools), all quoted in `allowedQuote`-approved flash-loan currencies (`WETH`, `USDC`, `USDT`, `DAI` on Ethereum; `WETH`, `USDC` on Base).
- Upgraded `discoverVenues()` in [`src/arb/venues.ts`](file:///D:/aave-mev/src/arb/venues.ts) to use `chunkedMulticall()` (`220` calls/chunk, concurrency `4`), prune dead/zero-liquidity pools (`liquidity === 0` or `v2 depth < minV2QuoteReserve`), and keep only pairs with $\ge 2$ funded pools:
  - **Ethereum Mainnet:** **501 live funded pools** across **128 multi-venue pairs** (10x increase from 50 venues).
  - **Base Mainnet:** **342 live funded pools** across **67 multi-venue pairs** (7.6x increase from 45 venues).
  - **Combined:** **843 live funded pools** across **195 arbitrageable pairs** discovered in `8.5 seconds`.
- Upgraded [`src/arb/main.ts`](file:///D:/aave-mev/src/arb/main.ts) with **Hot/Cold Tiered Scanning** (`stateById` + `hotUntil`): every block refreshes all core/hot pairs (any pair with `bestEdgeBps >= -10` stays hot for 10 minutes) plus a rotating batch of `80` cold venues, keeping per-block RPC calls to 1 fast multicall while watching all 501 Ethereum pools on the Flashbots MEV-Share stream in `O(1)` memory.

---

## 5. Verification & Live Deployment Status

| Check | Command / Endpoint | Result |
| :--- | :--- | :--- |
| Bot TypeScript Check | `npm run typecheck` (`D:\aave-mev`) | **PASS** (`0` errors) |
| Bot Unit Test Suite | `npm test` (`D:\aave-mev`) | **51 / 51 PASS** (`summary`, `core`, `arb`, `backrun`) |
| Dashboard Lint & Tests | `npm run lint && npx tsc --noEmit && npm test` (`D:\shaggy-dogg-dex`) | **0 warnings, 0 errors, 80/80 test suites (`554` tests) PASS** |
| GCE Deployment (`market-data`) | `tar -xzf ~/mev-backrun3.tar.gz -C ~/aave-mev && sudo bash ~/aave-mev/setup-mev.sh` | **LIVE** (`aave-mev`, `uni-arb`, `caddy` containers running) |
| Live Telemetry Check | `https://34-9-52-175.sslip.io/api/mev/arb/summary` | **Base: `mode: "live"`**, **Ethereum: `mode: "live"`**, **Backrun: `mode: "live"`, `connected: true`**, `errors: 0` |
