# Portfolio DEX Liquidity Explorer — Implementation Record

**Recorded:** 2026-10-31  
**Network:** Base Mainnet (`8453`)  
**Production route:** <https://dex.lumsian.com/stake/dexes>

## Outcome

The original MRWD-only DEX staking comparison was replaced with a connected-wallet portfolio liquidity and rewards explorer. A user can now select a supported Base asset held by the connected wallet or import a custom Base ERC-20 contract, then inspect direct liquidity-pool availability across the application's eight routing venues.

The page deliberately keeps three concepts separate:

1. **Route support** — the swap engine knows the venue.
2. **Pool availability** — a direct pool for the selected token and quote asset was found at the venue factory.
3. **Rewards** — a separate incentive, farm, or gauge program has been verified.

A route or pool never automatically implies staking rewards.

## Supported venues

The explorer retains the canonical Base venue order from `routeVenuesForChain(8453)`:

1. Uniswap V3
2. Uniswap V2
3. Aerodrome
4. PancakeSwap V3
5. SushiSwap V3
6. PancakeSwap V2
7. SushiSwap V2
8. BaseSwap

## Token selection

The page now provides:

- Positive-balance Base portfolio assets from the configured token catalog.
- Explicit MRWD inclusion, even though the older portfolio watchlist omitted it.
- A custom ERC-20 import flow that validates:
  - Base contract address and deployed bytecode;
  - token symbol and name;
  - decimals within a safe bound;
  - the connected wallet's token balance;
  - duplicate token identities.
- Account-scoped imported-token and selection state. Changing wallets clears stale imported balances and safely reconciles the selected token.
- Separate identities for native ETH and ERC-20 WETH.

WETH is the normal quote asset. When WETH itself is selected, the explorer uses USDC as the quote to avoid a WETH/WETH self-pair.

## Direct pool discovery

Pool discovery is performed against venue factories rather than inferred from aggregator quotes. This prevents an indirect multi-hop route from being presented as a direct pool.

The pool matrix checks:

- **V2 venues:** `getPair(token, quote)` for Uniswap V2, PancakeSwap V2, SushiSwap V2, and BaseSwap.
- **V3 venues:** `getPool(token, quote, fee)` across the configured fee tiers for Uniswap V3, PancakeSwap V3, and SushiSwap V3.
- **Aerodrome:** configured stable and volatile classic-pool factory checks.

Results distinguish:

- active liquidity;
- pool found but inactive;
- pool found with liquidity status unknown;
- no pool found;
- unsupported checks;
- partial RPC/factory failures;
- complete query failure.

Failed reads are never converted into a false “empty” or “missing” result. Successful factory results are preserved when another tier or venue call fails.

## Rewards and staking safety

Reward status remains independent of pool discovery.

The existing `MrwdLpStakerPanel` is rendered only when all of the following match:

- selected token is canonical MRWD;
- selected venue is Uniswap V3;
- the canonical MRWD/WETH V3 pool is present.

The interface describes this as a **known canonical program**, not proof that the current reward window is funded or active. Wallet and contract-reported values remain visible, but the page does not claim to independently certify incentive timing or funding.

All other token/venue combinations avoid transaction controls unless a reward adapter can verify the corresponding program. They instead show conservative states such as fees only, rewards unverified, separate funding possible, or gauge/farm eligibility required.

## Wallet and recovery states

The page includes explicit handling for:

- disconnected wallets;
- non-Base networks;
- portfolio loading and query loading;
- no positive configured holdings;
- partial balance reads;
- pool-query partial failures;
- complete pool-query failures;
- custom-token metadata or balance errors.

Partial balance failures remain visible even if other holdings load successfully. A working **Retry balances** action calls the portfolio refetch operation.

## Accessibility and responsive behavior

- Route, pool, and reward stages expose textual status to assistive technology.
- Status does not rely on color alone.
- Token import controls and venue controls are labeled and keyboard operable.
- Venue cards identify their controlled detail region.
- Mobile venue selection scrolls and focuses the updated detail panel.
- Long addresses and metadata are contained to prevent layout overflow.
- Light and dark surfaces use coordinated contrast states.

## Main source files

- `src/pages/DexStaking.tsx` — page, wallet/token command bar, venue ledger, details, recovery states, and strict MRWD gating.
- `src/hooks/useDexPoolMatrix.ts` — typed direct-factory pool discovery and result isolation.
- `src/hooks/useDexPoolMatrix.test.ts` — pool inspection regression tests.
- `src/config/dex-venues.ts` — generic venue capabilities and MRWD-specific verified metadata.
- `src/pages/DexStaking.test.tsx` — selection, metadata validation, venue order, and staking-gate tests.
- `src/components/MrwdLpStakerPanel.tsx` — neutralized reward-status wording.
- `src/App.tsx` — `/stake/dexes` route.
- `src/pages/Stake.tsx` — link to the explorer.
- `src/lib/page-titles.ts` — production page title.
- `.vercelignore` — excludes quarantined dependency directories from CLI deployment payloads.

The obsolete MRWD-only venue configuration was removed after its generic replacement was introduced.

## Dependency repair

The local `node_modules` installation was corrupted. Symptoms included:

- a truncated `csstype/index.d.ts`;
- a missing Vitest `pathe` module;
- an invalid Rollup Windows native binary;
- missing `tsc`, `vite`, and `vitest` command links.

Repair procedure:

1. Verified the exact workspace and dependency-directory paths.
2. Isolated the damaged tree as `node_modules.corrupt-20261030`.
3. Ran `npm ci` against the unchanged lockfile.
4. Installed 1,458 packages and audited 1,459 packages.
5. Confirmed npm reported zero vulnerabilities for the clean install.
6. Confirmed `tsc.cmd`, `vite.cmd`, and `vitest.cmd` exist under `node_modules/.bin`.
7. Permanently removed the quarantined damaged directory.

No source file or lockfile was replaced as part of the dependency reconstruction.

## Verification

The repaired local toolchain produced the following results:

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed |
| `npx vitest run src/pages/DexStaking.test.tsx src/hooks/useDexPoolMatrix.test.ts --reporter=dot` | Passed: 2 files, 8 tests |
| `npm run build` | Passed: 6,660 modules transformed |
| `git diff --check` | Passed |
| Independent design evaluation | Passed after three review rounds |
| Vercel production build | `READY` |

The clean toolchain exposed two TypeScript issues that were corrected before the final deployment:

- the explainer-stage tuple needed a readonly tuple type so Lucide icons were valid JSX components;
- an unused `BASE_ENTRYPOINT_V08` import in the paymaster console was removed.

## Production deployment

The final source was deployed through the repository's linked Vercel project and aliased to:

<https://dex.lumsian.com/stake/dexes>

Identifiers of the first explorer deployment (superseded by later deployments):

- Deployment ID: `dpl_3eaKtgCxdQE7NpWpqEUKsXQHQq3e`
- Generated URL: <https://shaggy-dogg-axd57y2od-richardseattle08-9538s-projects.vercel.app>
- Production alias: <https://dex.lumsian.com>

Vercel authentication protection remains enabled for the deployment.

## Known limitations and next steps

- A direct pool is not proof of a live rewards program. Generic gauge, farm, and Merkl discovery require venue-specific adapters.
- The custom import flow can inspect an ERC-20 supplied by address, but the app does not enumerate every ERC-20 wallet holding from raw RPC. Complete automatic discovery would require an indexer or portfolio API.
- The Aerodrome check is limited to the configured classic factory capability; unsupported Slipstream checks must remain explicitly unverified.
- Incentive timing and funding should be verified on-chain before presenting any generic reward program as live.
- Automated post-deployment browser QA could not run because Chrome exited before producing a DevTools endpoint in the local automation environment. Local type-check, focused tests, production build, and Vercel's clean remote production build all passed.
- The PancakeSwap handoff opens the general liquidity page. PancakeSwap's guide documents adding to existing V2 pools but not creating new ones, so that page is unconfirmed for creating a new V2 pair.
- The SushiSwap V2 handoff opens `https://www.sushi.com/base/pool/v2/add`. `/base/pool/v2/create` was rejected because it is served like a nonexistent path. Whether `/add` can create a new pair is unconfirmed, because Sushi's tutorial page returned no readable content.
- The Uniswap V2 handoff opens `https://app.uniswap.org/positions/create/v2?chain=base`. Uniswap's interface source keeps `/positions/create/:protocolVersion` as a redirect for external links and its create flow covers new pairs, but the app is a single-page site that returns 200 for any path, so a status code proves nothing. The user still selects the pair and confirms the network on Uniswap.
- BaseSwap has no planner: `baseswap.fi` is parked and for sale, so it must not be linked. Its contracts remain live for routing.

## Later changes

### Token catalog checksums

Invalid mixed-case checksums on WXTZ and cbZEC made viem reject the whole balance multicall, which appeared on the page as "28 balance reads failed". Both addresses were corrected, and `src/config/tokens.test.ts` now requires strict checksums across the Base catalog. A live multicall over all 34 configured ERC-20s returned 0 failures.

### DEX pool planners

`src/components/DexPoolPlanner.tsx` renders beneath the selected Uniswap V2, PancakeSwap V3, PancakeSwap V2, or SushiSwap V2 venue for any portfolio or imported token. Each venue's facts live in `POOL_PLANNERS` in `src/config/dex-venues.ts`. The planner prepares a deposit and hands off to the DEX; it never requests approvals or submits transactions.

- **V3:** the four Base fee tiers, implied price, and range guidance.
- **V2:** a fixed fee and full-range model, with no fee-tier or range selection. Each router's `getAmountOut` on Base confirms the fee: 0.25% for PancakeSwap V2 and 0.30% for Uniswap V2 and SushiSwap V2.
- **Existing pairs:** a V2 pair with reserves fixes the deposit ratio, so entered amounts do not change the price. A pair without confirmed reserves warns that a first deposit into an empty pair sets the price.

Production now deploys from a clean export of `origin/main` rather than the working tree.

