# Local arbitrage workshop

The Python source lives at `D:\crypto-arb\backend`. The desktop application packages that
source with the DEX interface. The public website remains a market-data viewer.

## Implementation plan and completion checks

1. Match the existing frontend API: snapshots, WebSocket stream, account SSE,
   Kraken/Alpaca comparison, preview/execute/reconcile/recover, and Kraken triangles.
2. Make execution durable: record intent and client order IDs before submission,
   retain broker IDs before polling, reject duplicate previews, and serialize both strategies.
3. Recheck balances, book freshness, fees, precision, minimum sizes and bounded prices.
   Block additional trades while prior orders or exposure remain unresolved.
4. Package the new backend; keep credentials and the SQLite journal in the user's
   configuration folder, outside the installed application.
5. Run fake-exchange regression tests, desktop proxy tests, type checking, packaging,
   and a read-only live market-data smoke test.

## Open the workshop

Run `release\desktop\win-unpacked\Shaggy-Dogg-Dex.exe` or install the generated setup
program in `release\desktop`. The application starts its bundled backend on loopback.
Use **Shaggy-Dogg-Dex → Edit exchange settings (restart to apply)** to edit `backend.env`.
The adjacent **Configuration folder** menu opens the actual data directory.

Add Kraken and Alpaca keys locally. No credentials are included in the installer.
`ARB_LIVE_TRADING=false` is the initial setting. Enabling it permits orders only through
the desk's explicit execution controls. Cross-venue trades require USD on the buy venue
and the coin already held on the sell venue. Alpaca paper accounts cannot hedge real
Kraken orders and are blocked from cross-venue execution.

Source mode uses `D:\crypto-arb\backend\.env` and `run.ps1`. Desktop mode uses
`backend.env` and `data\arb.sqlite` under Electron's user-data directory. These are
separate configurations; existing credentials are never copied automatically.

## Interrupted trades

Refresh broker status before any further trade. Unknown submission outcomes remain
blocked until an order can be matched by its saved client ID. A failed search does not
prove that an order was never accepted. The journal is never automatically cleared.
Cross-venue exposure can be recovered at the original sell floor after reconciliation.
Triangle partial fills halt the sequence and list remaining currencies in triangle history;
they require broker-side resolution and operator review of the journal before resuming.

Quotes are estimates, and orders across venues are not atomic. Partial fills, delayed fees,
and market movement can leave inventory or a loss. A completed execution is not a guarantee
of profit; verify final broker fills and fees.

## Build and validate

```powershell
Set-Location D:\crypto-arb\backend
uv run pytest
uv run ruff check app tests
Set-Location D:\shaggy-dogg-dex
npm run type-check
node --test desktop/server.test.cjs
npm run desktop:backend
npm run desktop:installer
```

The local installer is unsigned. The separate signed release process requires an installed
publisher certificate; it is not needed to run this personal workshop.

## Verification on October 27, 2026

- 21 backend tests passed against the installed source, using fake exchanges.
- Type checking, lint on changed frontend files, and the desktop HTTP proxy test passed.
- The frozen backend reported service version 2.1.0 and live trading disabled.
- A live smoke check through the desktop proxy returned 16 live exchange books and 16 routes.
- Browser checks verified the Live Desk and CeDeFi pages, missing-key explanations,
  disabled trade controls, USD triangle amounts, and scanning without automatic execution.
- The packaged Electron executable started its own backend, created `backend.env` and
  `data/arb.sqlite` in `%APPDATA%\shaggy-dogg-desktop`, and rendered the updated Live Desk.
- Installer SHA-256: `FE8ADAD643BA7FDFE5BA96B96442049988D6AFDD81DEEE99CD5A355351AAA4C9`.
- Kraken/Alpaca authenticated account access and real order execution were not tested:
  no exchange credentials were configured and no orders were submitted.
