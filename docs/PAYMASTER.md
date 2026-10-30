# Base Portfolio Paymaster

The `/launchpad/paymaster` page sponsors eligible Base ERC-20 portfolio operations (transfers, DEX swaps across Uniswap V3 / Uniswap V2 / Aerodrome, and staking in `MuttProStaking` or Launchpad `FeeDiscountStaking`) and rewards successful operations with **100 MRWD**. The paymaster pays ETH gas from its EntryPoint v0.8 deposit and never charges MRWD or the user's portfolio token as a fee.

Base mainnet deployment: [`0x221A9765844511Ef01E383273b396c45372E462a`](https://basescan.org/address/0x221A9765844511Ef01E383273b396c45372E462a). It uses EntryPoint v0.8 (`0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`), rewards 100 MRWD per successful operation, caps one sponsorship at 0.001 ETH, and enforces a 24-hour per-wallet cooldown.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PAYMASTER_ADDRESS` | Base paymaster contract address (`0x221A9765844511Ef01E383273b396c45372E462a`) |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Dedicated signer key, server/edge side only (`0x852Cd18B109Be741d04bBcb98CB2BD766D9A7d70`) |
| `PAYMASTER_BUNDLER_URL` | ERC-4337 v0.8 bundler RPC; credentials stay on the server |
| `PAYMASTER_ELIGIBILITY_MODE` | `open_portfolio` (default: any Base portfolio holder) or `allowlist` |
| `PAYMASTER_ALLOWED_WALLETS` | Comma-separated wallet addresses (used when `PAYMASTER_ELIGIBILITY_MODE=allowlist`) |
| `BASE_RPC_URL` | Base execution RPC used for on-chain policy verification |

## Supported Portfolio Operations & Policy

- **EIP-7702 + EntryPoint v0.8**: Uses the connected wallet's existing Base address (`Simple 7702` implementation `0xe6Cae83BdE06E4c305530e199D7217f42808555B`). Users do not need to move portfolio tokens to a separate smart account address.
- **Eligible Operations**:
  1. **ERC-20 Portfolio Transfers**: Single `transfer(recipient, amount)` on any held Base ERC-20 token.
  2. **DEX Swaps**: Single `swap` or atomic `executeBatch([approve, swap])` on Base Uniswap V3 (`0x2626...e481`), Uniswap V2 (`0x4752...aD24`), or Aerodrome (`0xcF77...4E43`) for any held Base ERC-20 token.
  3. **Staking & Vaults**: Single `stake` / `unstake` / `relockAll` / `withdrawMatured` or atomic `executeBatch([approve, stake])` on `MuttProStaking` (`0x67dB...1766`) or any Launchpad `FeeDiscountStaking` vault.
- **Reward Settlement**: The contract reserves `rewardAmount` during validation and transfers MRWD to `userOp.sender` inside `_postOp` only when `mode == PostOpMode.opSucceeded`.
