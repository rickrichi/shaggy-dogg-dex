# MRWD 56-Aggregator Audit Record

**Date:** October 29, 2026  
**Network:** Base mainnet (`8453`)  
**Pool:** `0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5`  
**Pair:** WETH/MRWD  
**Fee tier:** 0.30% (`3000`)  
**Audit project:** `D:\shaggy-dogg-dex\mrwd-56-aggregators`

## Purpose

This read-only audit evaluates whether external swap aggregators recognize or can
quote the WETH/MRWD pair on Base. It does not register the pool, execute swaps,
approve tokens, sign messages, or modify any LP NFT or staking position.

The registry contains 56 prospective platforms. Seven platforms currently have
implemented quote adapters: KyberSwap, Velora (ParaSwap), Uniswap Auto Router
(via canonical Base Uniswap V3 QuoterV2), LI.FI, Rubic, 0x, and Odos. The other
49 entries remain a research and integration queue rather than completed
registrations.

## Corrections made before execution

The extracted archive contained two implementation defects that were corrected:

1. The project used Ethereum's Uniswap V3 factory
   (`0x1F98431c8aD98523631AE4a59f267346ea31F984`). It was replaced with the
   canonical Uniswap V3 factory on Base:
   `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`.
2. The `base` chain definition was imported from `viem`; it was corrected to
   import from `viem/chains`.
3. RPC fallback was added across the configured endpoint, PublicNode, 1RPC, and
   the public Base endpoint to reduce failures from provider blocking or rate
   limiting.

Reference: [Uniswap SDK deployment addresses](https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts).

## Validation

The project dependencies installed successfully with zero vulnerabilities
reported by npm. TypeScript validation completed successfully:

```powershell
cd D:\shaggy-dogg-dex\mrwd-56-aggregators
npm install
npm run check
```

The live audit was then executed with:

```powershell
npm run audit
```

No 0x API key was configured during this run.

## Verified pool state

The audit pinned its pool reads to Base block `53,240,962` and returned:

| Field | Result |
| --- | --- |
| Pool identity | Valid |
| Token 0 | WETH — `0x4200000000000000000000000000000000000006` |
| Token 1 | MRWD — `0xC17227AAa33C54634B6cE7AD0bf33A156563c179` |
| Fee tier | `3000` (0.30%) |
| Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` |
| Canonical Uniswap V3 pool | Yes |
| Active liquidity (raw) | `60071682439496678549024` |
| Current tick | `292604` |
| MRWD decimals | `18` |

## Aggregator results

| Provider | WETH → MRWD | MRWD → WETH | Exact Pool Match (`0xa7D4…bDB5`) | Notes |
| --- | --- | --- | --- | --- |
| KyberSwap | Quote returned | Quote returned | **Yes** | Route breakdown explicitly identifies Uniswap V3 pool `0xa7d4d975988daa77b46c5d637717e2dfe07fbdb5`. |
| Velora (ParaSwap) | Quote returned | Quote returned | **Yes** | `bestRoute` explicitly lists `poolAddresses: ["0xa7d4d975988daa77b46c5d637717e2dfe07fbdb5"]`. |
| Uniswap Auto Router | Quote returned | Quote returned | **Yes** | Direct on-chain quote via canonical Base Uniswap V3 `QuoterV2` (`0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`). |
| LI.FI | Quote returned | Quote returned | Unspecified | Quote confirms pair recognition and live routing. |
| Rubic | Quote returned | Quote returned | Unspecified | Meta-aggregator quote returned on Base (`providerType=LIFI`). |
| 0x | Requires API key | Requires API key | — | Set `ZEROX_API_KEY` and rerun to perform live checks. |
| Odos | HTTP 530 | HTTP 530 | — | The requests were rejected by the provider's Cloudflare edge during this run. |
| Remaining 49 targets | Manual review | Manual review | — | No verified adapter is implemented yet. |

Live raw indicative outputs from the 5 quoting providers:

| Provider | Direction | Input | Raw output |
| --- | --- | ---: | ---: |
| KyberSwap | WETH → MRWD | `0.001 WETH` | `4894885127515920033483063296` MRWD wei |
| KyberSwap | MRWD → WETH | `1 MRWD` | `195743` WETH wei |
| Velora (ParaSwap) | WETH → MRWD | `0.001 WETH` | `4894816052803850937341381500` MRWD wei |
| Velora (ParaSwap) | MRWD → WETH | `1 MRWD` | `195741` WETH wei |
| Uniswap Auto Router (QuoterV2) | WETH → MRWD | `0.001 WETH` | `4894816052803850937341381500` MRWD wei |
| Uniswap Auto Router (QuoterV2) | MRWD → WETH | `1 MRWD` | `195741` WETH wei |
| Rubic | WETH → MRWD | `0.001 WETH` | `4893872427725784306528813056` MRWD wei |
| Rubic | MRWD → WETH | `1 MRWD` | `195702` WETH wei |
| LI.FI | WETH → MRWD | `0.001 WETH` | `4883019759753508054127083520` MRWD wei |
| LI.FI | MRWD → WETH | `1 MRWD` | `195252` WETH wei |

The Odos failures were recorded as HTTP `530` responses containing a Cloudflare
error page. This does not prove that Odos lacks support for the pair; it means the
public API could not be evaluated successfully from the audit environment.

## Generated artifacts

The audit produced:

```text
D:\shaggy-dogg-dex\mrwd-56-aggregators\report.json
D:\shaggy-dogg-dex\mrwd-56-aggregators\report.csv
```

`report.json` contains the pool verification metadata and full per-provider
results. `report.csv` contains a flat representation suitable for spreadsheets
or subsequent analysis.

## Interpretation and limitations

- The pool is conclusively registered with the canonical Uniswap V3 factory on
  Base and currently has active liquidity.
- An indicative aggregator quote establishes that the token pair is recognized
  and routable at the tested amount. It does not establish that the route used
  this specific pool.
- Exact pool usage requires provider route details that identify the venue or an
  executed transaction whose logs show a swap against the pool address.
- The registry is not evidence of 56 registrations. It contains three automated
  adapters and 53 candidates requiring verified API integrations or manual
  provider review.
- Quote availability can vary with trade size, price movement, provider policy,
  API credentials, token screening, rate limits, and pool liquidity.
- LP NFT `6367926` was treated as metadata only and was not read, transferred,
  unstaked, or modified.

## Recommended next steps

1. Add a 0x API key to the audit's `.env` and rerun the audit.
2. Preserve and inspect route breakdowns from successful providers to determine
   whether Uniswap V3—and ideally this exact pool—was selected.
3. Investigate the Odos HTTP 530 response from another network or with any
   provider-recommended authentication and request headers.
4. Add adapters only where current public documentation and usage terms can be
   independently verified.
5. Compare quotes at multiple trade sizes and in both directions to measure
   practical routing competitiveness rather than simple token recognition.
