# Audit scope — Shaggy-Dogg-Dex (Base mainnet, chain 8453)

Frozen at the git tag `audit-candidate-1`. Source-to-chain correspondence:
- Router: current source compiled with 0.8.28 matches the on-chain runtime code (only immutables and the metadata hash may differ).
- v2 vault (`0xC29c…`): matches commit `2b20a00`, i.e. **before** the share-price fix; the sources in this tag differ from the deployed v2 by that fix.
- Tokens, staking contracts and flash borrowers: the source files are unchanged since the deployment commit `3402261`;
  that commit's source (pragma relaxed, solc 0.8.36) matches the on-chain runtime code.
- Legacy vaults (v1 `0x16a1…`, `0x8531…`, Compound `0x38cc…`): the deployed code is the OLD version from `3402261`
  (wrong discount scale). The sources in this tag contain the corrected version and are not what those addresses run.
Every address below is source-verified on Blockscout. Machine-readable facts:
`deployments/base-mainnet.manifest.json` (regenerate with `scripts/inventory-deployments.ts`).

Build settings: solc 0.8.28 (`contracts/foundry.toml`), optimizer 200 runs, EVM `prague`, no via-IR.
Exception: the contracts deployed on 29-30 September (both tokens, both staking contracts, the v1 and Compound vaults, the flash borrowers) were compiled with solc 0.8.36 and a relaxed pragma (`>=0.8.20 <0.8.37`). Their logic matches the sources in this tag; verification on Blockscout used the 0.8.36 build. The v2 vault and the router were built with 0.8.28 from this tag's pragma `0.8.28`. The router verified as a partial (metadata-hash) match.

## Recommended in scope (hold or can hold user funds)

| Contract | Address | Why |
| --- | --- | --- |
| GovernanceToken (AMUTT) | `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7` | Token that users stake |
| FeeDiscountStaking | `0x055BB4eD8d5464C25D71391E940ce53CA30845fC` | Holds staked AMUTT; admin-controlled lock and fee |
| YieldStakingVault v2 | `0xC29c4b5aF82F6c1469bc47Cfa167386f93514981` | Holds USDC deposits supplied to Aave V3; corrected discount scale; lacks the later share-price fix (a v3 with the fix is the intended audit target) |
| AtomicFlashArbitrageRouter | `0x70315019D12A11556C837970675cDC8Fa54d186b` | Executes Aave flash-loan arbitrage; called by an operator hot key |

Source: `contracts/src/{GovernanceToken,FeeDiscountStaking,FeeDiscountMath,YieldStakingVault,AtomicFlashArbitrageRouter,Interfaces}.sol`.

## Deployed but lower priority / optional

| Contract | Address | Note |
| --- | --- | --- |
| GovernanceToken (SD) | `0x051c758521971f5c5a84eDaF18EEA12854375469` | Same code as AMUTT token |
| FeeDiscountStaking (SD) | `0x42134CcC6c41149cF71C7b4994E33Ee66758aF20` | Same code as above |
| YieldStakingVault v1 | `0x16a1E9c10B913912b7B7df4649D9596D95ce33E6`, `0x8531807Ef36560CD7Db230c95DB85791aA586Dda` | Legacy discount scale; zero assets; superseded |
| CompoundYieldVault | `0x38cccAFb4ae96A8ef187F07fB17D18eb63E43782` | Legacy scale; zero assets; unused by the app; same vault pattern; 13% test coverage |
| AaveFlashBorrower | `0xA5b50037A8D2Fda22805F750252268AdAEB36480`, `0x936a3D52c3037848879F3641dfBc9132aAe51bDF` | 27% test coverage |

## Out of scope

- `IsolatedLendingVault.sol`: not deployed, 0% coverage. Do not deploy before it is tested and reviewed.
- Uniswap V2 pairs (`0xC3D1…0917`, `0x581B…6784`), the V2 factory and router: standard Uniswap V2 bytecode
  (pinned and compared by hash in `src/lib/amm/own-dex.ts`; licences in `contracts/vendor/`). Third-party code.
- Aave V3, Compound, Aerodrome, Uniswap routers: external dependencies.
- Off-chain components: `scripts/arbitrage-bot-daemon.ts`, `scripts/kraken_base_hedge.py`, `server/`,
  the frontend. A separate application-security review is advisable (the daemon holds a hot operator key).

## Trust assumptions to confirm or challenge

1. One externally owned account, `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`, is the admin of every contract above
   and the treasury of the vault. There is no multisig and no timelock (owner's decision).
2. The router's operators are set by the admin; the daemon uses an operator hot key.
3. Aave V3 Base pool `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` and aUSDC `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` are honest.
4. The staked token (AMUTT) is a plain 18-decimal ERC-20 without fees or rebasing.

## Current test and analysis baseline

- Foundry: 76 tests pass (`forge test` in `contracts/`), including Base-fork tests, fuzzing and tests that reproduce known issues.
- Line coverage: GovernanceToken 100%, FeeDiscountStaking 100%, AaveFlashBorrower 95%, AtomicFlashArbitrageRouter 93%,
  YieldStakingVault 91%, CompoundYieldVault 90%. `IsolatedLendingVault` and `DeployEcosystem` are 0% (out of scope / deploy helper).
- Slither: 41 results, every one triaged individually in `SLITHER-TRIAGE.md`.
- Router line-by-line self-review: `ROUTER-REVIEW.md`.
- Vault share-price fix (virtual shares) is in the sources of this tag but **no deployed vault contains it yet**:
  the live v2 vault `0xC29c…` and the legacy vaults still have the first-depositor weakness. A v3 deployment is pending.

## Questions to put to the auditors

- Is the virtual-share mitigation for the first-depositor issue (offset 1e6) sufficient, and is the 6-decimal share offset acceptable for USDC?
- Should staking lock and withdrawal-fee changes be bounded or delayed (KI-S1, KI-S2)?
- Router: re-check callback authentication, profit guard, approvals, and the rescue and withdraw paths.
