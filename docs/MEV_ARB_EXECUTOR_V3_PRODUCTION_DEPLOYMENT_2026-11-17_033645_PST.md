# MEV ArbExecutorV3 Production Deployment

**Recorded:** 2026-11-17 03:36:45 PST (UTC-08:00)
**Production page:** https://dex.lumsian.com/mev
**Backend repository:** `aave-mev`
**Production host:** Google Compute Engine instance `market-data`, zone `us-central1-a`

## Outcome

The hardened `ArbExecutorV3` was committed, pushed, deployed, independently verified on Ethereum and Base, and activated in the production arbitrage service.

Both networks are live using the V3 executor. The Ethereum MEV-Share stream is connected, and the backrunner recognizes the executor's profit-funded WETH builder-bid interface.

## Production Contracts

The deployment produced the same executor address on both networks because the same deployment account and CREATE nonce were used. This is expected deterministic CREATE behavior across chains.

| Network | ArbExecutorV3 address | Deployment transaction |
| --- | --- | --- |
| Ethereum Mainnet | `0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413` | `0x9a77bc018e530c1a031c3d0afbaaffa6c11967e1afdffc19ff06a32bc49b04cb` |
| Base Mainnet | `0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413` | `0x7b7ab2394a3b92f7a1481c2f7b4024b4e8e8f80c66e74bbb8b6c2883f3c04489` |

Administrative configuration:

```text
Owner:       0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98
Operator:    0x804E445427A0B867278a838C2d81a93A3A3200Be
Beneficiary: 0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98
```

No private keys, authentication keys, or API credentials are included in this record.

## V3 Security Improvements

`ArbExecutorV3` preserves the V2 execution engine while hardening its administrative surface:

- Rejects zero owner, operator, beneficiary, Pool Manager, WETH, and quote-token addresses.
- Rejects zero-address assignments through administrative setters.
- Replaces immediate ownership changes with a two-step process:
  1. The current owner calls `transferOwnership(nextOwner)`.
  2. Only `pendingOwner` can call `acceptOwnership()`.
- Allows the current owner to cancel an unaccepted ownership transfer.
- Emits events for:
  - Operator changes
  - Beneficiary changes
  - Maximum-bribe changes
  - Quote-token permission changes
  - Ownership transfer initiation
  - Ownership transfer cancellation
  - Ownership transfer completion
- Retains operator-only execution, quote allowlisting, builder-bribe caps, on-chain minimum-profit enforcement, atomic beneficiary settlement, rescue functions, and V2/V3/V4 routing support.

The existing V2 production contracts were not modified or removed and remain available as rollback targets.

## Commits

The following commits were pushed to `origin/master`:

- `74c2519` — Harden arbitrage executor administration
- `648f317` — Add V3 deployment verification

The deployment tooling now explicitly uses the V3 artifact. A reusable verifier checks runtime bytecode and every critical constructor or administrative field before a production switch.

## Testing and Build Verification

Completed verification included:

- Solidity compilation with version 0.8.28 and production optimizer settings.
- V3 deployed runtime size: 12,969 bytes, below the EVM contract-size limit.
- Complete Foundry suite: 25 of 25 tests passed.
- Relevant backend suite: 54 of 54 tests passed before deployment.
- Final targeted backend suite: 38 of 38 tests passed.
- TypeScript type checking passed.
- `git diff --check` passed.

The Solidity tests covered:

- Constructor zero-address rejection
- Administrative setter zero-address rejection
- Two-step ownership acceptance
- Ownership-transfer cancellation
- Unauthorized administration attempts
- Authorized configuration changes
- Atomic WETH profit settlement
- Builder payment from realized profit
- Beneficiary payment
- Flash-principal repayment
- Existing liquidation and arbitrage regression tests

## Independent On-Chain Verification

Both deployed contracts passed all verification checks before production configuration was changed.

Ethereum checks:

- Runtime bytecode present: 12,969 bytes
- Owner correct
- Operator correct
- Beneficiary correct
- Pending owner cleared
- Maximum bribe: `50000000000000000` wei
- Pool Manager: `0x000000000004444c5dc75cB358380D2e3dE08A90`
- WETH: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
- USDC, USDT, DAI, and WETH quote permissions enabled

Base checks:

- Runtime bytecode present: 12,969 bytes
- Owner correct
- Operator correct
- Beneficiary correct
- Pending owner cleared
- Maximum bribe: `0` wei
- Pool Manager: `0x498581fF718922c3f8e6A244956aF099B2652b2b`
- WETH: `0x4200000000000000000000000000000000000006`
- USDC and WETH quote permissions enabled

## Production Activation

The following variables were changed to the verified V3 address:

```dotenv
ARB_EXECUTOR_ETHEREUM=0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413
ARB_EXECUTOR_BASE=0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413
```

The production bundle built from commit `648f317` was uploaded and installed. Docker containers were rebuilt and recreated so the new executor addresses and code bundle were loaded.

Final logs confirmed:

```text
base: LIVE
ethereum: LIVE
backrunner: LIVE
MEV-Share stream connected
backrunner: executor 0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413 pays WETH bids from profit (V2/V3)
```

The public production summary endpoint was checked after activation and reported live Base, live Ethereum, an active backrunner session, and current block processing.

## Rollback Resources

The migration preserved both configuration and code rollback points:

```text
/etc/uni-arb.env.before-v3-20261117
/tmp/aave-mev-before-648f317.tar.gz
```

The prior V2 contracts also remain deployed. A rollback would restore the previous environment file, restore the previous code bundle if necessary, and recreate the containers.

## Current Operational State

The V3 migration is complete. Profitable landed executions continue to settle atomically to the configured beneficiary. Messages such as `profit does not cover gas` remain expected safety rejections and do not indicate a deployment problem.

The next strategy improvement should still be selected from accumulated accepted-bundle miss-audit evidence rather than by lowering profitability safeguards.
