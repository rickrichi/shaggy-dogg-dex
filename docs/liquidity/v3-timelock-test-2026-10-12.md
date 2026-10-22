# V3 timelock signing, harvest, and withdrawal verification

Tested October 12, 2026 against the deployed locker at
`0xb5c9bedb57f4e348e40a5e6326c90de474072e25` and Uniswap V3 NFT #6245990.

## Scope

The transaction tests used an Anvil fork of Base block **52,528,062**, with local
chain ID **31337** and RPC bound to `127.0.0.1:18545`. The mainnet contracts and
position were used without replacement mocks. Only the fork's copy of the NFT
was transferred, by impersonation, to a generated disposable signing account.
Subsequent transactions were cryptographically signed, their recovered senders
checked, and their receipts inspected. No real wallet key was read, no transaction
was broadcast to Base, and the local state was restored after the test.

These tests do **not** exercise a MetaMask extension popup or a hardware wallet.
Dashboard tests render the actual React component with mocked wallet/RPC responses;
they are separate from the real transaction execution on the fork.

## Contract and signing results

**12 checks passed across 20 signed local transactions**, including expected reverts:

- Message signature verification and transaction sender recovery.
- Deposit without approval reverts and leaves no lock record.
- NFT approval followed by a 90-day deposit succeeds.
- Early withdrawal and non-owner harvest/withdrawal revert.
- Two real Uniswap swaps generate fees in SD and WETH.
- Harvest pays the full collected amounts directly to the recorded owner.
- NFT ownership remains with the locker and liquidity is unchanged during harvest.
- A second harvest pays zero, with no duplicate payment.
- Withdrawal one second before expiry reverts.
- A non-owner cannot withdraw at expiry.
- Owner withdrawal returns the NFT, preserves liquidity, and clears the record;
  repeated withdrawal fails.
- A second, 365-day lock withdraws at its exact unlock timestamp.

The positive harvest delivered **40.72309139518764234 SD** and
**0.000000083333333333 WETH** in the fork. Immediately before harvest, the
position's stored `tokensOwed0` and `tokensOwed1` were both zero. This reproduces
the dashboard's understated fee display: it does not include pending fee growth.

## Dashboard results

**10 passed, 5 failed** in `LpLockCard.test.tsx`.

Passed: successful receipt handling and wallet rejection handling for approval,
deposit, harvest, and withdrawal; disabled controls when disconnected; withdrawal
disabled during the active countdown.

Failed:

1. Approval reports success for a mined reverted receipt.
2. Deposit reports success for a mined reverted receipt.
3. Harvest reports success for a mined reverted receipt.
4. Withdrawal reports success for a mined reverted receipt.
5. A wallet connected to Ethereum can reach the signing handler without the
   request explicitly targeting Base.

The five tests intentionally assert the required behavior and currently fail.
No production implementation was changed as part of this verification.

## Reproduction

Start an isolated fork (the first command stays running):

```sh
anvil --fork-url https://mainnet.base.org --fork-block-number 52528062 --chain-id 31337 --port 18545 --host 127.0.0.1 --silent
forge build --root contracts
node scripts/test-v3-timelock-fork.mjs
npx vitest run src/components/liquidity/LpLockCard.test.tsx --reporter=verbose
```

The fork script refuses a non-Anvil endpoint, a non-forked node, an upstream chain
other than Base, or a local chain ID other than 31337. Its RPC endpoint is fixed to
localhost. It writes transaction hashes and measured results to the ignored
`test-results/v3-timelock-fork.json` file. The pinned block requires an RPC that
can serve its historical state.

After testing, a fresh mainnet read confirmed that NFT #6245990 remained owned by
`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`, with no timelock record.
