# Security policy

Shaggy-Dogg-Dex runs live contracts on Base mainnet (chain 8453). If you believe you have found a
vulnerability, please report it privately first.

## How to report

**Contact:** `OWNER TO FILL IN: a monitored email address or a GitHub private-vulnerability-reporting link`

Please include:
- the affected contract address or file and commit,
- a description and, ideally, a Foundry test or transaction that reproduces it,
- the impact you believe it has (funds at risk, who can trigger it, any preconditions).

Do not open a public issue or post details before the maintainers have had a chance to respond.
Do not test against other users' funds. Use a fork (`forge test` with a Base fork) or your own accounts.

## In scope

The contracts listed in `audit/SCOPE.md` (addresses and source are in `deployments/base-mainnet.manifest.json`):
the AMUTT token, the staking contract, the yield vaults, and the flash-arbitrage router.
Out of scope: Uniswap, Aave, Compound, Aerodrome and other third-party code; issues that need a compromised admin
or operator key (already documented in `audit/KNOWN-ISSUES.md`); social engineering; denial of service against
public RPC endpoints.

## What to expect

This is a small project run by an individual. Reports are handled on a best-effort basis; there is no
guaranteed response time and **no bug-bounty program** at present. If one is introduced it will be announced
in this file. Responsible reports will be credited if you wish.

## Known limitations

Several design limitations are already documented, including admin powers over the staking lock and fees, the
admin-settable lending pool address in the vaults, and the router's operator trust model. See
`audit/KNOWN-ISSUES.md` and `audit/ROUTER-REVIEW.md` before reporting those.

## For maintainers

- Keep private keys and API keys out of the repository (`.env*` files are git-ignored).
- After any change to a contract that holds user funds, update the tests, `audit/` documents and the manifest, and
  re-verify the deployed source on Blockscout.
