import { describe, expect, it } from 'vitest'

import { type PeriodState, PeriodStatus, planKeeper } from './keeper.js'

const LEAD = 30 * 86_400
const Q = 7_884_000
const START = 1_792_973_235

function quarter(index: number, status: PeriodStatus, incentive?: PeriodState['incentive']): PeriodState {
  const startTime = START + index * Q
  return { index, amount: 1n, startTime, endTime: startTime + Q, status, incentive }
}

describe('planKeeper', () => {
  it('does nothing while the next window is still closed', () => {
    const periods = [quarter(0, PeriodStatus.Created, { unclaimed: 5n, stakes: 1 }), quarter(1, PeriodStatus.Pending)]
    expect(planKeeper(periods, START + 10 * 86_400, LEAD)).toEqual({ actions: [], notes: [] })
  })

  it('creates a period once its 30-day window opens, and up to its start', () => {
    const periods = [quarter(1, PeriodStatus.Pending)]
    const opens = START + Q - LEAD
    expect(planKeeper(periods, opens - 1, LEAD).actions).toEqual([])
    expect(planKeeper(periods, opens, LEAD).actions.map(a => a.kind)).toEqual(['create'])
    expect(planKeeper(periods, START + Q, LEAD).actions.map(a => a.kind)).toEqual(['create'])
  })

  it('skips a period whose window has passed', () => {
    const plan = planKeeper([quarter(1, PeriodStatus.Pending)], START + Q + 1, LEAD)
    expect(plan.actions).toEqual([expect.objectContaining({ kind: 'skip', index: 1 })])
  })

  it('finalizes an ended period with nothing staked and a refund due', () => {
    const plan = planKeeper([quarter(0, PeriodStatus.Created, { unclaimed: 9n, stakes: 0 })], START + Q, LEAD)
    expect(plan.actions).toEqual([expect.objectContaining({ kind: 'finalize', index: 0 })])
  })

  it('leaves an ended period with staked positions for a person, and ignores one with no refund', () => {
    const staked = planKeeper([quarter(0, PeriodStatus.Created, { unclaimed: 9n, stakes: 2 })], START + Q, LEAD)
    expect(staked.actions).toEqual([])
    expect(staked.notes[0]).toContain('2 position(s) still staked')
    const empty = planKeeper([quarter(0, PeriodStatus.Created, { unclaimed: 0n, stakes: 0 })], START + Q, LEAD)
    expect(empty).toEqual({ actions: [], notes: [] })
  })

  it('never finalizes before the end or touches skipped periods', () => {
    const periods = [
      quarter(0, PeriodStatus.Created, { unclaimed: 9n, stakes: 0 }),
      quarter(1, PeriodStatus.Skipped),
    ]
    expect(planKeeper(periods, START + Q - 1, LEAD).actions).toEqual([])
  })
})
