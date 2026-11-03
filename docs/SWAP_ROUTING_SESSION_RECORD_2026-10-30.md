# Swap Routing and Paymaster Session Record — 2026-10-30

This session added five Base DEX venues to the swap page, let users choose the venue for each
swap, and fixed two production paymaster faults. It also found a MetaMask restriction that blocks
sponsored operations for MetaMask Smart Accounts.

## Outcome

| Area | Result | Commit |
| --- | --- | --- |
| Sponsored operations | Fee estimation fixed | `51d0542` |
| Swap routing | PancakeSwap, SushiSwap and BaseSwap added on Base | `e2824ad` |
| Swap page | Users can choose the DEX for each swap | `4d759d0` |

All three commits are on `main` and deployed to `dex.lumsian.com` with the Vercel CLI from a clean
export.

## Base venues

Swaps on Base now compare eight venues. Other chains keep their existing Uniswap venues.

| Venue | Router | Factory | Quoter |
| --- | --- | --- | --- |
| PancakeSwap V3 | `0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86` | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` |
| SushiSwap V3 | `0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f` | `0xc35DADB65012eC5796536bD9864eD8773aBc74C4` | `0xb1E835Dc2785b52265711e17fCCb0fd018226a6e` |
| PancakeSwap V2 | `0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb` | `0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E` | Router |
| SushiSwap V2 | `0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891` | `0x71524B4f93c58fcbF659783284E38825f0622859` | Router |
| BaseSwap | `0x327Df1E6de05895d2ab08513aaDD9313Fe505d86` | `0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB` | Router |

The canonical list is `BASE_V2_VENUES` and `BASE_V3_VENUES` in `src/config/contracts.ts`.

Venue differences that the routing code handles:

- PancakeSwap V3 uses the 0.25% fee tier in place of 0.30%.
- SushiSwap V3 uses the original V3 router. Its swap params carry the deadline, its multicall has
  no deadline argument, and it uses the zero address to mean "this router" before `unwrapWETH9`.
- Two-hop routes on the fork V3 venues only try the two main fee tiers, which limits RPC reads.
- Each venue's price impact reads that venue's own factory and pools.

The paymaster API only accepts its allowlisted routers, so sponsored swaps stay on Uniswap and
Aerodrome through `SPONSORED_ROUTE_VENUES`.

## Choosing a DEX

The swap card has a **Route** menu, and each card under **Quotes for your trade** can be clicked.
The default is **Best price (automatic)**.

- A chosen venue drives the quote, price impact, approval and swap.
- The main button reads `Swap on <venue>`.
- The page states how the choice compares with the best quote, and turns orange at 1% or worse.
- A venue with no route for the trade cannot be chosen.
- If a chosen venue loses its route, for example after a token change, the swap is blocked and
  **Switch to best price** is offered. The app never reroutes a chosen swap on its own.
- The choice resets when the chain changes.

Existing protections are unchanged: the minimum received, price impact confirmation, the quote
recheck before signing, and the wallet simulation.

## Production fixes

### Vercel configuration

- `BASE_RPC_URL` was unset in Vercel Production. The sponsorship API fell back to
  `https://mainnet.base.org`, and Cloudflare blocked Vercel's server with a 403. A private RPC URL
  is now set.
- `PAYMASTER_ADDRESS` pointed at the old, unfunded v0.8 paymaster. It now points at the v0.7
  paymaster `0x9cD40EBa4B0793C43FdF8C5A3272073820f77CB4`.

The sponsorship routes for `dex.lumsian.com` run on Vercel, so these values belong in Vercel.
`render.yaml` still lists the old address.

### Fee estimation

`createSmartAccountClient` had no public client, so viem requested fees through the bundler proxy.
The proxy rejects non-ERC-4337 methods and viem swallowed the failure. Requests then carried a zero
fee, which the API declined as `Gas limits exceed sponsorship policy`. The client now receives
`publicClient`.

## Known limitation

Sponsored operations cannot complete from a wallet delegated to the MetaMask EIP-7702 Smart Account.

The MetaMask delegator validates an EIP-712 UserOperation signature whose `verifyingContract` is the
account itself. MetaMask refuses that request from any website:

> External signature requests cannot use internal accounts as the verifying contract.

MetaMask applies a matching block to website requests for delegation signatures from its own
accounts, so the delegation route is closed too. Both checks are in `validation.ts` in MetaMask's
`signature-controller` package.

The likely route forward is `wallet_sendCalls` with the ERC-7677 `paymasterService` capability, for
wallets that report support. MetaMask's support is unconfirmed. Until that exists, the page should
tell these users that sponsorship is unavailable.

## Verification

| Check | Result |
| --- | --- |
| Live quotes, price impact, and swap simulation in both directions | Passed for all five new venues |
| Local preview in a browser with no wallet | All eight venues quoted, and choosing BaseSwap updated the page |
| Production build | Passed |
| Frontend tests | 260 passed, 5 failed, 1 todo |
| Live site | New venues and route choice are in the deployed bundle |

The 5 failures are contract artifact tests that need compiled contract output, which the clean
validation copy did not have. The type error in `PaymasterOperationsConsole.tsx` and the lint errors
in the edited files were already present.

### First real swap

A user-signed swap through the app confirmed the path from venue choice to settlement:

- **Transaction:** [`0xbe80dfb5…e09a58`](https://base.blockscout.com/tx/0xbe80dfb53a735be244bac3aec685cc4f9d9b510915d187a21d828106e1e09a58)
- **Block:** 53,283,940
- **Venue:** PancakeSwap V3, through the 0.01% WETH/USDC pool `0x72AB388E2E2F6FaceF59E3C3FA2C4E29011c2D38`
- **Trade:** 0.00005 ETH for 0.111952 USDC

An earlier [approval transaction](https://base.blockscout.com/tx/0xd717e488c5712a0c2213af1df32996256200248e7707c95c03ca2617a35d560e)
for the same router also succeeded.

## Remaining work

- Real swaps on SushiSwap V3, SushiSwap V2, PancakeSwap V2 and BaseSwap. These have passed
  simulation only.
- A browser check of venues with no route. This case has automated tests only.
- A phone-size layout check.
- A clear message for MetaMask Smart Account users on the paymaster page.
- Hide or block **Approve** when the wallet does not hold the sell token.
- Decide on QuickSwap and Curve. Curve needs its own routing because it uses a different pool
  interface. Orca and Jupiter are Solana-only and do not fit this EVM app.
- Update `PAYMASTER_ADDRESS` in `render.yaml`.
