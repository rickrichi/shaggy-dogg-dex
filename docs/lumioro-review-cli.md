# LUMIORO Mainnet Review Commands

All commands in this document are read-only or build-only. They do not use a wallet, private key, token approval, liquidity addition, or transaction submission.

## Print a deterministic liquidity review

Choose an exact WETH amount only after a human treasury decision. Convert it to wei and generate its unique plan key:

    npx tsx --tsconfig tsconfig.app.json scripts/print-lumioro-liquidity-review.ts --weth-wei 20000000000000000

The sample is 0.02 WETH and is not an approval or recommendation. Any change to the wei value changes the plan key.

## Discover the Uniswap V2 pair

Provide an HTTPS Ethereum mainnet RPC endpoint. The command checks chain ID 1 and calls only factory and pair view functions:

    npx tsx --tsconfig tsconfig.app.json scripts/discover-lumioro-uniswap-v2-pair.ts --rpc-url https://ethereum.publicnode.com

The JSON output records the block, factory, pair address, and when a pair exists, reserves and LP total supply. Repeat this immediately before a later human review; discovery is point-in-time evidence only.

## Verify the gate model

    npm run type-check
    npx vitest run src/lib/amm/lumioro-evidence-gate.test.ts --reporter=dot

The tests prove that a claimed audit name does not clear the audit gate, mismatched runtime evidence fails, and an exact liquidity plan needs named human evidence. The release still never enables mainnet execution.
