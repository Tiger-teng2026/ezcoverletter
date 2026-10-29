import type { PaidPlanId, PlanId } from '@/lib/plans'
import type { SubscriptionRecord, SubscriptionStatus } from '@/lib/billing/ledger'

const KEEPING_ACCESS = new Set<SubscriptionStatus>(['active', 'trialing', 'canceled', 'scheduled_cancel'])
const PAYMENT_FAILED = new Set<SubscriptionStatus>(['past_due', 'unpaid'])

export function utcMonthPeriod(now = new Date()) {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${now.getUTCFullYear()}-${month}-01`
}

export function effectivePlan(sub: SubscriptionRecord | null, now = new Date()): {
  plan: PlanId
  status: string
  message: string
} {
  if (!sub) return { plan: 'free', status: 'free', message: '' }
  const end = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : Number.NaN
  const inPeriod = Number.isFinite(end) && end > now.getTime()

  if ((sub.status === 'active' || sub.status === 'trialing') && inPeriod) {
    return { plan: sub.plan, status: sub.status, message: '' }
  }
  if ((sub.status === 'canceled' || sub.status === 'scheduled_cancel') && inPeriod) {
    return {
      plan: sub.plan,
      status: sub.status,
      message: 'Cancellation is scheduled. Paid credits continue until the end of the current Creem period.',
    }
  }
  if (PAYMENT_FAILED.has(sub.status)) {
    return {
      plan: 'free',
      status: sub.status,
      message:
        'The last subscription payment failed. Paid credits stay off until Creem reports a successful renewal. The Free allowance still applies.',
    }
  }
  if (sub.status === 'paused') {
    return { plan: 'free', status: 'paused', message: 'This subscription is paused. Paid credits stay off until it is active again.' }
  }
  if (sub.status === 'refunded') {
    return {
      plan: 'free',
      status: 'refunded',
      message: 'A refund was recorded for this subscription. Paid credits are off. Pro Export is a separate one-time purchase.',
    }
  }
  if (KEEPING_ACCESS.has(sub.status) && !inPeriod) {
    return { plan: 'free', status: 'expired', message: 'This subscription period has ended. The account is on the Free plan.' }
  }
  return { plan: 'free', status: sub.status, message: 'This subscription period has ended. The account is on the Free plan.' }
}

export function isPaidPlan(plan: PlanId): plan is PaidPlanId {
  return plan === 'creator' || plan === 'pro'
}
