# Requested market catalog

The supplied expansion contains 359 distinct explicit pairs. Together with the
existing matrix and five USD pairs, the catalog contains 376 unique pairs. It does
not generate extra combinations to claim 1,000 listed markets.

`src/config/market-pairs.json` is the shared catalog. Original matrix thresholds
are preserved; new pairs use a 0.40% screening hurdle. This is a screening setting,
not a profit guarantee or permission to trade.

Regenerate the catalog and public configuration fragment:

```powershell
python scripts/expand-market-catalog.py
python scripts/sync-market-pairs.py
python scripts/sync-market-pairs.py --apply
```

The last command merges pair lists into the sibling services' `.env` files:

| Service | Setting | App page |
| --- | --- | --- |
| cryptostream | CS_STREAM_SYMBOLS | /markets |
| shaggy-dogg-market-data | MD_PAIRS | /market-data |
| crypto-arb/backend | ARB_SYMBOLS | /arbitrage/matrix and /arbitrage/cedefi |

Credentials and other settings are preserved. Services read configuration at
startup, so running services need a restart to load the expanded lists. The
script does not restart processes or submit trades. `config/market-pairs.env`
also provides the lists for manual configuration.

Coinbase's existing resolver may show the same asset versus USD when the exact
pair is absent; `/markets` labels the actual streamed product. The CCXT services
check exact exchange listings. Unsupported and legacy symbols remain requested
but must not be treated as live. RNDR and RENDER are kept distinct, as supplied.
Alpaca's separate subscription allowlist is preserved; the full list is not sent
blindly to the broker. Blank Alpaca credentials leave its stream disabled.

CeDeFi book prices, budgets and P&L use the pair's actual quote currency. The
USD execution desk and the auto-pilot's USD profit target stay restricted to USD
pairs. Cross-currency pairs remain available for book inspection and comparison.
Base's WETH/USDC reference is shown only for ETH/USDC.

## Shaggy-Dogg-Dex comparison column

The matrix now includes Shaggy-Dogg-Dex alongside the CEX venues. Its column
quotes the app's existing Base Uniswap V2 route with Multicall3 every 15 seconds.
The underlying venue is labeled explicitly; this does not claim independent
Shaggy-owned liquidity. Only tokens in `BASE_MAINNET_TOKENS` are mapped. ETH is
explicitly quoted as WETH; BTC, fiat and other missing tokens are not substituted.

DEX quotes sell one base token, include pool fees, exclude gas, and expire after
30 seconds. CEX columns show exact-symbol top-of-book bid/ask prices from the
existing backend snapshot; books older than five seconds display as stale.
The two quote sizes and fee treatments differ, so these are reference comparisons,
not executable arbitrage spreads. Kraken capital remains labeled separately from
wallet capital. The Base-mappings filter lists mapped pairs even if a route fails.
