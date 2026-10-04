# Proposed reward and governance policy

This is a concrete proposal for the owner to approve or revise. It is **disabled**;
no assets, admin rights or voting rights change when this file is edited.
Machine-readable terms: `config/protocol-economics.proposed.json`.

## Rewards

- Allocate 10% of realized net arbitrage profit to AMUTT stakers and 90% to the
  existing treasury. This is a share of profit, not a return promised on deposits.
- Settle rewards in native Base USDC in weekly epochs. Deduct trading and flash
  fees, gas, funding/conversion costs and unrecovered losses before allocation.
  Carry losses forward; do not pay rewards from principal or unrealized quotes.
- Weight each account by its AMUTT stake multiplied by time staked during the
  epoch. Reconstruct this from finalized staking events. Tokens merely held in
  a wallet do not qualify. Round allocations down and carry USDC dust forward.
- Require complete exchange fills, final chain receipts and a timestamped,
  evidenced USDC valuation of non-USDC expenses. An unresolved hedge, missing
  fee, or missing valuation blocks closing that epoch.
- Publish the epoch ledger and allocations before any distribution. A separate
  funded reward distributor and staking-event indexer must be implemented and
  verified before enabling claims. The existing staking contract has no reward
  claim function; changing configuration cannot add one.

Example: 100 USDC proceeds above deployed capital, less 20 USDC verified expenses
and 10 USDC carried losses, leaves 70 USDC eligible profit: 7 to stakers and 63 to
treasury. No allocation occurs when eligible profit is zero or negative.

## Governance

Start with advisory votes: one unit of staked AMUTT at a finalized snapshot block
equals one voting unit. Use seven-day votes, 5% quorum of snapshot staked supply,
and more than 50% support among votes cast. Votes do not execute transactions.
The current administrators retain their existing rights and must separately
review and sign accepted changes. Publish their actions against each proposal.

Binding governance would require a separately reviewed governor, timelock,
quorum policy and deliberate admin transfer. No such transfer is authorized by
this proposal. The AMUTT token's name does not establish governance authority.

## Decision still required

Approve or revise the 10% allocation and advisory authority before implementing
and funding the reward distributor. Deployment and enablement are separate
steps; this proposal is not a live-trading authorization.
