// server/src/mrwd/run-keeper.ts
// Daily keeper for the Mutt Rewards incentive scheduler on Base: creates each quarter's incentive
// inside its 30-day window, skips a quarter whose window was missed, and finalizes ended quarters
// with nothing staked. Every call it makes is permissionless; the keeper wallet only pays gas and
// never holds MRWD.
//
//   npm --prefix server run mrwd:keeper -- [--rpc URL] [--send]
//
// Without --send it only prints the plan. With --send it signs with MRWD_KEEPER_PRIVATE_KEY and
// prints that wallet's address and gas balance on every run, so a wrong key shows up immediately.
// Exits non-zero if a transaction fails, due work needs a person, or the keeper's gas is low.

import { parseArgs } from 'node:util'

import { createPublicClient, createWalletClient, formatEther, http, parseAbi, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

import { type KeeperAction, type PeriodState, type PeriodStatus, planKeeper } from './keeper.js'

/** deployments/mrwd-base-mainnet.json */
const SCHEDULER = '0xCAbf284806b800d9A771B55857B9fCF735ea7109'
const STAKER = '0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1'
/** Below this the keeper flags itself so its gas is topped up before a window opens. */
const LOW_GAS = parseEther('0.0002')

const schedulerAbi = parseAbi([
  'function periodCount() view returns (uint256)',
  'function period(uint256 i) view returns ((uint128 amount, uint64 startTime, uint64 endTime) p, uint8 status)',
  'function incentiveId(uint256 i) view returns (bytes32)',
  'function createIncentive(uint256 i)',
  'function skipMissedPeriod(uint256 i)',
  'function finalize(uint256 i, uint256[] stakedTokenIds)',
])
const stakerAbi = parseAbi([
  'function maxIncentiveStartLeadTime() view returns (uint256)',
  'function incentives(bytes32) view returns (uint256 totalRewardUnclaimed, uint160 totalSecondsClaimedX128, uint96 numberOfStakes)',
])

const { values } = parseArgs({
  options: {
    rpc: { type: 'string', default: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
    send: { type: 'boolean', default: false },
  },
})

const client = createPublicClient({ chain: base, transport: http(values.rpc, { retryCount: 3 }) })
const [count, lead, block] = await Promise.all([
  client.readContract({ address: SCHEDULER, abi: schedulerAbi, functionName: 'periodCount' }),
  client.readContract({ address: STAKER, abi: stakerAbi, functionName: 'maxIncentiveStartLeadTime' }),
  client.getBlock(),
])

const periods: PeriodState[] = []
for (let i = 0; i < Number(count); i++) {
  const [p, status] = await client.readContract({
    address: SCHEDULER, abi: schedulerAbi, functionName: 'period', args: [BigInt(i)],
  })
  const state: PeriodState = {
    index: i, amount: p.amount, startTime: Number(p.startTime), endTime: Number(p.endTime),
    status: status as PeriodStatus,
  }
  if (status === 1 && block.timestamp >= p.endTime) {
    const id = await client.readContract({ address: SCHEDULER, abi: schedulerAbi, functionName: 'incentiveId', args: [BigInt(i)] })
    const [unclaimed, , stakes] = await client.readContract({ address: STAKER, abi: stakerAbi, functionName: 'incentives', args: [id] })
    state.incentive = { unclaimed, stakes: Number(stakes) }
  }
  periods.push(state)
}

const now = Number(block.timestamp)
const plan = planKeeper(periods, now, Number(lead))
const next = periods.find(p => p.status === 0)
console.log(`Block ${block.number} at ${new Date(now * 1000).toISOString()}; ${periods.length} periods.`)
if (next) {
  const opens = new Date((next.startTime - Number(lead)) * 1000).toISOString()
  console.log(`Next pending: period ${next.index}, window ${opens} to ${new Date(next.startTime * 1000).toISOString()}.`)
}
for (const a of plan.actions) console.log(`Due: ${a.kind} period ${a.index} (${a.reason})`)
for (const n of plan.notes) console.log(`Needs a person: ${n}`)
if (plan.actions.length === 0) console.log('Nothing due.')

let failed = false
let account: ReturnType<typeof privateKeyToAccount> | undefined
if (values.send) {
  const key = process.env.MRWD_KEEPER_PRIVATE_KEY
  if (!key) throw new Error('--send needs MRWD_KEEPER_PRIVATE_KEY')
  account = privateKeyToAccount(key as `0x${string}`)
  const gas = await client.getBalance({ address: account.address })
  console.log(`Keeper ${account.address} has ${formatEther(gas)} ETH for gas.`)
  if (gas < LOW_GAS) {
    console.log(`Needs a person: keeper gas is below ${formatEther(LOW_GAS)} ETH; send it more ETH on Base.`)
    failed = true
  }
}
let wallet: ReturnType<typeof createWalletClient<ReturnType<typeof http>, typeof base, ReturnType<typeof privateKeyToAccount>>>
if (account && plan.actions.length > 0) {
  wallet = createWalletClient({ account, chain: base, transport: http(values.rpc, { retryCount: 3 }) })
  for (const a of plan.actions) {
    try {
      const hash = await submit(a)
      const receipt = await client.waitForTransactionReceipt({ hash })
      console.log(`${a.kind} period ${a.index}: ${receipt.status} ${hash}`)
      if (receipt.status !== 'success') failed = true
    } catch (error) {
      console.error(`${a.kind} period ${a.index} failed: ${(error as Error).message.split('\n')[0]}`)
      failed = true
    }
  }
} else if (plan.actions.length > 0) {
  console.log('Plan only; rerun with --send to submit.')
}
if (failed || plan.notes.length > 0) process.exitCode = 1

function submit(a: KeeperAction) {
  const i = BigInt(a.index)
  const target = { address: SCHEDULER, abi: schedulerAbi } as const
  if (a.kind === 'create') return wallet.writeContract({ ...target, functionName: 'createIncentive', args: [i] })
  if (a.kind === 'skip') return wallet.writeContract({ ...target, functionName: 'skipMissedPeriod', args: [i] })
  return wallet.writeContract({ ...target, functionName: 'finalize', args: [i, []] })
}
