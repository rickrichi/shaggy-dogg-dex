# MRWD search identity and token-listing correction

**Date:** 2026-11-01  
**Status:** Canonical page deployed; Google Search Console and third-party profile submissions pending  
**Production site:** <https://dex.lumsian.com>  
**Canonical token page:** <https://dex.lumsian.com/mrwd>

## Summary

A Google search for "MRWD Token Mutt Reward" produced a generated description that incorrectly
classified MRWD as a meme token and associated it with the unrelated address
`0x59d3571fA20f3665C5e80b12BDcE4A3C79d1Da8e`.

The repository and Base mainnet deployment records establish a different identity:

| Field | Canonical value |
| --- | --- |
| Name | Mutt Rewards |
| Symbol | MRWD |
| Classification | Utility and liquidity-incentive token |
| Network | Base |
| Chain ID | 8453 |
| Contract | `0xC17227AAa33C54634B6cE7AD0bf33A156563c179` |
| Supply | 1,000,000,000,000 MRWD, minted once |
| Launch date | 2026-10-25 |
| Official page | <https://dex.lumsian.com/mrwd> |

Tokens with similar names or the same symbol on other networks are unrelated. Public profiles and
submissions must never use the incorrect `0x59d3571fA20f3665C5e80b12BDcE4A3C79d1Da8e` address.

## Why MRWD is a utility token

MRWD has four documented ecosystem functions:

1. **Liquidity-provider rewards.** Eligible liquidity providers in the canonical MRWD/WETH
   Uniswap V3 incentive earn MRWD.
2. **Equilnyxs Pro access.** Users can lock MRWD in `MuttProStaking` to qualify for Equilnyxs Pro.
3. **Sponsored-operation rewards.** Eligible successful operations sponsored by the ecosystem
   paymaster can reward the user in MRWD.
4. **Optional launchpad quote asset.** MRWD is designed to serve as a quote asset for ecosystem
   token launches and routed trades.

Community-oriented branding does not replace these functional roles or change the token's
classification.

## Repository changes

Commit [`5d9e2ac`](https://github.com/rickrichi/shaggy-dogg-dex/commit/5d9e2ac) added the following:

- `public/mrwd.html`
  - Static, crawlable canonical page that does not require React or wallet JavaScript.
  - Correct name, symbol, network, contract address, supply, and utility descriptions.
  - Self-referencing canonical URL.
  - Search description and indexing directives.
  - Open Graph and Twitter metadata.
  - JSON-LD containing `WebPage`, `WebSite`, and MRWD entity data.
  - BaseScan and Sourcify identity links.
- `public/sitemap.xml`
  - Added `https://dex.lumsian.com/mrwd`.
  - Added `lastmod`, change frequency, and priority values.
- `vercel.json`
  - Added a rewrite from `/mrwd` to the static `/mrwd.html` asset.

`npm run build` completed successfully before deployment. `vercel.json` parsed successfully and
`git diff --check` reported no whitespace errors.

## Production deployment

The change was pushed to `origin/main` and deployed to the production Vercel project.

| Field | Value |
| --- | --- |
| Git commit | `5d9e2ac` |
| Vercel deployment | `dpl_8Fkdv3pkmg14ie73uYtWHQ7f7sea` |
| Production alias | <https://dex.lumsian.com> |
| Token page | <https://dex.lumsian.com/mrwd> |
| Sitemap | <https://dex.lumsian.com/sitemap.xml> |

Post-deployment checks confirmed:

- `/mrwd` returns HTTP 200 and `Content-Type: text/html; charset=utf-8`.
- The response contains the MRWD title, correct contract, canonical link, utility description, and
  JSON-LD directly in the HTML.
- `/sitemap.xml` returns the updated sitemap containing `/mrwd`.

### Sitemap browser message

Browsers may display this message above the sitemap:

> This XML file does not appear to have any style information associated with it.

This is normal. A sitemap is machine-readable XML and does not require an XSL stylesheet. Search
engines consume the XML structure directly; the message is not a validation or indexing error.

## Google Search Console procedure

These authenticated actions remain pending:

1. Sign in to the Google account that owns the `dex.lumsian.com` Search Console property.
2. Open URL Inspection and enter `https://dex.lumsian.com/mrwd`.
3. Run **Test live URL**.
4. Confirm that the page is fetchable and indexing is allowed.
5. Select **Request indexing**.
6. Open **Sitemaps** and submit or resubmit `https://dex.lumsian.com/sitemap.xml`.
7. Monitor Google's selected canonical URL and indexing status.

Submission is a discovery request, not a guarantee of indexing or an immediate change to generated
search summaries. Recheck the search result after Google recrawls the page.

## Third-party token-profile corrections

Review and correct profiles on:

- BaseScan
- Birdeye
- DexScreener
- GeckoTerminal and CoinGecko
- CoinMarketCap
- Wallet and token-list registries that surface Base assets

Every submission must use the same identity block:

```text
Name: Mutt Rewards
Symbol: MRWD
Network: Base
Chain ID: 8453
Contract: 0xC17227AAa33C54634B6cE7AD0bf33A156563c179
Category: Utility / liquidity-incentive token
Official website: https://dex.lumsian.com/mrwd
```

Recommended short description:

> Mutt Rewards (MRWD) is a utility and liquidity-incentive token on Base. It rewards liquidity
> providers, enables staking-based access to Equilnyxs Pro, and supports sponsored-operation rewards
> in the Shaggy Mutt DEX ecosystem.

Do not claim that a profile has been corrected until the provider confirms or publishes the change.
Some providers require account authentication, contract ownership verification, social-account
verification, or manual review.

## Verification sources

- Deployment record: `deployments/mrwd-base-mainnet.json`
- Token contract: `contracts/src/MuttRewards.sol`
- Launch record: `docs/MRWD_LAUNCH_SESSION_RECORD_2026-10-26.md`
- White paper: `docs/WHITEPAPER-v2.0-DRAFT.md`
- Pro staking implementation: `contracts/src/MuttProStaking.sol`
- Paymaster behavior: `docs/PAYMASTER.md`

## Remaining checklist

- [x] Add canonical static MRWD page.
- [x] Add structured entity and social metadata.
- [x] Add `/mrwd` to the sitemap.
- [x] Add the Vercel rewrite.
- [x] Build, commit, and push the changes.
- [x] Deploy and verify the public token page and sitemap.
- [ ] Request indexing in Google Search Console.
- [ ] Resubmit the sitemap in Google Search Console.
- [ ] Submit or correct the BaseScan token profile.
- [ ] Submit or correct the Birdeye token profile.
- [ ] Submit or correct the DexScreener token profile.
- [ ] Submit or correct the GeckoTerminal/CoinGecko profile.
- [ ] Submit or correct the CoinMarketCap profile.
- [ ] Correct applicable Base wallet and token-list profiles.
- [ ] Verify the published changes on every provider.
- [ ] Recheck Google results after recrawling.
