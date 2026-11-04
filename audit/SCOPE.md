# Audit scope — Shaggy-Dogg-Dex (Base mainnet, chain 8453)

Current live contract suite on Base mainnet (`8453`). Machine-readable deployment records:
- `deployments/mrwd-base-mainnet.json` (Mutt Rewards `$MRWD` ecosystem)
- `deployments/base-mainnet.json` and `deployments/base-mainnet.manifest.json` (SD, Vault, Router, and Timelock inventory)
- `src/lib/launchpad/contract-versions.json` (approved runtime bytecode hashes for launchpad contracts)

Build settings: `contracts/foundry.toml`, optimizer 200 runs, EVM `prague`. All MRWD suite contracts (`MuttRewards`, `MuttIncentiveScheduler`, treasury and team `MuttVesting`, and `MuttProStaking`) are verified on Sourcify as `exact_match`.

## In scope (live Base mainnet contracts and launchpad templates)

| Contract | Address / Source | Role |
| --- | --- | --- |
| `MuttRewards` (`MRWD`) | `0xC17227AAa33C54634B6cE7AD0bf33A156563c179` | 1T fixed-supply ERC-20 + EIP-2612 Permit; ownerless; Sourcify `exact_match` |
| `MuttIncentiveScheduler` | `0xCAbf284806b800d9A771B55857B9fCF735ea7109` | Ownerless 16-quarter LP incentive scheduler holding the 600B MRWD reward reserve |
| `MuttVesting` (Treasury / Team) | `0x7bC37041E1205841a83413625650EC12DA119697`, `0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1` | 150B / 50B MRWD; 12-month cliff to 25 Oct 2027, 36-month linear release to 24 Oct 2030 |
| `MuttProStaking` | `0x67dBC193bF510225EBf189ab25dC3b34a32c1766` | Ownerless 30-day deposit lock (1B MRWD unlocks Equilnyxs Pro) |
| `V3PositionTimelock` | `0xb5c9bedb57f4e348e40a5e6326c90de474072e25` | Sovereign Uniswap V3 NFT locker (holds MRWD launch position `#6351512` until 24 Oct 2028) |
| `SponsoredRewardPaymaster` | `0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4` | ERC-4337 EntryPoint v0.7 paymaster paying 100 MRWD per eligible sponsored op |
| `LaunchpadFees` | `0x2443C90eB4eA63b74383a5f0dB36c95A1091b68b` | On-chain USDC launch fee collector (live `feeAmount()`: 10 USDC) |
| `FixedSupplyToken` & `LaunchpadSuiteDeployer` | `contracts/src/{FixedSupplyToken,LaunchpadSuiteDeployer}.sol` | Self-transfer-guarded ERC-20 template and atomic suite deployer |
| `FeeDiscountStaking` (SD & Launchpad) | `0x8a765d450d38d13f5e2533d29399f743cdf23faa` | Capped 365-day lock, per-stake unlock snapshot, isolated `accruedFees` withdrawal, and 10%/25%/50%/75% discount tiers |
| `YieldStakingVault` v3 & `CompoundYieldVault` | `0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5` & `contracts/src/CompoundYieldVault.sol` | Aave v3 and Compound v3 USDC vaults with `1e6` virtual shares, immutable market/staking links, fee-increase guard, pause, and vault-only recovery |
| `AtomicFlashArbitrageRouter` | `0xdF77eBFB6e0468aE4e94b13Fc9881427B82178Fd` | Pinned Aave V3 flash-loan arbitrage router |
| `GovernanceToken` (`SD`) | `0x051c758521971f5c5a84eDaF18EEA12854375469` | 1,000,000 fixed-supply SD ecosystem token |

## Out of scope

- Uniswap V2/V3, Aerodrome, PancakeSwap V2/V3, SushiSwap V2/V3, BaseSwap, Aave V3, Compound V3, and ERC-4337 EntryPoint v0.7: external third-party protocols.
- Superseded zero-asset v1/v2 vaults (`0x8531…6dda`, `0x38cc…3782`, `0x16a1…33e6`, `0xc29c…4981`) and legacy staking contracts (`0x4213…af20`, `0x055B…45fC`) refused by the app's bytecode loader (`src/lib/launchpad/contract-versions.json`).
- Off-chain components (`scripts/`, `server/`, frontend), which are covered by separate application tests.

## Trust assumptions to confirm or challenge

1. `MuttRewards`, `MuttIncentiveScheduler`, `MuttProStaking`, `V3PositionTimelock`, and `FixedSupplyToken` have no administrator override over user balances or schedules.
2. For admin-governed project contracts (`FeeDiscountStaking`, `YieldStakingVault`, `AtomicFlashArbitrageRouter`, `SponsoredRewardPaymaster`, `LaunchpadFees`), the single-key wallet `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` holds the administrator role. For user-launched suites, `LaunchpadSuiteDeployer` transfers all admin roles to the creator wallet.
3. Canonical Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), Aave V3 Pool (`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`), aUSDC (`0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB`), and Compound V3 USDC Comet (`0xb125E6687d4313864e53df431d5425969c15Eb2F`) behave according to their specifications.

## Questions for auditors

- Is the virtual-share mitigation (`VIRTUAL_SHARES = 1e6`, `VIRTUAL_ASSETS = 1`) in `YieldStakingVault` and `CompoundYieldVault` sufficient across all Aave v3 and Compound v3 rounding cases?
- Are all permissionless transition paths in `MuttIncentiveScheduler` (`createIncentive`, `skipMissedPeriod`, `finalize`, `burnLeftover`) free of griefing vectors that could trap period rewards?
- In `AtomicFlashArbitrageRouter` and `SponsoredRewardPaymaster`, verify callback authentication, profit/reserve accounting, and allowance handling.
