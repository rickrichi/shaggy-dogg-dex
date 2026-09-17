# AMM configuration and fork verification

## Safety model

The AMM layer is deterministic and plan-only.

- Profiles are selected explicitly in code: `getAmmProfile("local")`, `getAmmProfile("sepolia")`, or `getAmmProfile("mainnet")`.
- Every profile has `executionMode: "plan-only"`.
- Pair creation, token approvals, liquidity submission, deployment broadcasts, and signer access are disabled.
- Plans contain no timestamp, random identifier, wallet address, credential, or RPC result. Equal inputs create the same `canonicalPairKey` and `planKey`.
- The mainnet profile references Uniswap V2 only for read-only pair discovery. Sepolia deliberately trusts no AMM address until a reviewed deployment record is added.

The configuration source is `src/config/amm/profiles.ts`; planning is implemented in `src/lib/amm/plans.ts`.

## Profiles

| Profile | Chain ID | Provider | Contract addresses | Allowed action |
| --- | ---: | --- | --- | --- |
| `local` | 31337 | Shaggy Dogg V2 prototype | Test deployment only | Build a plan |
| `sepolia` | 11155111 | Unconfigured | None | Build a plan; select and verify a protocol first |
| `mainnet` | 1 | Uniswap V2 | Canonical factory, router, WETH | Read-only pair-discovery plan |

No profile can submit liquidity or create a pair.

## Deterministic plan examples

```ts
const pair = buildPairPlan(getAmmProfile("mainnet"), weth, usdc);

const liquidity = buildLiquidityPlan({
  profile: getAmmProfile("mainnet"),
  tokenA: weth,
  tokenB: usdc,
  amountADesired: 1_000_000_000_000_000_000n,
  amountBDesired: 3_000_000_000n,
  slippageBps: 50n,
});

// Always "DISABLED"; this is not a transaction request.
console.log(liquidity.submission, liquidity.planKey);
```

The plan builder requires base-unit `bigint` amounts and calculates minimums with basis-point integer arithmetic.

## Local Anvil fork

No wallet or signer is required.

1. Set a read-only Ethereum RPC URL in your shell only; do not add it to a browser `VITE_` variable.

   ```powershell
   $env:MAINNET_RPC_URL = "https://your-read-only-rpc.example"
   ```

2. Start a local Anvil fork in another terminal.

   ```powershell
   anvil --fork-url $env:MAINNET_RPC_URL --chain-id 31337
   ```

3. Point the Foundry test at that local node and run the read-only metadata check.

   ```powershell
   $env:AMM_FORK_RPC_URL = "http://127.0.0.1:8545"
   forge --root contracts test --match-path test/AmmFork.t.sol -vvv
   ```

The test only calls `factory()`, `WETH()`, and `getPair()`. It has no broadcast code and does not use Anvil’s funded accounts.

If `AMM_FORK_RPC_URL` is absent, the fork assertion is skipped. This allows normal offline contract tests to remain deterministic.

## Decision gate

Before moving beyond planning, make one deliberate recorded choice:

1. Use audited, established infrastructure (for example a reviewed Uniswap, Sushi, or Pancake deployment); or
2. Build a Shaggy Dogg AMM, then complete invariant/fuzz tests and obtain an independent audit.

Neither choice enables mainnet execution in this repository. That must be a separately reviewed change with a new capability gate.
