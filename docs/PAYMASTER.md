# Base Portfolio Paymaster

The `/launchpad/paymaster` page sponsors eligible Base ERC-20 portfolio operations (transfers, DEX swaps across Uniswap V3 / Uniswap V2 / Aerodrome, and staking in `MuttProStaking` or Launchpad `FeeDiscountStaking`) and rewards successful operations with **100 MRWD**. The paymaster pays ETH gas from its EntryPoint deposit and never charges MRWD or the user's portfolio token as a fee.

Base mainnet deployment: [`0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`](https://basescan.org/address/0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4). It uses EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`), rewards 100 MRWD per successful operation, caps one sponsorship at 0.0001 ETH, and enforces a 24-hour per-wallet cooldown. The earlier v0.8 paymaster `0x221A9765844511Ef01E383273b396c45372E462a` is unfunded.

**Known limitation:** MetaMask refuses the signature that its EIP-7702 Smart Account requires, so sponsored operations cannot complete from those wallets. See [the 2026-10-30 session record](SWAP_ROUTING_SESSION_RECORD_2026-10-30.md#known-limitation).

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PAYMASTER_ADDRESS` | Base paymaster contract address (`0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`). Production reads this from Vercel. |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Dedicated signer key, server/edge side only (`0x852Cd18B109Be741d04bBcb98CB2BD766D9A7d70`) |
| `PAYMASTER_BUNDLER_URL` | ERC-4337 bundler RPC; credentials stay on the server |
| `PAYMASTER_ELIGIBILITY_MODE` | `open_portfolio` (default: any Base portfolio holder) or `allowlist` |
| `PAYMASTER_ALLOWED_WALLETS` | Comma-separated wallet addresses (used when `PAYMASTER_ELIGIBILITY_MODE=allowlist`) |
| `BASE_RPC_URL` | Base execution RPC used for on-chain policy verification. Set a private RPC in production: the public default can block Vercel servers. |

## Supported Portfolio Operations & Policy

- **EIP-7702 + EntryPoint v0.8**: Uses the connected wallet's existing Base address (`Simple 7702` implementation `0xe6Cae83BdE06E4c305530e199D7217f42808555B`). Users do not need to move portfolio tokens to a separate smart account address.
- **Eligible Operations**:
  1. **ERC-20 Portfolio Transfers**: Single `transfer(recipient, amount)` on any held Base ERC-20 token.
  2. **DEX Swaps**: Single `swap` or atomic `executeBatch([approve, swap])` on Base Uniswap V3 (`0x2626...e481`), Uniswap V2 (`0x4752...aD24`), or Aerodrome (`0xcF77...4E43`) for any held Base ERC-20 token.
  3. **Staking & Vaults**: Single `stake` / `unstake` / `relockAll` / `withdrawMatured` or atomic `executeBatch([approve, stake])` on `MuttProStaking` (`0x67dB...1766`) or any Launchpad `FeeDiscountStaking` vault.
- **Reward Settlement**: The contract reserves `rewardAmount` during validation and transfers MRWD to `userOp.sender` inside `_postOp` only when `mode == PostOpMode.opSucceeded`.
