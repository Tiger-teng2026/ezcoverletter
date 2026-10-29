import { PLANS, type PaidPlanId } from '@/lib/plans'
import type { SubscriptionRecord, SubscriptionStatus } from '@/lib/billing/ledger'

/** Paid credit rows share this date so the cycle id, not the calendar month, separates them. */
export const PAID_PERIOD = '2000-01-01'

const RANK: Record<PaidPlanId, number> = { creator: 1, pro: 2 }

export function isoSecond(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function legacyCycleId(subscriptionId: string, periodEnd: string) {
  const end = isoSecond(periodEnd)
  if (!end) return null
  return `legacy:${subscriptionId}:${end}`
}

export function paidAccountId(userId: string, subscriptionId: string, cycleId: string) {
  return `paid:${userId}:${subscriptionId}:${cycleId}`
}

export function nextUtcMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}

export type CycleDecision = {
  plan: PaidPlanId
  scheduledPlan: PaidPlanId | null
  cycleId: string | null
  periodStart: string | null
  periodEnd: string | null
  openedByTransaction: string | null
  openNewBucket: boolean
  raiseAllowance: boolean
  allowance: number
}

/**
 * A new paid bucket opens only for subscription.paid when the transaction id
 * and both period boundaries are strictly newer. Product changes keep the bucket.
 */
export function decideSubscriptionChange(
  existing: SubscriptionRecord | null,
  incoming: {
    subscriptionId: string
    plan: PaidPlanId
    periodStart: string | null
    periodEnd: string | null
    transactionId: string | null
    eventType: string
  },
): CycleDecision {
  const start = isoSecond(incoming.periodStart)
  const end = isoSecond(incoming.periodEnd)
  const prevStart = isoSecond(existing?.periodStart)
  const prevEnd = isoSecond(existing?.currentPeriodEnd)
  const previousPlan = existing?.plan ?? incoming.plan
  const openNewBucket =
    incoming.eventType === 'subscription.paid' &&
    Boolean(incoming.transactionId) &&
    Boolean(start && end) &&
    incoming.transactionId !== (existing?.openedByTransaction ?? '') &&
    (!prevStart || start! > prevStart) &&
    (!prevEnd || end! > prevEnd)

  if (openNewBucket && start && end && incoming.transactionId) {
    const plan = incoming.plan
    return {
      plan,
      scheduledPlan: null,
      cycleId: `${incoming.subscriptionId}:${start}`,
      periodStart: start,
      periodEnd: end,
      openedByTransaction: incoming.transactionId,
      openNewBucket: true,
      raiseAllowance: true,
      allowance: PLANS[plan].monthlyCredits,
    }
  }

  let plan = previousPlan
  let scheduledPlan = existing?.scheduledPlan ?? null
  if (RANK[incoming.plan] > RANK[plan]) {
    plan = incoming.plan
    scheduledPlan = null
  } else if (RANK[incoming.plan] < RANK[plan]) {
    // A lower product on the event is not a confirmed Creem price change.
    scheduledPlan = null
  }

  return {
    plan,
    scheduledPlan,
    cycleId: existing?.cycleId ?? null,
    periodStart: existing?.periodStart ?? start,
    periodEnd: end ?? existing?.currentPeriodEnd ?? null,
    openedByTransaction: existing?.openedByTransaction ?? null,
    openNewBucket: false,
    raiseAllowance: RANK[plan] > RANK[previousPlan] && Boolean(existing?.cycleId),
    allowance: PLANS[plan].monthlyCredits,
  }
}

/** A second Creem checkout would be a separate subscription. Active, canceling, and failed payments stay blocked. */
export function blocksAnotherSubscription(status: SubscriptionStatus, periodEnd: string | null, now: Date) {
  if (status === 'past_due' || status === 'unpaid' || status === 'paused') return true
  return keepsPaidAccess(status, periodEnd, now)
}

export function keepsPaidAccess(status: SubscriptionStatus, periodEnd: string | null, now: Date) {
  if (status !== 'active' && status !== 'trialing' && status !== 'canceled' && status !== 'scheduled_cancel') {
    return false
  }
  const end = periodEnd ? Date.parse(periodEnd) : Number.NaN
  return Number.isFinite(end) && end > now.getTime()
}
