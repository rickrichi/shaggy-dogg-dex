# Kraken–Base hedge executor

`scripts/kraken_base_hedge.py` implements a bounded, receipt-triggered hedge.
It waits for an explicitly identified Base swap to finalize, derives its actual
WETH received from canonical token transfer logs, and sells the matched ETH
quantity from prefunded Kraken inventory using one IOC limit order.

Supported first leg: canonical Base Uniswap V2 `swapExactTokensForTokens`, direct
USDC → WETH, sent by and paid to the specified wallet. It does not submit that
first leg, withdraw exchange assets, bridge funds, or assume USD equals USDC.
Aerodrome, reverse direction and continuous autonomous opportunity dispatch
are outside this version. Finality waiting adds latency and prices can move.

## Review without orders

Use the Python environment already installed with crypto-arb (contains ccxt and
python-dotenv). Put Kraken credentials in a server-only environment file.
The installer also bundles this command: run `resources/backend/shaggy-arb/shaggy-arb.exe
--hedge` with the same arguments instead of Python. Preview is still the default.
The key needs balance, order history and trading permissions for live operation;
this executor never calls withdrawal APIs. Use a dedicated key/account to avoid
nonce races and other strategies consuming the same reserved inventory.

```powershell
../crypto-arb/backend/.venv/Scripts/python.exe scripts/kraken_base_hedge.py --tx <BASE_SWAP_HASH> --wallet <YOUR_WALLET> --max-usdc <ACTUAL_BUDGET> --min-price <MINIMUM_USDC_PER_ETH> --env <SERVER_ENV_FILE> --watch
```

Preview checks the chain, successful finalized receipt, canonical block hash,
router, sender, recipient, path, actual transfers, budget, available Kraken ETH,
account fee, pair minimums/precision and executable bid depth. Preview does not
place an order. Minimum price must align exactly with the exchange tick size.
The CLI prints anticipated proceeds before Base gas, not a guaranteed profit.

## Execution and recovery

After approval of the specific trade and limits, set `HEDGE_LIVE_ENABLED=true`
in the server environment and add `--execute` to the same reviewed command.
The executor then places the hedge automatically when that swap has finalized
and current checks pass. It does not automatically choose or create a Base trade.
Leave the flag unset during development. No live execution was enabled or tested
with funds during implementation.

SQLite records a stable client order ID before the irreversible API request.
Duplicate transaction hashes and any earlier unresolved hedge block new orders.
Only one dedicated executor/account should use this journal. Keep its file;
deleting it removes duplicate protection. SQLite uses WAL and FULL synchronous
writes. No private key is needed because the executor never signs Base trades.

If a request times out or the process stops, rerun with `--reconcile` (without
`--execute`). It looks up the existing order by broker ID or client order ID and
records actual fills, fees and remaining exposure. Missing history does not
authorize a retry. An IOC partial fill remains visible and blocks new execution;
it needs a separately reviewed recovery trade. There is no unbounded retry or
automatic market order to clear exposure. Order-size rounding dust is reported.

Cross-venue settlement is not atomic. A failed/partial Kraken hedge leaves
inventory exposure even though the Base swap succeeded.
