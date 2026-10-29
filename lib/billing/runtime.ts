import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { effectivePlan, utcMonthPeriod } from '@/lib/billing/access'
import { PAID_PERIOD, keepsPaidAccess, legacyCycleId, nextUtcMonthStart, paidAccountId } from '@/lib/billing/cycle'
import { MemoryLedger, allowanceFor, type HistoryRecord, type SubscriptionRecord } from '@/lib/billing/ledger'
import { CREDIT_COSTS, QUOTA_MESSAGE, SIGN_IN_UNAVAILABLE, USAGE_UNAVAILABLE, type CreditAction } from '@/lib/plans'
import { entitlementSecret, readRequestCookie } from '@/lib/entitlement'
import { createSupabaseLedger } from '@/lib/billing/supabase-ledger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteOwnGeneration, readSupabaseAuth, selectOwnGeneration, selectOwnGenerations, supabaseServiceClient, userFromRequest } from '@/lib/supabase/server'

export const ANON_COOKIE = 'ezcl_anon'

export type UsageMeta = {
  tool: string
  title: string
  input?: unknown
}

export type UsageStart =
  | {
      ok: true
      cookies: string[]
      replay?: unknown
      commit: (output: unknown) => Promise<void>
      refund: () => Promise<void>
    }
  | { ok: false; status: number; error: string; code: string; cookies: string[] }

let testLedger: MemoryLedger | null = null

export function testingBilling() {
  return process.env.NODE_ENV !== 'production' && process.env.EZCL_BILLING_TEST === '1'
}

export function useTestLedger(ledger: MemoryLedger | null) {
  if (process.env.NODE_ENV === 'production') throw new Error('test ledger refused')
  testLedger = ledger
}

export function getLedger() {
  if (testingBilling()) return testLedger
  return createSupabaseLedger()
}

export function getTestLedger() {
  return testingBilling() && testLedger instanceof MemoryLedger ? testLedger : null
}

function signAnon(id: string) {
  const secret = entitlementSecret()
  if (!secret) return null
  const body = Buffer.from(JSON.stringify({ v: 1, id })).toString('base64url')
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

function openAnon(token: string | null) {
  const secret = entitlementSecret()
  if (!secret || !token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { v?: number; id?: string }
    if (parsed.v !== 1 || !parsed.id) return null
    return parsed.id
  } catch {
    return null
  }
}

function anonCookie(token: string) {
  return `${ANON_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=34560000`
}

type Identity =
  | { kind: 'user'; userId: string; email: string | null; cookies: string[]; client: SupabaseClient | null }
  | { kind: 'anon'; anonId: string; cookies: string[] }

async function identify(req: Request): Promise<Identity | null> {
  if (testingBilling()) {
    const header = req.headers.get('x-ezcl-user') || ''
    if (header.startsWith('user:')) return { kind: 'user', userId: header.slice(5), email: null, cookies: [], client: null }
    if (header.startsWith('anon:')) return { kind: 'anon', anonId: header.slice(5), cookies: [] }
    return { kind: 'anon', anonId: 'test-anon', cookies: [] }
  }

  const user = await userFromRequest(req)
  if (user) return { kind: 'user', userId: user.id, email: user.email, cookies: user.cookies, client: user.client }
  const existing = openAnon(readRequestCookie(req, ANON_COOKIE))
  if (existing) return { kind: 'anon', anonId: existing, cookies: [] }
  const token = signAnon(randomUUID())
  if (!token) return null
  return { kind: 'anon', anonId: openAnon(token) || '', cookies: [anonCookie(token)] }
}

export async function accountSnapshot(req: Request, now = new Date()) {
  const ledger = getLedger()
  if (!ledger) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: [] as string[] }
  const identity = await identify(req)
  if (!identity || (identity.kind === 'anon' && !identity.anonId)) {
    return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: [] }
  }
  const subscription = identity.kind === 'user' ? await ledger.getSubscription(identity.userId) : null
  const access = effectivePlan(subscription, now)
  const bucket = creditBucket(identity, subscription, access.plan, now)
  const used = await ledger.used(bucket.accountId, bucket.period)
  const history =
    identity.kind !== 'user'
      ? []
      : identity.client
        ? await sessionHistory(identity.client, identity.userId)
        : testLedger
          ? (await testLedger.listHistory(identity.userId)).map(summarize)
          : null
  if (!history) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: identity.cookies }
  return {
    ok: true as const,
    cookies: identity.cookies,
    snapshot: {
      signedIn: identity.kind === 'user',
      userId: identity.kind === 'user' ? identity.userId : null,
      email: identity.kind === 'user' ? identity.email : null,
      plan: access.plan,
      status: access.status,
      message: access.message,
      allowance: bucket.allowance,
      used,
      remaining: Math.max(0, bucket.allowance - used),
      periodStart: bucket.periodLabel,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      resetAt: bucket.resetAt,
      scheduledPlan: subscription?.scheduledPlan ?? null,
      history,
      purchases: identity.kind === 'user' ? await paidDocuments(identity.userId) : [],
    },
  }
}

async function paidDocuments(userId: string) {
  if (testingBilling()) return getTestLedger()?.listPaidDocuments(userId) ?? []
  const client = supabaseServiceClient()
  if (!client) return []
  const purchases = await client.from('one_time_purchases').select('document_id').eq('user_id', userId).eq('status', 'paid')
  const ids = (purchases.data ?? []).map((row) => row.document_id).filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return []
  const documents = await client.from('export_documents').select('id, title').in('id', ids).eq('user_id', userId)
  return (documents.data ?? []).map((row) => ({ id: String(row.id), title: String(row.title || 'Cover letter') }))
}

function summarize(row: HistoryRecord) {
  return { id: row.id, tool: row.tool, title: row.title, createdAt: row.createdAt }
}

function creditBucket(
  identity: Identity,
  subscription: SubscriptionRecord | null,
  plan: 'free' | 'creator' | 'pro',
  now: Date,
) {
  if (
    identity.kind === 'user' &&
    subscription &&
    keepsPaidAccess(subscription.status, subscription.currentPeriodEnd, now)
  ) {
    const cycleId =
      subscription.cycleId ||
      (subscription.currentPeriodEnd
        ? legacyCycleId(subscription.creemSubscriptionId, subscription.currentPeriodEnd)
        : null)
    if (cycleId) {
      return {
        accountId: paidAccountId(identity.userId, subscription.creemSubscriptionId, cycleId),
        period: PAID_PERIOD,
        periodLabel: subscription.periodStart || subscription.currentPeriodEnd || PAID_PERIOD,
        allowance: allowanceFor(plan),
        resetAt: subscription.currentPeriodEnd,
      }
    }
  }
  const period = utcMonthPeriod(now)
  return {
    accountId: identity.kind === 'user' ? `user:${identity.userId}` : `anon:${identity.anonId}`,
    period,
    periodLabel: period,
    allowance: allowanceFor('free'),
    resetAt: nextUtcMonthStart(now),
  }
}

async function consumeSignedInCredit(userId: string, cost: number, action: string, idempotencyKey: string, now: Date) {
  const client = supabaseServiceClient()
  if (!client) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, code: 'not_configured' }
  const { data, error } = await client.rpc('consume_ai_credit', {
    p_user_id: userId,
    p_cost: cost,
    p_action: action,
    p_idempotency_key: idempotencyKey,
    p_now: now.toISOString(),
  })
  if (error || !data || typeof data !== 'object') {
    return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, code: 'not_configured' }
  }
  const row = data as { ok?: boolean; code?: string; reservationId?: string; replay?: boolean; output?: unknown }
  if (!row.ok) {
    const code = row.code === 'in_progress' || row.code === 'replay_failed' ? row.code : 'quota'
    const message =
      code === 'quota'
        ? QUOTA_MESSAGE
        : code === 'in_progress'
          ? 'This request is already running.'
          : 'The previous attempt failed and was not charged. Start a new request to try again.'
    return { ok: false as const, status: code === 'quota' ? 402 : 409, error: message, code }
  }
  return { ok: true as const, reservationId: String(row.reservationId), replay: row.replay ? row.output : undefined }
}

function finishUsage(
  ledger: NonNullable<ReturnType<typeof getLedger>>,
  identity: Identity,
  meta: UsageMeta,
  reservationId: string,
  replay: unknown,
): UsageStart {
  const userId = identity.kind === 'user' ? identity.userId : ''
  return {
    ok: true,
    cookies: identity.cookies,
    replay,
    commit: (output) =>
      ledger.commit(
        reservationId,
        output,
        userId
          ? { userId, tool: meta.tool, title: meta.title.slice(0, 120), input: meta.input ?? null, output }
          : undefined,
      ),
    refund: () => ledger.refund(reservationId),
  }
}

async function sessionHistory(client: SupabaseClient, userId: string) {
  const rows = await selectOwnGenerations(client, userId)
  if (!rows) return null
  return rows.map(summarize)
}

export async function beginAiUsage(req: Request, action: CreditAction, meta: UsageMeta, now = new Date()): Promise<UsageStart> {
  const ledger = getLedger()
  if (!ledger) return { ok: false, status: 503, error: USAGE_UNAVAILABLE, code: 'not_configured', cookies: [] }
  const identity = await identify(req)
  if (!identity || (identity.kind === 'anon' && !identity.anonId)) {
    return { ok: false, status: 503, error: USAGE_UNAVAILABLE, code: 'not_configured', cookies: [] }
  }
  const subscription = identity.kind === 'user' ? await ledger.getSubscription(identity.userId) : null
  const access = effectivePlan(subscription, now)
  const idempotencyKey = cleanIdempotency(req.headers.get('idempotency-key'))
  if (!testingBilling() && identity.kind === 'user') {
    const charged = await consumeSignedInCredit(identity.userId, CREDIT_COSTS[action], action, idempotencyKey, now)
    if (!charged.ok) {
      return { ok: false, status: charged.status, error: charged.error, code: charged.code, cookies: identity.cookies }
    }
    return finishUsage(ledger, identity, meta, charged.reservationId, charged.replay)
  }
  let activeSubscription = subscription
  if (
    identity.kind === 'user' &&
    activeSubscription &&
    keepsPaidAccess(activeSubscription.status, activeSubscription.currentPeriodEnd, now) &&
    !activeSubscription.cycleId &&
    activeSubscription.currentPeriodEnd
  ) {
    const cycleId = legacyCycleId(activeSubscription.creemSubscriptionId, activeSubscription.currentPeriodEnd)
    if (cycleId) {
      activeSubscription = { ...activeSubscription, cycleId }
      await ledger.saveSubscription(activeSubscription)
    }
  }
  const bucket = creditBucket(identity, activeSubscription, access.plan, now)
  const reserved = await ledger.reserve({
    accountId: bucket.accountId,
    period: bucket.period,
    cost: CREDIT_COSTS[action],
    allowance: bucket.allowance,
    action,
    idempotencyKey,
  })
  if (!reserved.ok) {
    const message =
      reserved.code === 'quota'
        ? QUOTA_MESSAGE
        : reserved.code === 'in_progress'
          ? 'This request is already running.'
          : 'The previous attempt failed and was not charged. Start a new request to try again.'
    return { ok: false, status: reserved.code === 'quota' ? 402 : 409, error: message, code: reserved.code, cookies: identity.cookies }
  }
  return finishUsage(ledger, identity, meta, reserved.reservationId, reserved.replay)
}

function cleanIdempotency(value: string | null) {
  if (!value) return ''
  const trimmed = value.trim()
  return /^[A-Za-z0-9_-]{8,80}$/.test(trimmed) ? trimmed : ''
}

export async function oneTimeExportRevoked(checkoutId: string) {
  const ledger = getLedger()
  if (!ledger) return false
  return ledger.isExportRevoked(checkoutId)
}

export async function historyFor(req: Request, id?: string) {
  if (!testingBilling()) return historyFromSession(req, id)
  const ledger = testLedger
  if (!ledger) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: [] as string[] }
  const identity = await identify(req)
  if (!identity || identity.kind !== 'user') return { ok: false as const, status: 401, error: 'Sign in to view saved results.', cookies: [] as string[] }
  if (!id) return { ok: true as const, rows: await ledger.listHistory(identity.userId), cookies: identity.cookies }
  const row = await ledger.getHistory(identity.userId, id)
  if (!row) return { ok: false as const, status: 404, error: 'That saved result was not found.', cookies: identity.cookies }
  return { ok: true as const, row, cookies: identity.cookies }
}

async function historyFromSession(req: Request, id?: string) {
  if (!readSupabaseAuth()) return { ok: false as const, status: 503, error: SIGN_IN_UNAVAILABLE, cookies: [] as string[] }
  const user = await userFromRequest(req)
  if (!user) return { ok: false as const, status: 401, error: 'Sign in to view saved results.', cookies: [] as string[] }
  if (!id) {
    const rows = await selectOwnGenerations(user.client, user.id)
    if (!rows) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: user.cookies }
    return { ok: true as const, rows, cookies: user.cookies }
  }
  const row = await selectOwnGeneration(user.client, user.id, id)
  if (row === null) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: user.cookies }
  if (!row) return { ok: false as const, status: 404, error: 'That saved result was not found.', cookies: user.cookies }
  return { ok: true as const, row, cookies: user.cookies }
}

export async function deleteHistoryFor(req: Request, id: string) {
  if (!testingBilling()) return deleteFromSession(req, id)
  const ledger = testLedger
  if (!ledger) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: [] as string[] }
  const identity = await identify(req)
  if (!identity || identity.kind !== 'user') return { ok: false as const, status: 401, error: 'Sign in to delete saved results.', cookies: [] as string[] }
  const deleted = await ledger.deleteHistory(identity.userId, id)
  if (!deleted) return { ok: false as const, status: 404, error: 'That saved result was not found.', cookies: identity.cookies }
  return { ok: true as const, cookies: identity.cookies }
}

async function deleteFromSession(req: Request, id: string) {
  if (!readSupabaseAuth()) return { ok: false as const, status: 503, error: SIGN_IN_UNAVAILABLE, cookies: [] as string[] }
  const user = await userFromRequest(req)
  if (!user) return { ok: false as const, status: 401, error: 'Sign in to delete saved results.', cookies: [] as string[] }
  const deleted = await deleteOwnGeneration(user.client, user.id, id)
  if (deleted === null) return { ok: false as const, status: 503, error: USAGE_UNAVAILABLE, cookies: user.cookies }
  if (!deleted) return { ok: false as const, status: 404, error: 'That saved result was not found.', cookies: user.cookies }
  return { ok: true as const, cookies: user.cookies }
}

export function currentTestLedger() {
  return testingBilling() ? testLedger : null
}

export type { SubscriptionRecord }
