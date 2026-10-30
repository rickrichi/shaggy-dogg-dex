# MRWD liquidity venues: options and decision

Recorded 2026-10-30. On-chain figures were read from Base at about block
53306088 and describe that moment, so recheck them before publishing or acting
on them.

## Decision

A second MRWD/WETH pool is technically possible, but it would not inherit the
existing MRWD rewards. It would initially earn trading fees only unless we
funded a separate incentive program or obtained protocol emissions. Given the
pool's current trading activity and the cost of splitting liquidity, launching
another pool is probably premature. Aerodrome is the strongest candidate once
demand justifies expanding liquidity.

## Swap venues are not staking venues

The eight venues on the swap page are places a swap can route through. Earning
on one of them takes two more things: a pool holding MRWD, and a rewards program
for that pool.

The current MRWD incentive is bound to one pool by its on-chain key:

| Field | Value |
| ------------ | ---------------------------------------------------- |
| Staker | `0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1` |
| Scheduler | `0xCAbf284806b800d9A771B55857B9fCF735ea7109` |
| Reward token | MRWD `0xC17227AAa33C54634B6cE7AD0bf33A156563c179` |
| Pool | Uniswap V3 MRWD/WETH 0.30% `0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5` |
| Period | 1792973235 to 1800857235 |

## On-chain state

Four full-range positions are staked in the incentive, all deposited by
`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`: #6383553, #6383541, #6383531 and
#6367926. Their combined liquidity equals the pool's active liquidity exactly
(`60071682439496678549024` at tick 292604), so:

- These positions collect all current rewards.
- A sale of MRWD into the pool is filled by this same liquidity, not by outside
  depth.
- The locked launch position #6351512 is not part of active liquidity at this
  price.

Factory checks for an MRWD/WETH pool:

| Venue | Checked | Result |
| ---------------------------------------------------------- | ------------------------------- | ----------- |
| Uniswap V3 | 0.01%, 0.05%, 0.30%, 1% | 0.30% only |
| Uniswap V2, PancakeSwap V2, SushiSwap V2, BaseSwap | `getPair` | No pool |
| PancakeSwap V3 | 0.01%, 0.05%, 0.25%, 1% | No pool |
| SushiSwap V3 | 0.01%, 0.05%, 0.30%, 1% | No pool |
| Aerodrome classic | Stable and volatile | No pool |
| Aerodrome Slipstream | Tick spacings 100 and 200 only | No pool |

Not covered: other Slipstream tick spacings, and pairs other than MRWD/WETH such
as MRWD/USDC. The Slipstream factory address was not taken from this repository
and should be confirmed.

## Options by venue

| Venue | Rewards route | Status |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Uniswap V3 | Existing MRWD incentive | Live |
| SushiSwap | Merkl incentive form, funded by whoever creates it | Form exists for Base; MRWD not tried |
| PancakeSwap | Infinity farms: no staking, in-range positions in eligible pools | Base support and eligibility unconfirmed |
| Aerodrome | AERO emissions through a gauge and voter support | Not confirmed from Aerodrome's docs |
| Others | Trading fees, unless a program exists for the pool | Not researched |

- **SushiSwap:** the [Base incentive page](https://www.sushi.com/base/pool/incentivize)
  requires agreeing to Merkl's terms and sets a minimum reward by duration. It
  does not say outright that anyone can submit, and the Blast version says tokens
  may need to be added first. Rewards would have to come from MRWD we already
  hold, not from the Uniswap incentive.
- **PancakeSwap:** the [Infinity farms page](https://docs.pancakeswap.finance/trade/pancakeswap-infinity/farms)
  says positions stay in the wallet and rewards follow fees earned in 8-hour
  epochs. It does not mention Base or say who decides which pools are eligible.
- **Aerodrome:** `aerodrome-finance.app` did not resolve and
  `aerodrome.finance/docs` returned only a title, so the description above is
  general knowledge.

## Costs of a second pool

- Splitting liquidity makes each trade move the price more.
- Liquidity moved out of the Uniswap pool stops earning the MRWD incentive.
- A new pool carries the same impermanent loss risk.
- With almost no outside trading, a second pool would earn very little in fees.

## Before revisiting

1. Rerun the liquidity and factory checks above.
2. Confirm the eligibility rules for the chosen venue from its current docs.
3. Check that outside trading volume justifies splitting liquidity.
