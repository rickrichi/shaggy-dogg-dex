# Base execution roadmap: implementation status

Updated October 3, 2026. No live trades, mainnet contract deployment, reward distribution,
or administrator transfer was submitted during this remediation.

## 1. Router comparison and execution

Open `/swap/compare` from the independent DEX's `/swap` page. The swap hook reads
Uniswap V2 and Aerodrome with Multicall3 at one block. It compares direct paths
and paths through WETH, including Aerodrome stable and volatile pools.

The highest token output wins. Pool fees are included in router quotes; network
fees are not used to rank routes. This is not a claim of globally best execution:
V3, split orders, other venues and gas-adjusted ranking are not implemented.

Allowance is read for the selected router, including zero or unknown allowance.
Approval is exact-amount. Execution checks the wallet/account/chain again, reads
the selected route again, preserves the reviewed minimum output, simulates the
call and waits for a successful receipt. Quotes expire after 30 seconds.

Independent Shaggy pools remain at `/swap` and `/liquidity`; comparison routes do
not impersonate those pools or replace their configured deployment.

## 2. CeDeFi desk

`/arbitrage/live` keeps the existing Kraken/Alpaca account and execution bridge.
ETH/USD also shows a live Base USDC-to-WETH route comparison and a link to review
the DEX leg. USD and USDC are separate settlement assets. No synthetic exchange
rate is used to advertise a cross-venue profit.

A bounded Kraken–Base hedge executor is implemented in
`scripts/kraken_base_hedge.py`, also bundled as `shaggy-arb.exe --hedge`.
It follows a specifically authorized, finalized Uniswap V2 USDC-to-WETH swap,
reads actual transfer amounts, checks current inventory and Kraken ETH/USDC
fees/depth, then submits one IOC limit sell. SQLite persists stable order IDs
before submission. Duplicate swaps, uncertain responses and partial fills stop
new execution. `--reconcile` reads existing broker orders without resubmitting.

This is one direction and one router. The user submits the Base leg separately;
continuous opportunity discovery and automatic submission of both legs are not
implemented. It is disabled by default and has not placed a funded test order.
No cross-venue atomicity is claimed. See [hedge operation and recovery](kraken-base-hedging.md).

## 3. MEV and submission

Server-only `.env.private-routing` now selects Alchemy using the existing
endpoint. `scripts/lib/private-submission.ts` validates the provider host, HTTPS,
Base chain ID and endpoint health. Live daemon signing requires this transport;
there is no public broadcast fallback or deployer-key fallback. Dry-run scanning
still works without a private endpoint. RPC errors and URLs are not logged with
credentials. Run `npm run routing:check` to retest.

**Actual blocker:** the existing endpoint returns HTTP 403 with
`BASE_MAINNET is not enabled for this app`. Enable Base Mainnet in the configured
Alchemy app's network settings. The endpoint has not yet passed the health check.

[Alchemy documents MEV protection on Base](https://www.alchemy.com/docs/reference/mev-protection)
for its standard endpoints. [QuickNode](https://www.quicknode.com/docs/base/endpoints)
is also supported by the validation code, with an explicit MEV-enabled setting.
Provider routing policy is a trust assumption; chain ID does not prove privacy.
Browser wallet writes still use the wallet's RPC and remain labeled unverified.
No claim of guaranteed gas refunds or zero loss is made.

## 4. Desktop build

The Electron application includes the compiled frontend, packaged Python
crypto-arb service and a bundled Base scanner. Renderer Node integration is off;
context isolation, sandboxing and web security are on. The local asset server
checks Host and proxies only the crypto-arb service. Backend credentials and
local `.env` files are excluded from the installer.

Commands:

```powershell
npm run desktop:backend
npm run desktop:installer
```

The backend builder currently expects `../crypto-arb/backend/.venv/Scripts/python.exe`
and that project's installed dependencies. It packages Python and dependencies
so the recipient does not need a Python installation. This source-layout
dependency is a build requirement, not a runtime requirement.

The desktop serves `http://127.0.0.1:5174`. It reuses an existing backend on 8000
or starts its bundled service, and stops only children it owns. The menu's Base
scanner uses `--dry-run`: live chain quotes, no transaction submission. It is not
an installed 24/7 Windows service and stops when the app exits.

Use **Open wallet browser** for browser-extension wallets. Electron does not
inherit installed Chrome/Edge wallet extensions. Optional Hono API and cryptostream
services are not bundled; their desktop routes return an explicit 503.

Place optional account configuration in `backend.env` under the desktop's
**Configuration folder**. Do not put keys in `VITE_` variables. The installer is
unsigned. `npm run desktop:release` now requires a trusted code-signing certificate
(`WIN_CSC_SHA1`), passing type/audit checks, mandatory SHA-256 signing and successful
Authenticode verification. It writes separately to `release/signed` and cannot
silently emit an unsigned production installer.

The only local code-signing certificate found is self-signed (`MegaMoney Order
Desk`); its trust chain fails. It is not used as a trusted publisher identity.
A trusted certificate or configured signing service is still required. The
remaining build-tool advisories also block the signed release gate.

## 5. Staking and yield

The deployed FeeDiscountStaking contract is connected on `/stake`. The new USDC
vault panel reads the existing vault and exposes withdrawals for existing holders.
New deposits are disabled until a corrected vault is deployed and configured with
`VITE_YIELD_VAULT_ADDRESS`. `/stake` now includes **Review deployment estimate**
and a wallet deployment action restricted to the existing administrator on Base.
Submitted hashes persist across reloads; receipt checks verify the creation data
and corrected contract version before presenting the configuration address.

`npx tsx scripts/prepare-vault-deployment.ts` prepared an unsigned transaction in
`release/vault-deployment-review.json`. Live reads verified the Aave reserve,
existing administrator/treasury and zero legacy assets/shares. The estimate was
1,258,383 execution gas (about 0.000007550298 ETH at the observed gas price), plus
L1 data fees. Refresh before signing. No deployment has been submitted.

The source discount denominator was corrected from 1,000 to 10,000 in both Aave
and Compound vaults. A 500-bps discount now reduces a 10% performance fee to 9.5%,
not 5%. Deposits that would mint zero shares revert. The updated contracts expose
`discountDenominator()` and deployment artifacts have been regenerated. These
source changes do not upgrade the existing immutable deployment.

The concrete [economic policy](protocol-economics.md) has **approved terms but is not live**
(config/protocol-economics.json, `enabled: false`), specifying 10% (1,000 bps) of realized net USDC profit
to time-weighted stakers, 90% (9,000 bps) to treasury, 7-day weekly epochs, loss carryforward
and advisory governance. The staker reward pool is surfaced directly on /stake via
StakerRewardPoolPanel and /arbitrage/flash-loans. The weekly accounting ledger
(scripts/calculate-epoch-rewards.ts) computes auditable staker allocations from Base
Mainnet events and trade fills, but it only calculates numbers: **no rewards are paid today**.
The staking contract is immutable and has no reward or claim function, and no distributor
contract exists. Paying stakers needs a new, reviewed and funded distribution mechanism,
plus realized profit from the arbitrage desk, which has not yet run with real funds.

## Verification

- App and Vite TypeScript checks pass; server type check passes.
- Frontend: 106 tests pass, one existing TODO. Server: 15 tests pass.
- Hedge journal/reconciliation/receipt validation: three Python tests pass.
- Corrected vault: two Base mainnet fork tests pass at block 52,144,242 using real
  WETH, USDC, AMUTT, Aave and staking contracts. No mock token contracts.
  Aave supply/withdrawal and the actual 5% staking discount were exercised.
  The pinned Aave supply rounds down by two micro-USDC; the test accounts for it.
- Production frontend build passes; packaged backend returns HTTP 200 and its
  bundled `--hedge --help` command runs. Desktop asset-server test passes.
- Desktop browser checks verified the deployment estimate and live 25 USDC
  router comparison after removing manual vendor chunks that caused a circular
  wallet-module initialization and blank page. No wallet was connected.
- The packaged Python environment's pip-audit found no known vulnerabilities.
- Root dependency advisories reduced from 86 (five critical) to 14 high advisories
  confined to build tooling; production dependencies audit clean. Server audit: zero.
  See [remaining dependency advisories](dependency-remediation.md).
- Scanner signals no longer create fake transaction hashes or count projected
  profit as realized profit. The daemon increments confirmed trade count only
  after successful receipts and does not claim a realized profit total.
- Installer: `release/desktop/Shaggy-Dogg-Dex Setup 0.1.0.exe` (development build,
  unsigned). A signed release remains blocked by certificate and build-tool issues.
