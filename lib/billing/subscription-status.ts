import type { SubscriptionStatus } from '@/lib/billing/ledger'

/** Event names Creem sends when the subscription object status can lag behind the event. */
export const FORCED_SUBSCRIPTION_STATUS = {
  'subscription.canceled': 'canceled',
  'subscription.scheduled_cancel': 'scheduled_cancel',
  'subscription.past_due': 'past_due',
  'subscription.unpaid': 'unpaid',
  'subscription.expired': 'expired',
  'subscription.paused': 'paused',
} as const satisfies Record<string, SubscriptionStatus>

const KNOWN = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'canceled',
  'scheduled_cancel',
  'past_due',
  'unpaid',
  'expired',
  'paused',
  'refunded',
])

export function statusForSubscriptionEvent(eventType: string, objectStatus: string | null | undefined): SubscriptionStatus | null {
  const forced = FORCED_SUBSCRIPTION_STATUS[eventType as keyof typeof FORCED_SUBSCRIPTION_STATUS]
  if (forced) return forced
  if (objectStatus && KNOWN.has(objectStatus as SubscriptionStatus)) return objectStatus as SubscriptionStatus
  if (eventType === 'subscription.paid' || eventType === 'subscription.active') return 'active'
  if (eventType === 'subscription.trialing') return 'trialing'
  return null
}
