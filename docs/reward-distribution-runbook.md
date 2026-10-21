# AMUTT weekly USDC rewards — operator runbook

**Status:** implemented and tested; **not deployed, not funded, not enabled.**
`PROTOCOL_ECONOMICS.enabled` stays `false` until the activation checklist below is complete.

## Components

| Piece | Location | Role |
| --- | --- | --- |
| Distributor | `contracts/src/WeeklyUsdcDistributor.sol` | Holds funded weekly allocations; pays Merkle-proven claims once per account per epoch |
| Contract tests | `contracts/test/WeeklyUsdcDistributor.t.sol` | Funding, sequencing, claims, double-claim, proof binding, ownership |
| Accounting | `scripts/lib/epoch-rewards.ts` | Integer USDC accounting, 10%/90% split, time-weighted stake, loss and dust carryforward |
| Staking history | `scripts/lib/staking-history.ts` | Finalized `Staked`/`Unstaked` logs; replayed balances must equal `stakedBalance()` |
| Claim tree | `scripts/lib/reward-merkle.ts` | Manifest and proofs using the same leaf rules as the app and contract |
| Epoch CLI | `npm run rewards:epoch` | Writes `ledger.json`, `manifest.json`, unsigned `publish.json` |
| Promote CLI | `npm run rewards:promote` | After the publish transaction is final, copies files into `public/rewards/` |
| Local end-to-end | `npm run rewards:e2e` | Full flow on Anvil: deploy, stake, calculate, publish, claim |
| App | `src/components/RewardClaimsPanel.tsx` | Shows each wallet's allocation, claim state and receipt |

## Trust model (state this publicly)

- The owner attests to the off-chain profit ledger. The contract enforces funding, sequencing and
  one claim per account; it cannot verify that profit was real. `ledgerHash` lets anyone check that
  the published ledger is the one the owner committed to.
- Each epoch is funded in full when published. No clawback, expiry, upgrade or owner withdrawal
  exists, so unclaimed USDC stays claimable indefinitely and cannot be recovered by the owner.
- USDC sent to the distributor outside `publishEpoch` is not recoverable.
- Project-controlled wallets listed under `excludedAccounts` in `config/reward-deployment.json` may
  stake, but receive no allocation; the rest of the staker pool is shared among outside stakers.
  Each ledger lists the exclusions and the stake weight they would otherwise have had. The AMUTT
  project wallet `0x88315fb3A3dC6ce4c997caeCdc74637C72857d28` (500,000 AMUTT on 2026-10-21) and the
  owner/administrator wallet `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` are excluded;
  `scripts/lib/reward-config.test.ts` fails if the configured owner is ever not excluded. Add any
  further team, treasury or market-making wallets before they stake.
- Ownership transfer is two-step. Use a multisig as owner before funding real allocations.

## 1. Deploy (owner's wallet signs; no keys in files)

Choose:
- **Owner**: `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (ShaggyDogg), recorded as `owner` in
  `config/reward-deployment.json`; the epoch CLI refuses to run if the deployed contract's owner
  differs. This single-key wallet also holds every AMUTT token and staking admin role, so its key
  alone controls publication. It must hold the USDC for each week it funds.
- **Epoch origin**: `1795996800` = Monday 30 November 2026, 00:00 UTC (chosen 2026-10-21), recorded
  as `epochOrigin` in `config/reward-deployment.json`. Week 1 ends Monday 7 December 2026.
  Week *N* covers `[origin + (N−1)·7d, origin + N·7d)` and can be published only after it ends.
  Deploy the mainnet distributor before the origin (target 18–20 November) and announce week 1 about
  a week ahead so outside stakers can join. The origin is immutable once deployed; if the review or
  rehearsal slips, move it to a later Monday here before deploying.

```sh
forge build --root contracts
forge test --root contracts --match-contract WeeklyUsdcDistributorTest
forge create --root contracts src/WeeklyUsdcDistributor.sol:WeeklyUsdcDistributor \
  --rpc-url <RPC> --ledger --broadcast \
  --constructor-args <USDC> <OWNER> <ORIGIN>
```

Use `--ledger`, `--trezor` or `--interactive` so the key stays in the wallet. USDC on Base mainnet is
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. For Base Sepolia, use Circle's testnet USDC
(`0x036CbD53842c5426634e7929541eC2318f3dCF7e`; confirm against Circle's documentation first).

Then set `distributor`, `deploymentBlock` and `epochOrigin` in `config/reward-deployment.json`
(or in a separate config file for the testnet run) and verify the source on BaseScan.

> On this Windows machine, `forge` runs through WSL, which cannot see drive `D:`. Run Foundry
> from a checkout on `C:` or from CI.

## 2. Test-network rehearsal (required before mainnet)

1. `anvil --chain-id 84532`, then `npm run rewards:e2e -- --artifacts contracts/out`. It must print
   "All local reward end-to-end checks passed."
2. On Base Sepolia, deploy a distributor and a FeeDiscountStaking + test token. Stake from two or
   three wallets at different times, then run several consecutive weeks through steps 3–5 below.
   Claim from the app and confirm amounts, receipts and "Claimed on-chain" status.

## 3. Prepare a week (after it ends and is finalized)

Trade records are a JSON array of settled executions. Amounts are decimal **strings** with up to six
decimals. Every trade must be `filled` with `hasVerifiedValuation: true`, or the epoch is blocked.
Use `[]` for a week with no trades; it must still be published, because epochs are sequential.

```json
[{ "txHash": "0x…", "venue": "Base Uniswap V2 → Aerodrome", "timestamp": 1793000000,
   "grossProceedsUsdc": "10100.50", "principalCapitalUsdc": "10000", "tradingFeesUsdc": "30",
   "flashLoanFeesUsdc": "5", "gasCostUsdc": "0.42", "status": "filled", "hasVerifiedValuation": true }]
```

```sh
npm run rewards:epoch -- --epoch 1 --trades records/epoch-1-trades.json --rpc <archive RPC with eth_getLogs>
```

Without `--rpc`, both CLIs read `REWARDS_RPC_URL` from the git-ignored `.env.local`. Use a server
key with no domain restriction (e.g. an Alchemy Base URL), separate from the site's browser key.

The CLI refuses to run if the distributor's token, origin, or next expected epoch differ from the
config; if the previous ledger does not hash to the on-chain `ledgerHash`; if the epoch end is not
yet finalized; or if replayed staking balances differ from `stakedBalance()`. The public
`mainnet.base.org` endpoint rate-limits `eth_getLogs`, so use a provider with archive and log access.

Review `reports/rewards/epoch-N/ledger.json` and reconcile it against exchange statements and
receipts **before** signing anything.

## 4. Publish (owner's wallet)

`publish.json` lists the transactions in order: a USDC `approve` for the exact allocation (omitted for
an empty week), then `publishEpoch`. Send them from the owner wallet, for example by pasting `to` and
`data` into the wallet or Safe transaction builder. `publishEpoch` pulls the USDC in the same
transaction, so the distributor is never underfunded.

## 5. Promote to the app

After the publish transaction is finalized:

```sh
npm run rewards:promote -- --epoch 1 --rpc <RPC>
```

This copies the ledger to `public/rewards/ledgers/` and, for funded weeks, the manifest to
`public/rewards/epochs/` and the index. Commit and deploy those files. The app independently checks
every proof, the totals, and the on-chain root, ledger hash and allocation before offering a claim.

## Activation checklist

- [ ] Independent review of `WeeklyUsdcDistributor.sol` and the accounting scripts
- [ ] Base Sepolia rehearsal over several consecutive weeks, including claims from the app
- [ ] Mainnet distributor deployed by the chosen owner (multisig), source verified, config updated
- [ ] First week reconciled from real, settled profit records; USDC available in the owner wallet
- [ ] Epoch published, finalized, promoted and deployed; a claim confirmed from the app
- [ ] Only then: set `enabled: true` and `status: "finalized"` in `config/protocol-economics.json`
      and `src/config/protocol-economics.ts`, and update `docs/WHITEPAPER.md` §8.2 (regenerate with
      `node scripts/build-whitepaper.mjs`)
