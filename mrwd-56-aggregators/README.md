# WETH/MRWD aggregator audit — Base chain 8453

**Read-only**. Checks live on-chain identity of pool `0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5` (WETH / MRWD, claimed 0.30%). Tracks NFT #6367926 as a label only: it does **not** read or change the staked position.

## Setup

```bash
cp .env.example .env
npm install
npm run check
npm run audit
```

Node.js 22+ recommended. RPC connectivity required. Replace `BASE_RPC_URL` with a dedicated HTTPS Base RPC for reliable operation. Optional `ZEROX_API_KEY` from the 0x dashboard. `QUOTE_ADDRESS` is a public EVM address only; no private key is needed. Quotes may fail depending on the chosen address, liquidity, token restrictions, or provider requirements. Default amounts are 0.001 WETH and 1 MRWD, adjustable in `.env`.

## What is and isn't connected

The registry contains **56 prospective platforms**, not 56 guaranteed Base-compatible independent routers. Real HTTP quote adapters are implemented for **0x, LI.FI, Odos**, testing both token directions. All other platforms are deliberately `manual_review` until a verified public endpoint and terms are available. No made-up submissions, fake integrations, wallet authorization, or swap execution. The script writes `report.json` and `report.csv`.

**Important:** A route quote does NOT prove the returned route uses this exact pool. The output is not proof of registration, listing, or incremental bot traffic. For exact routing evidence, obtain provider-specific route breakdowns or inspect executed Base swap transaction logs for this pool address. If pool factory validation shows noncanonical, aggregators may not recognize it.

## Reference docs (checked October 2026)

- https://docs.0x.org/docs/introduction/quickstart/swap-tokens-with-0x-swap-api
- https://docs.0x.org/api-reference/evm-ap-is/swap/allowanceholder-getprice
- https://docs.li.fi/api-reference/introduction
- https://docs.odos.xyz/
- https://defillama.com/dex-aggregators/chain/base
