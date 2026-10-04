# Kraken–Alpaca live integration

The CeDeFi Studio uses the sibling `crypto-arb/backend` service on port 8000.
Run one backend worker: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1`.
Run the frontend with `npm run dev` and open `/arbitrage/cedefi`.

## Accounts and feeds

- Credentials remain in `crypto-arb/backend/.env`; never put them in `VITE_*` variables.
- Alpaca uses live credentials and explicitly disables CCXT sandbox mode. The adapter checks the actual signed account URL against `https://api.alpaca.markets/v2/account` before access. The old `ALPACA_PAPER` flag no longer selects the endpoint.
- `ALPACA_DATA_LOCATION` defaults to `us`. `us-1` and `eu-1` identify Kraken as the underlying venue and cannot be paired with Kraken as an independent market.
- Alpaca streaming explicitly uses `/v1beta3/crypto/{location}`. Include `alpaca` and `kraken` in `ARB_EXCHANGES` if overriding the default venue list.
- Alpaca initially subscribes to `BTC/USD` and `ETH/USD`; `ARB_ALPACA_SYMBOLS` can change that list within the account's symbol entitlement. The full matrix's symbol list does not automatically consume broker subscriptions.
- Balances refresh centrally every five seconds after each fetch and stream to the UI using SSE. Snapshots older than 30 seconds become unavailable. Positions and open-order reservations must both load successfully.
- Alpaca available inventory is the smaller of broker `qty_available` and position quantity minus remaining sell orders. Cash is capped by non-marginable buying power and open buy reservations. An unpriced outstanding buy blocks available cash conservatively.
- Kraken inventory uses its extended balance API through CCXT, including trade holds. Assets without a current USD quote remain explicitly unpriced.

## Live pair workflow

1. The comparison panel reads both directions for an exact USD crypto pair. It walks depth, uses the Alpaca account crypto tier and Kraken account trading fee, and displays available cash and inventory.
2. Preview refreshes accounts and fees, verifies distinct underlying venues and market minimums, and stores a 20-second server-side preview. Limits include a default 10-basis-point price allowance; the required net edge at those limits is at least 5 basis points. Maximum cash cost cannot exceed the chosen budget.
3. **Execute live pair** authorizes the preview's bounded buy and sell sequence. The server rechecks fees, freshness, inventory, and prices. Each request has an idempotency ID.
4. An IOC limit buy is reconciled with the broker. The sell quantity follows confirmed fills, with Alpaca buy fees deducted in the received crypto asset. Kraken requests quote-currency fees.
5. A partial sell receives at most one further IOC attempt at the same approved price floor. Unfinished orders are canceled and queried again. Unknown acceptance never causes a blind resubmission.
6. The UI reports broker order IDs, fills, average prices, net cash flow, and remaining exposure. Estimated fees stay labeled until the broker returns them. A completed order is not assumed to have zero unreported fees.
7. Records persist in `backend/data/live-executions.sqlite3`. On restart, unresolved records block new execution. **Refresh broker order status** only queries orders. **Execute residual sell at original limit** explicitly authorizes another bounded recovery attempt. Small quantities below market minimums remain visible as exposure.

The two venues cannot provide an atomic combined fill. The original price floor can prevent recovery when the market moves away; the app retains and reports that exposure. It does not chase the market automatically.

## Endpoints

- `GET /api/accounts/stream`
- `GET /api/live/comparison?symbol=ETH/USD&notional=100`
- `POST /api/live/preview`
- `POST /api/live/execute` (also `/api/alpaca/trade`; old unpaired payloads are rejected)
- `GET /api/live/executions`
- `POST /api/live/executions/{id}/reconcile`
- `POST /api/live/executions/{id}/recover`

POST requests require an allowed application Origin and `X-Trade-Intent: live`.
The service is intended for this local application, bound to loopback. Network deployment needs user authentication and deployment-specific access control.

## Validation

Backend regression tests cover live endpoint resolution with the installed CCXT version, reservations, feed identity, fees, stale quotes, partial fills, idempotency, unknown acceptance, persistent blocking, recovery, and API request validation. Frontend tests cover streaming balance updates, expiry, explicit order confirmation, and reuse of request IDs after connection failures. Tests use isolated broker fixtures and place no orders.
