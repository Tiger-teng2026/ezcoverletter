import { randomUUID } from 'node:crypto'
import { blocksAnotherSubscription } from '@/lib/billing/cycle'
import { PLANS, type PaidPlanId, type PlanId } from '@/lib/plans'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'canceled'
  | 'scheduled_cancel'
  | 'past_due'
  | 'unpaid'
  | 'expired'
  | 'paused'
  | 'refunded'

export type SubscriptionRecord = {
  userId: string
  plan: PaidPlanId
  status: SubscriptionStatus
  productId: string
  creemSubscriptionId: string
  creemCustomerId: string | null
  currentPeriodEnd: string | null
  cycleId?: string | null
  periodStart?: string | null
  openedByTransaction?: string | null
  scheduledPlan?: PaidPlanId | null
}

export type HistoryRecord = {
  id: string
  userId: string
  tool: string
  title: string
  input: unknown
  output: unknown
  createdAt: string
}

export type ReserveResult =
  | { ok: true; reservationId: string; remaining: number; replay?: unknown }
  | { ok: false; code: 'quota' | 'in_progress' | 'replay_failed'; remaining: number }

type Reservation = {
  id: string
  accountId: string
  period: string
  action: string
  cost: number
  status: 'reserved' | 'committed' | 'refunded'
  output?: unknown
}

type Balance = { allowance: number; used: number }

/**
 * In-process ledger used by tests. Production uses the SQL functions in
 * supabase/migrations, which apply the same reserve, refund, and idempotency rules.
 * Routes never fall back to this object unless the test hook is enabled.
 */
export class MemoryLedger {
  private tail: Promise<void> = Promise.resolve()
  private balances = new Map<string, Balance>()
  private reservations = new Map<string, Reservation>()
  private idempotency = new Map<string, string>()
  private events = new Set<string>()
  private subscriptions = new Map<string, SubscriptionRecord>()
  private subscriptionsByCreem = new Map<string, string>()
  private history = new Map<string, HistoryRecord>()
  private exports = new Map<string, 'paid' | 'refunded'>()
  private subscriptionAttempts = new Map<string, {
    id: string
    userId: string
    plan: 'creator' | 'pro'
    status: 'creating' | 'open' | 'consumed'
    checkoutId: string | null
    checkoutUrl: string | null
  }>()
  private documents = new Map<string, { id: string; userId: string; letter: string; title: string; contact: Record<string, string>; sourceGenerationId: string | null }>()
  private attempts = new Map<string, { id: string; documentId: string; userId: string; status: string; checkoutId: string | null; checkoutUrl: string | null }>()

  private exclusive<T>(fn: () => T): Promise<T> {
    const run = this.tail.then(() => fn())
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  reserve(input: {
    accountId: string
    period: string
    cost: number
    allowance: number
    action: string
    idempotencyKey?: string
  }): Promise<ReserveResult> {
    return this.exclusive(() => {
      const idem = input.idempotencyKey?.trim() || ''
      if (idem) {
        const existingId = this.idempotency.get(`${input.accountId}:${idem}`)
        const existing = existingId ? this.reservations.get(existingId) : undefined
        if (existing?.status === 'committed') {
          return {
            ok: true,
            reservationId: existing.id,
            remaining: this.remaining(input.accountId, input.period, input.allowance),
            replay: existing.output,
          }
        }
        if (existing?.status === 'reserved') return { ok: false, code: 'in_progress', remaining: 0 }
        if (existing?.status === 'refunded') return { ok: false, code: 'replay_failed', remaining: 0 }
      }

      const key = `${input.accountId}:${input.period}`
      const balance = this.balances.get(key) ?? { allowance: input.allowance, used: 0 }
      balance.allowance = Math.max(balance.allowance, input.allowance)
      if (balance.used + input.cost > balance.allowance) {
        this.balances.set(key, balance)
        return { ok: false, code: 'quota', remaining: Math.max(0, balance.allowance - balance.used) }
      }
      balance.used += input.cost
      this.balances.set(key, balance)
      const id = randomUUID()
      this.reservations.set(id, {
        id,
        accountId: input.accountId,
        period: input.period,
        action: input.action,
        cost: input.cost,
        status: 'reserved',
      })
      if (idem) this.idempotency.set(`${input.accountId}:${idem}`, id)
      return { ok: true, reservationId: id, remaining: balance.allowance - balance.used }
    })
  }

  refund(reservationId: string): Promise<void> {
    return this.exclusive(() => {
      const reservation = this.reservations.get(reservationId)
      if (!reservation || reservation.status !== 'reserved') return
      reservation.status = 'refunded'
      const balance = this.balances.get(`${reservation.accountId}:${reservation.period}`)
      if (balance) balance.used = Math.max(0, balance.used - reservation.cost)
    })
  }

  commit(reservationId: string, output: unknown, history?: Omit<HistoryRecord, 'id' | 'createdAt'>): Promise<void> {
    return this.exclusive(() => {
      const reservation = this.reservations.get(reservationId)
      if (!reservation || reservation.status !== 'reserved') return
      reservation.status = 'committed'
      reservation.output = output
      if (history?.userId) {
        const id = randomUUID()
        this.history.set(id, { ...history, id, createdAt: new Date().toISOString() })
      }
    })
  }

  async used(accountId: string, period: string) {
    return this.balances.get(`${accountId}:${period}`)?.used ?? 0
  }

  private remaining(accountId: string, period: string, allowance: number) {
    return Math.max(0, allowance - (this.balances.get(`${accountId}:${period}`)?.used ?? 0))
  }

  markEvent(id: string): Promise<'new' | 'duplicate'> {
    return this.exclusive(() => {
      if (this.events.has(id)) return 'duplicate'
      this.events.add(id)
      return 'new'
    })
  }

  async getSubscription(userId: string) {
    return this.subscriptions.get(userId) ?? null
  }

  async getSubscriptionByCreemId(creemSubscriptionId: string) {
    const userId = this.subscriptionsByCreem.get(creemSubscriptionId)
    return userId ? this.subscriptions.get(userId) ?? null : null
  }

  saveSubscription(record: SubscriptionRecord): Promise<void> {
    return this.exclusive(() => {
      this.subscriptions.set(record.userId, record)
      if (record.creemSubscriptionId) this.subscriptionsByCreem.set(record.creemSubscriptionId, record.userId)
    })
  }

  markExport(checkoutId: string, status: 'paid' | 'refunded'): Promise<void> {
    return this.exclusive(() => {
      if (this.exports.get(checkoutId) === 'refunded' && status === 'paid') return
      this.exports.set(checkoutId, status)
    })
  }

  releaseEvent(id: string) {
    return this.exclusive(() => {
      this.events.delete(id)
    })
  }

  grantDocumentExport(input: { checkoutId: string; requestId?: string | null }) {
    return this.exclusive(() => {
      const attempt =
        (input.requestId ? this.attempts.get(input.requestId) : undefined) ||
        [...this.attempts.values()].find((row) => row.checkoutId === input.checkoutId)
      if (this.exports.get(input.checkoutId) === 'refunded' || attempt?.status === 'refunded') {
        if (attempt) {
          attempt.status = 'refunded'
          attempt.checkoutId = attempt.checkoutId || input.checkoutId
        }
        this.exports.set(input.checkoutId, 'refunded')
        return { granted: false as const, reason: 'refunded' as const }
      }
      if (input.requestId && !attempt) throw new Error('export checkout is not linked')
      if (attempt) {
        attempt.status = 'paid'
        attempt.checkoutId = attempt.checkoutId || input.checkoutId
        this.exports.set(input.checkoutId, 'paid')
        return { granted: true as const, documentId: attempt.documentId }
      }
      this.exports.set(input.checkoutId, 'paid')
      return { granted: true as const, legacy: true as const }
    })
  }

  revokeDocumentExport(checkoutId: string) {
    return this.exclusive(() => {
      this.exports.set(checkoutId, 'refunded')
      for (const attempt of this.attempts.values()) {
        if (attempt.checkoutId === checkoutId) attempt.status = 'refunded'
      }
    })
  }

  beginSubscriptionCheckout(userId: string, plan: 'creator' | 'pro', now = new Date()) {
    return this.exclusive(() => {
      const subscription = this.subscriptions.get(userId)
      if (subscription && blocksAnotherSubscription(subscription.status, subscription.currentPeriodEnd, now)) {
        return { state: 'blocked' as const }
      }
      const live = [...this.subscriptionAttempts.values()].find(
        (row) => row.userId === userId && (row.status === 'creating' || row.status === 'open'),
      )
      if (live) {
        return {
          state: live.status,
          requestId: live.id,
          plan: live.plan,
          checkoutId: live.checkoutId,
          checkoutUrl: live.checkoutUrl,
        }
      }
      const id = randomUUID()
      this.subscriptionAttempts.set(id, { id, userId, plan, status: 'creating', checkoutId: null, checkoutUrl: null })
      return { state: 'created' as const, requestId: id, plan, checkoutId: null, checkoutUrl: null }
    })
  }

  attachSubscriptionCheckout(requestId: string, checkoutId: string, checkoutUrl: string) {
    return this.exclusive(() => {
      const row = this.subscriptionAttempts.get(requestId)
      if (!row || row.status !== 'creating' || row.checkoutId) return row ?? null
      row.checkoutId = checkoutId
      row.checkoutUrl = checkoutUrl
      row.status = 'open'
      return row
    })
  }

  consumeSubscriptionCheckout(userId: string) {
    return this.exclusive(() => {
      for (const row of this.subscriptionAttempts.values()) {
        if (row.userId === userId && (row.status === 'creating' || row.status === 'open')) row.status = 'consumed'
      }
    })
  }

  saveExportDocument(input: { userId: string; letter: string; title?: string; contact?: Record<string, string>; generationId?: string | null }) {
    return this.exclusive(() => {
      const id = randomUUID()
      this.documents.set(id, {
        id,
        userId: input.userId,
        letter: input.letter,
        title: input.title || 'Cover letter',
        contact: input.contact || {},
        sourceGenerationId: input.generationId || null,
      })
      return id
    })
  }

  getExportDocument(userId: string, id: string) {
    const row = this.documents.get(id)
    if (!row || row.userId !== userId) return null
    return row
  }

  updateExportContact(userId: string, id: string, contact: Record<string, string>) {
    return this.exclusive(() => {
      const row = this.documents.get(id)
      if (!row || row.userId !== userId) return false
      row.contact = contact
      return true
    })
  }

  beginExportCheckout(userId: string, documentId: string) {
    return this.exclusive(() => {
      const doc = this.documents.get(documentId)
      if (!doc || doc.userId !== userId) return { state: 'forbidden' as const }
      const live = [...this.attempts.values()].find(
        (row) => row.documentId === documentId && (row.status === 'creating' || row.status === 'open' || row.status === 'paid'),
      )
      if (live) {
        return {
          state: live.status as 'creating' | 'open' | 'paid',
          requestId: live.id,
          documentId,
          checkoutId: live.checkoutId,
          checkoutUrl: live.checkoutUrl,
        }
      }
      const id = randomUUID()
      this.attempts.set(id, { id, documentId, userId, status: 'creating', checkoutId: null, checkoutUrl: null })
      return { state: 'created' as const, requestId: id, documentId, checkoutId: null, checkoutUrl: null }
    })
  }

  attachExportCheckout(requestId: string, checkoutId: string, checkoutUrl: string) {
    return this.exclusive(() => {
      const row = this.attempts.get(requestId)
      if (!row) return null
      if (row.status === 'creating' && !row.checkoutId) {
        row.checkoutId = checkoutId
        row.checkoutUrl = checkoutUrl
        row.status = 'open'
      }
      return row
    })
  }

  listPaidDocuments(userId: string) {
    return [...this.attempts.values()]
      .filter((row) => row.userId === userId && row.status === 'paid')
      .filter((row) => !(row.checkoutId && this.exports.get(row.checkoutId) === 'refunded'))
      .map((row) => ({ id: row.documentId, title: this.documents.get(row.documentId)?.title || 'Cover letter' }))
  }

  isDocumentPaid(userId: string, documentId: string) {
    const attempt = [...this.attempts.values()].find(
      (row) => row.documentId === documentId && row.userId === userId && row.status === 'paid',
    )
    if (!attempt) return false
    if (attempt.checkoutId && this.exports.get(attempt.checkoutId) === 'refunded') return false
    return true
  }

  confirmExportPayment(checkoutId: string, requestId?: string | null) {
    return this.exclusive(() => {
      if (this.exports.get(checkoutId) === 'refunded') return { granted: false as const, reason: 'refunded' }
      const attempt =
        (requestId ? this.attempts.get(requestId) : undefined) ||
        [...this.attempts.values()].find((row) => row.checkoutId === checkoutId)
      if (!attempt || attempt.status === 'refunded') return { granted: false as const, reason: 'unbound' }
      attempt.status = 'paid'
      attempt.checkoutId = attempt.checkoutId || checkoutId
      this.exports.set(checkoutId, 'paid')
      return { granted: true as const, documentId: attempt.documentId, scope: 'document' as const }
    })
  }

  ensurePaidBucket(accountId: string, allowance: number): Promise<void> {
    return this.exclusive(() => {
      const key = `${accountId}:2000-01-01`
      const existing = this.balances.get(key)
      if (!existing) this.balances.set(key, { allowance, used: 0 })
      else existing.allowance = Math.max(existing.allowance, allowance)
    })
  }

  async isExportRevoked(checkoutId: string) {
    return this.exports.get(checkoutId) === 'refunded'
  }

  async listHistory(userId: string): Promise<HistoryRecord[]> {
    return [...this.history.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async getHistory(userId: string, id: string) {
    const row = this.history.get(id)
    if (!row || row.userId !== userId) return null
    return row
  }

  async deleteHistory(userId: string, id: string) {
    const row = this.history.get(id)
    if (!row || row.userId !== userId) return false
    this.history.delete(id)
    for (const doc of this.documents.values()) {
      if (doc.sourceGenerationId === id) doc.sourceGenerationId = null
    }
    return true
  }
}

export function allowanceFor(plan: PlanId) {
  return PLANS[plan].monthlyCredits
}
