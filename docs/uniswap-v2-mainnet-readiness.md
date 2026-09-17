# Uniswap V2 mainnet-readiness release

## Current state

This release prepares Shaggy-Dogg-DEX for real Uniswap V2 integration without enabling a real transaction.

`src/config/amm/mainnet-readiness.ts` is an intentional **blocked** manifest:

- SD has no recorded mainnet deployment address.
- SD source verification is not recorded.
- No independent audit reference is recorded.
- Mainnet execution is disabled in code.
- The only pinned external addresses are the reviewed Uniswap V2 factory, router, and WETH addresses.

No browser variable, RPC response, or UI action can change this manifest to active.

## Included capabilities

1. Read-only Uniswap V2 pair discovery using one `getPair` view call.
2. Exact SD/WETH liquidity-review artifacts built from bigint base units.
3. Deterministic plan keys for reproducible review.
4. Mainnet readiness reporting with explicit blockers.

None of these capabilities creates a pair, approves an allowance, submits liquidity, signs a payload, or accesses a wallet.

## Production RPC

Use a browser-safe, read-only RPC endpoint only:

```text
VITE_MAINNET_PUBLIC_RPC_URL=https://your-public-readonly-rpc.example
```

Never put a private RPC credential, wallet secret, mnemonic, or private key in a `VITE_` variable. The application should use a backend or user wallet provider for future privileged work, after an independent review.

## Verification

```powershell
npm run amm:mainnet-readiness:test
npm run amm:plan:test
```

The fork metadata test also verifies the pinned Uniswap V2 infrastructure against a local Anvil fork:

```powershell
anvil --fork-url $env:MAINNET_RPC_URL --chain-id 31337 --accounts 0
$env:AMM_FORK_RPC_URL = "http://127.0.0.1:8545"
forge test --root contracts --match-path test/AmmFork.t.sol -vvv
```

## Required evidence before any activation proposal

1. A deployed SD token address and verified source record.
2. An independent security audit with a publishable report.
3. Explicit chain, Uniswap address, and RPC verification performed again near release time.
4. A reviewed liquidity plan with costs, slippage, and human approvals.
5. A separately reviewed capability design for a wallet-mediated submission flow.

The present code deliberately stops before step 5.
