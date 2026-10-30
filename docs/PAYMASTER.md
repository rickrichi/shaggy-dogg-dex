# Base portfolio paymaster

The `/launchpad/paymaster` page sponsors eligible Base ERC-20 transfers from an enrolled wallet and rewards successful operations with MRWD. The paymaster pays ETH gas from its EntryPoint deposit. It does not collect MRWD or the transferred token. A held token may be selected from the Base portfolio list or entered by contract address.

Base mainnet deployment: [`0x221A9765844511Ef01E383273b396c45372E462a`](https://basescan.org/address/0x221A9765844511Ef01E383273b396c45372E462a). It uses EntryPoint v0.8, rewards 100 MRWD per successful operation, caps one sponsorship at 0.001 ETH, and starts with a one-day wallet cooldown.

## Deployment

1. Generate a dedicated sponsor signing key and keep its private key on the API server. Enter only its **public address** in the page's deployment form.
2. Connect the owner wallet to Base. Deploy `SponsoredRewardPaymaster` from the page with MRWD as reward token, a fixed MRWD reward, and a maximum ETH cost per operation.
3. Deposit ETH, add EntryPoint stake, and transfer MRWD to the paymaster through the operations console. Set a cooldown and verify the displayed deposit, stake, and unreserved MRWD balance.
4. Set the server environment variables below, restart the API server, and attach the deployed paymaster address in the page. The signer address held by the contract must match the signing key.
5. Enroll wallet addresses through `PAYMASTER_ALLOWED_WALLETS`. The signer API declines all users when this list is empty.

| Variable | Purpose |
| --- | --- |
| `PAYMASTER_ADDRESS` | Base paymaster contract address |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Dedicated signer key, server side only |
| `PAYMASTER_BUNDLER_URL` | ERC-4337 v0.8 bundler RPC; credentials stay on the server |
| `PAYMASTER_ALLOWED_WALLETS` | Comma separated enrolled Base wallet addresses |
| `BASE_RPC_URL` | Base execution RPC used for policy checks |

The Vercel page routes `/api/paymaster/*` to the existing API server. A Google Cloud account is not required. Any server capable of protecting the signer key and reaching a v0.8 bundler works. The current deployment needs the API server to have these environment variables; putting the key or bundler credential in a `VITE_` variable exposes it in the browser.

## Transaction policy

- EntryPoint v0.8 and EIP-7702 use the wallet's existing Base address. The wallet must support signing EIP-7702 authorizations on first use. The delegated implementation is fixed to the Simple 7702 account used by permissionless.js.
- The server signs a short-lived sponsorship for one `execute` call containing one ERC-20 `transfer`. It checks the enrolled sender, token balance, destination, gas limits, onchain pause/cooldown, reward reserve, and sponsor signer. The contract binds the signature to the sender, nonce, call data, gas fields, chain, and expiry. The contract also checks the EIP-7702 implementation onchain.
- The contract pays MRWD to the sender only after `postOp` reports success. A reverted operation receives no reward, though it can still consume sponsored ETH gas and start the cooldown.
- The contract's deposit, maximum gas cost, and fixed reward set the program's financial exposure. The allowlist and cooldown limit abuse. An owner can pause, rotate the signer, or withdraw unreserved funds.

This flow currently covers Base ERC-20 transfers. Swaps, liquidity actions, native ETH, and other chains need their own narrowly defined signer policy and UI before sponsorship is enabled for them. The paymaster has not been independently audited; test on Base Sepolia and review the deployed bytecode and signer policy before funding a mainnet campaign.
