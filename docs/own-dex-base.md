# Shaggy-Dogg-Dex on Base

## What is implemented

`/dex/setup` deploys an independent factory and Router02 through a connected Base
wallet. `/swap` and `/liquidity` use only that verified deployment. The older
external-router pages remain at `/classic` and `/legacy/liquidity`.

The contracts are unchanged creation bytecode from pinned packages:

- `@uniswap/v2-core@1.0.1`: factory and pair.
- `@uniswap/v2-periphery@1.1.0-beta.0`: Router02.

Upstream sources: https://github.com/Uniswap/v2-core and
https://github.com/Uniswap/v2-periphery. Licenses are preserved in
`contracts/vendor`. LP tokens retain the upstream Uniswap V2 name. The generator
checks that pair creation code matches Router02's CREATE2 hash before use.

This is an independent deployment of the V2 protocol, with its own liquidity.
It does not inherit liquidity from the existing Base Uniswap deployment. Pool
fees are 0.30%; protocol fee collection starts disabled. The chosen factory
administrator controls the protocol fee recipient and can transfer that role.
Neither the router nor factory provides a pool-fund withdrawal privilege to the
administrator. LPs hold transferable pool shares. Only standard ERC20 transfers
are supported by this UI; rebasing and transfer-tax tokens are outside its scope.

## Launch

1. Open `/dex/setup` and connect the deploying wallet on Base (8453).
2. Review the factory fee administrator; use the intended wallet or multisig.
3. Estimate factory gas, then approve its deployment in the wallet.
4. Estimate router gas, then approve its deployment in the wallet. Canonical
   Base WETH is `0x4200000000000000000000000000000000000006`.
5. Verify and activate. Runtime bytecode, chain, router factory, and WETH are
   checked before enabling the DEX. A saved transaction hash can recover a
   deployment if the page closes or confirmation times out.
6. Download the public configuration. Set `VITE_SHAGGY_FACTORY_ADDRESS` and
   `VITE_SHAGGY_ROUTER_ADDRESS` in the site's build environment and rebuild so
   all visitors use the same contracts. Browser-only activation is local.
7. Open Liquidity, choose tokens and amounts, and review the initial price ratio.
   Wrap ETH into WETH as needed; leave ETH for gas. Approvals and the liquidity
   deposit each require wallet confirmation. The first deposit creates the pool.

No private keys are read or stored by these pages. The app does not deploy or
seed pools automatically. A contract deployment without funded pools is not a
liquid exchange. Mainnet trades, deposits and deployments cost real gas. The
integration has tests but has not received an independent security audit.

## Validation

```powershell
node scripts/generate-dex-artifacts.mjs
forge test --root contracts --match-contract OwnDexTest -vv
npm test -- --run src/lib/amm/own-dex.test.ts
npm run build
```

`OwnDex.t.sol` uses real Base WETH and USDC on a mainnet fork, with locally funded
test ETH. It gets USDC from the actual Base market, deploys the exact packaged
factory/router, and tests pool creation, swaps, LP ownership, withdrawals,
deadlines, slippage and the constant-product invariant. There is no mock token.
Set `BASE_FORK_RPC_URL` for a different Base RPC. Tests never broadcast mainnet
transactions. The frontend checks real receipts and simulates writes before
requesting wallet signatures; these checks do not guarantee profitability.

The CeDeFi matrix switches to the independent router after activation. An invalid
configured deployment fails closed; it is not silently replaced by external
liquidity. Unsupported token mappings stay unavailable.
