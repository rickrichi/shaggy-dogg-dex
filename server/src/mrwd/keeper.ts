// server/src/mrwd/keeper.ts
// Decides which permissionless MuttIncentiveScheduler calls are due (whitepaper v2.0 §14.2–§14.3).
// Pure: the caller reads chain state and sends the transactions (run-keeper.ts).

/** MuttIncentiveScheduler.Status, in contract order. */
export const PeriodStatus = { Pending: 0, Created: 1, Skipped: 2 } as const
export type PeriodStatus = (typeof PeriodStatus)[keyof typeof PeriodStatus]

export interface PeriodState {
  index: number
  amount: bigint
  startTime: number
  endTime: number
  status: PeriodStatus
  /** The staker's incentive for a created period: reward still unclaimed and positions still staked. */
  incentive?: { unclaimed: bigint; stakes: number }
}

export type KeeperAction =
  | { kind: 'create'; index: number; reason: string }
  | { kind: 'skip'; index: number; reason: string }
  | { kind: 'finalize'; index: number; reason: string }

export interface KeeperPlan {
  actions: KeeperAction[]
  /** Due work the keeper cannot do on its own, for a person to look at. */
  notes: string[]
}

/**
 * `lead` is the staker's maxIncentiveStartLeadTime: period i can be created from startTime - lead
 * until startTime inclusive, the same window the scheduler enforces.
 */
export function planKeeper(periods: PeriodState[], now: number, lead: number): KeeperPlan {
  const actions: KeeperAction[] = []
  const notes: string[] = []
  for (const p of periods) {
    if (p.status === PeriodStatus.Pending) {
      const opens = Math.max(p.startTime - lead, 0)
      if (now >= opens && now <= p.startTime) {
        actions.push({ kind: 'create', index: p.index, reason: `window open until ${iso(p.startTime)}` })
      } else if (now > p.startTime) {
        // Too late to create; the scheduler's only way forward is sending the amount to 0x…dEaD.
        actions.push({ kind: 'skip', index: p.index, reason: `window closed at ${iso(p.startTime)}` })
      }
    } else if (p.status === PeriodStatus.Created && now >= p.endTime && p.incentive) {
      if (p.incentive.unclaimed === 0n) continue // nothing to refund; the staker's endIncentive would revert
      if (p.incentive.stakes === 0) {
        actions.push({ kind: 'finalize', index: p.index, reason: `ended ${iso(p.endTime)}, nothing staked` })
      } else {
        notes.push(
          `Period ${p.index} ended ${iso(p.endTime)} with ${p.incentive.stakes} position(s) still staked; ` +
            'finalize(index, tokenIds) needs their token ids, so it is left for a manual call.',
        )
      }
    }
  }
  return { actions, notes }
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')
}
