# Security policy

Shaggy-Dogg-Dex runs live contracts on Base mainnet (chain 8453). If you believe you have found a
vulnerability, please report it privately first.

## How to report

**Contact:** rickthegenius@outlook.com (or via [GitHub Private Vulnerability Reporting](https://github.com/rickrichi/shaggy-dogg-dex/security/advisories/new))

Please include:
- the affected contract address or file and commit,
- a description and, ideally, a Foundry test or transaction that reproduces it,
- the impact you believe it has (funds at risk, who can trigger it, any preconditions).

Do not open a public issue or post details before the maintainers have had a chance to respond.
Do not test against other users' funds. Use a fork (`forge test` with a Base fork) or your own accounts.

## In scope

The contracts listed in `audit/SCOPE.md` and `deployments/mrwd-base-mainnet.json`:
- **Mutt Rewards ($MRWD) suite:** `MuttRewards` (`0xC17227AAa33C54634B6cE7AD0bf33A156563c179`), `MuttIncentiveScheduler` (`0xCAbf284806b800d9A771B55857B9fCF735ea7109`), `MuttVesting` (`0x7bC37041E1205841a83413625650EC12DA119697`, `0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1`), and `MuttProStaking` (`0x67dBC193bF510225EBf189ab25dC3b34a32c1766`).
- **Launchpad, Staking & Vault suite:** `FixedSupplyToken`, `LaunchpadSuiteDeployer`, `LaunchpadFees` (`0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b`), `FeeDiscountStaking` (`0x8a765d450d38d13f5e2533d29399f743cdf23faa`), `YieldStakingVault` (`0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5`), and `CompoundYieldVault`.
- **Liquidity, Paymaster & Arbitrage:** `V3PositionTimelock` (`0xb5c9bedb57f4e348e40a5e6326c90de474072e25`), `SponsoredRewardPaymaster` (`0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`), `AtomicFlashArbitrageRouter` (`0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd`), and `SD` (`0x051c758521971f5c5a84edaf18eea12854375469`).

Out of scope: Uniswap, Aave, Compound, Aerodrome, PancakeSwap, SushiSwap, BaseSwap, and other third-party code; issues that require a compromised admin or operator key (already documented in `audit/KNOWN-ISSUES.md`); social engineering; denial of service against public RPC endpoints.

## What to expect

This is an independent project run by an individual maintainer. Reports are handled on a best-effort basis; there is no
guaranteed response time and **no bug-bounty program** at present. If one is introduced it will be announced
in this file. Responsible reports will be credited if you wish.

## Known limitations

Several design trade-offs and administrative boundaries are already documented, including admin powers over future staking locks (capped at 365 days) and unstake fees (capped at 50%) in `FeeDiscountStaking`, the router's operator trust model, and current browser-wallet EIP-7702 limitations for `SponsoredRewardPaymaster`. See `audit/KNOWN-ISSUES.md` and `audit/ROUTER-REVIEW.md` before reporting those.

## For maintainers

- Keep private keys and API keys out of the repository (`.env*` files are git-ignored).
- After any change to a contract that holds user funds, update the tests, `audit/` documents and deployment manifests, and verify the deployed source on Sourcify / Blockscout.
