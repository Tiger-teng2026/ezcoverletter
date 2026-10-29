import type { PaidPlanId } from '@/lib/plans'
import { decideSubscriptionChange, paidAccountId } from '@/lib/billing/cycle'
import type { SubscriptionRecord, SubscriptionStatus } from '@/lib/billing/ledger'
import { statusForSubscriptionEvent } from '@/lib/billing/subscription-status'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const STATUSES = new Set<SubscriptionStatus>([
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

export type CreemEvent = {
  id: string
  eventType: string
  object: Record<string, unknown>
}

export type ProductMap = {
  oneTimeProductId: string
  creatorProductId: string
  proProductId: string
}

type Store = {
  markEvent(id: string): Promise<'new' | 'duplicate'>
  getSubscription(userId: string): SubscriptionRecord | null | Promise<SubscriptionRecord | null>
  getSubscriptionByCreemId(id: string): SubscriptionRecord | null | Promise<SubscriptionRecord | null>
  saveSubscription(record: SubscriptionRecord): Promise<void>
  markExport(checkoutId: string, status: 'paid' | 'refunded'): Promise<void>
  ensurePaidBucket?(accountId: string, allowance: number): Promise<void>
  releaseEvent?(id: string): Promise<void>
  grantDocumentExport?(input: { checkoutId: string; requestId?: string | null }): Promise<unknown>
  revokeDocumentExport?(checkoutId: string): Promise<void>
  consumeSubscriptionCheckout?(userId: string): Promise<void>
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseCreemEvent(raw: string): CreemEvent | null {
  try {
    const body = JSON.parse(raw) as unknown
    const data = record(body)
    const id = text(data?.id)
    const eventType = text(data?.eventType)
    const object = record(data?.object)
    if (!data || !id || !eventType || !object) return null
    return { id, eventType, object }
  } catch {
    return null
  }
}

function productId(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const data = record(value)
  return text(data?.id)
}

function userIdFrom(metadata: unknown) {
  const data = record(metadata)
  const userId = text(data?.userId)
  return UUID.test(userId) ? userId : ''
}

function statusOf(value: unknown): SubscriptionStatus | null {
  return typeof value === 'string' && STATUSES.has(value as SubscriptionStatus) ? (value as SubscriptionStatus) : null
}

function periodEnd(value: unknown) {
  const raw = text(value)
  if (!raw || Number.isNaN(Date.parse(raw))) return null
  return new Date(raw).toISOString()
}

function planFor(product: string, products: ProductMap): PaidPlanId | 'export' | null {
  if (products.oneTimeProductId && product === products.oneTimeProductId) return 'export'
  if (products.creatorProductId && product === products.creatorProductId) return 'creator'
  if (products.proProductId && product === products.proProductId) return 'pro'
  return null
}

function paymentVerdict(object: Record<string, unknown>) {
  if (text(object.status) !== 'completed') return 'retry' as const
  const order = record(object.order)
  const status = text(order?.status)
  if (status === 'paid') return 'paid' as const
  if (status === 'refunded' || status === 'failed' || status === 'canceled') return 'terminal' as const
  return 'retry' as const
}

export async function applyCreemEvent(store: Store, event: CreemEvent, products: ProductMap, now = new Date()) {
  if ((await store.markEvent(event.id)) === 'duplicate') return { ok: true as const, duplicate: true }
  try {
    return await applyVerifiedEvent(store, event, products, now)
  } catch (error) {
    await store.releaseEvent?.(event.id)
    throw error
  }
}

async function applyVerifiedEvent(store: Store, event: CreemEvent, products: ProductMap, now: Date) {
  if (event.eventType === 'checkout.completed') {
    const verdict = paymentVerdict(event.object)
    if (verdict === 'retry') throw new Error('checkout payment is not verified')
    if (verdict !== 'paid') return { ok: true as const, ignored: true }
    const product = productId(event.object.product)
    const kind = planFor(product, products)
    const checkoutId = text(event.object.id)
    if (kind === 'export' && checkoutId) {
      if (store.grantDocumentExport) {
        await store.grantDocumentExport({ checkoutId, requestId: text(event.object.request_id) || null })
      } else {
        await store.markExport(checkoutId, 'paid')
      }
      return { ok: true as const, exportRecorded: true }
    }
    return { ok: true as const }
  }

  if (event.eventType === 'refund.created') {
    if (text(event.object.status) !== 'succeeded') return { ok: true as const, ignored: true }
    const checkout = record(event.object.checkout)
    const checkoutProduct = productId(checkout?.product)
    const checkoutId = text(checkout?.id)
    if (planFor(checkoutProduct, products) === 'export' && checkoutId) {
      if (store.revokeDocumentExport) await store.revokeDocumentExport(checkoutId)
      else await store.markExport(checkoutId, 'refunded')
    }
    const subscription = record(event.object.subscription)
    const subscriptionProduct = productId(subscription?.product)
    const subscriptionKind = planFor(subscriptionProduct, products)
    const subscriptionId = text(subscription?.id)
    if ((subscriptionKind === 'creator' || subscriptionKind === 'pro') && subscriptionId) {
      const existing = await store.getSubscriptionByCreemId(subscriptionId)
      if (existing) {
        await store.saveSubscription({
          ...existing,
          status: 'refunded',
          currentPeriodEnd: now.toISOString(),
        })
      }
    }
    return { ok: true as const }
  }

  if (!event.eventType.startsWith('subscription.')) return { ok: true as const, ignored: true }

  const status = statusForSubscriptionEvent(event.eventType, text(event.object.status) || null)
  if (!status) throw new Error('subscription status is not recognized')
  const product = productId(event.object.product)
  const kind = planFor(product, products)
  if (kind !== 'creator' && kind !== 'pro') throw new Error('subscription could not be linked')
  await saveFromSubscription(store, event.object, event.object, kind, products, status, event.eventType)
  return { ok: true as const }
}

async function saveFromSubscription(
  store: Store,
  subscription: Record<string, unknown> | null,
  metadataSource: Record<string, unknown>,
  fallbackPlan: PaidPlanId,
  products: ProductMap,
  forcedStatus?: SubscriptionStatus,
  billingEventType = 'subscription.update',
) {
  if (!subscription) throw new Error('subscription could not be linked')
  const creemSubscriptionId = text(subscription.id)
  if (!creemSubscriptionId) throw new Error('subscription could not be linked')
  const product = productId(subscription.product) || productId(metadataSource.product)
  const kind = planFor(product, products)
  const incomingPlan = kind === 'creator' || kind === 'pro' ? kind : fallbackPlan
  const status = forcedStatus || statusOf(subscription.status) || 'active'
  const userId = userIdFrom(subscription.metadata) || userIdFrom(metadataSource.metadata)
  const existing = (userId ? await store.getSubscription(userId) : null) || (await store.getSubscriptionByCreemId(creemSubscriptionId))
  const owner = userId || existing?.userId || ''
  if (!owner) throw new Error('subscription user is not linked')
  const customer = record(subscription.customer)
  const eventType = billingEventType
  const decision = decideSubscriptionChange(existing, {
    subscriptionId: creemSubscriptionId,
    plan: incomingPlan,
    periodStart: periodEnd(subscription.current_period_start_date),
    periodEnd: periodEnd(subscription.current_period_end_date),
    transactionId: text(subscription.last_transaction_id) || null,
    eventType,
  })
  await store.saveSubscription({
    userId: owner,
    plan: decision.plan,
    status,
    productId: product,
    creemSubscriptionId,
    creemCustomerId: text(customer?.id) || text(subscription.customer) || existing?.creemCustomerId || null,
    currentPeriodEnd: decision.periodEnd,
    cycleId: decision.cycleId,
    periodStart: decision.periodStart,
    openedByTransaction: decision.openedByTransaction,
    scheduledPlan: decision.scheduledPlan,
  })
  if ((decision.openNewBucket || decision.raiseAllowance) && decision.cycleId && store.ensurePaidBucket) {
    await store.ensurePaidBucket(paidAccountId(owner, creemSubscriptionId, decision.cycleId), decision.allowance)
  }
  await store.consumeSubscriptionCheckout?.(owner)
}
