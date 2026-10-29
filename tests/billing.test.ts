import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, test } from 'node:test'
import { POST as accountPost, GET as accountGet } from '../app/api/account/route.ts'
import { POST as atsPost } from '../app/api/ats-check/route.ts'
import { POST as magicPost } from '../app/api/auth/magic-link/route.ts'
import { POST as webhookPost } from '../app/api/billing/webhook/route.ts'
import { POST as exportPost } from '../app/api/export/route.ts'
import { POST as generatePost } from '../app/api/generate/route.ts'
import { DELETE as historyDelete, GET as historyGet } from '../app/api/history/[id]/route.ts'
import { GET as historyList } from '../app/api/history/route.ts'
import { effectivePlan, utcMonthPeriod } from '../lib/billing/access.ts'
import { applyCreemEvent } from '../lib/billing/events.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import { useTestLedger } from '../lib/billing/runtime.ts'
import { creemSignatureHex } from '../lib/creem-signature.ts'
import { ENTITLEMENT_COOKIE, sealEntitlement } from '../lib/entitlement.ts'
import { CREDIT_COSTS, PLANS, PRO_EXPORT } from '../lib/plans.ts'
import { resetRateLimit } from '../lib/request-guard.ts'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const CREATOR = 'prod_creator_test'
const EXPORT_PRODUCT = 'prod_export_test'
const SECRET = 'webhook-secret-test'
const RESUME = 'Alex Chen, product manager. Eight years shipping B2B analytics and leading six analysts. '
const JOB = 'Product manager role. Ship analytics, lead a team, and write requirements with SQL stakeholders. '

let ledger: MemoryLedger
let previousFetch: typeof fetch
const envKeys = ['EZCL_BILLING_TEST', 'DEEPSEEK_API_KEY', 'ENTITLEMENT_SECRET', 'CREEM_WEBHOOK_SECRET', 'CREEM_API_KEY', 'CREEM_API_URL', 'CREEM_PRODUCT_ID', 'CREEM_CREATOR_PRODUCT_ID', 'CREEM_PRO_PRODUCT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const previous: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of envKeys) previous[key] = process.env[key]
  previousFetch = globalThis.fetch
  ledger = new MemoryLedger()
  process.env.EZCL_BILLING_TEST = '1'
  process.env.ENTITLEMENT_SECRET = 'test-entitlement-secret-not-a-real-key'
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key-not-real'
  process.env.CREEM_WEBHOOK_SECRET = SECRET
  process.env.CREEM_CREATOR_PRODUCT_ID = CREATOR
  process.env.CREEM_PRO_PRODUCT_ID = 'prod_pro_test'
  process.env.CREEM_PRODUCT_ID = EXPORT_PRODUCT
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  useTestLedger(ledger)
  resetRateLimit()
})

afterEach(() => {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key]
    else process.env[key] = previous[key]
  }
  useTestLedger(null)
  globalThis.fetch = previousFetch
  resetRateLimit()
})

function atsBody(ip: string, user?: string) {
  const headers = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': ip })
  if (user) headers.set('x-ezcl-user', `user:${user}`)
  return new Request('https://www.ezcoverletter.xyz/api/ats-check', {
    method: 'POST',
    headers,
    body: JSON.stringify({ resume: RESUME, job: JOB }),
  })
}

function mockAts() {
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify({
      overview: 'Leadership is covered and SQL is missing from the resume.',
      keywordCoverage: [{ keyword: 'SQL', status: 'missing' }],
      missingKeywords: ['SQL'],
      structureIssues: ['Skills are buried.'],
      readabilityIssues: ['The summary is long.'],
      suggestions: ['Name SQL only if it is true.'],
    }) } }],
  })
}

test('plan prices and credit weights live in one config', () => {
  assert.equal(PLANS.free.monthlyPriceUsd, 0)
  assert.equal(PLANS.free.monthlyCredits, 10)
  assert.equal(PLANS.creator.monthlyPriceUsd, 9)
  assert.equal(PLANS.creator.monthlyCredits, 100)
  assert.equal(PLANS.pro.monthlyPriceUsd, 19)
  assert.equal(PLANS.pro.monthlyCredits, 300)
  assert.equal(PRO_EXPORT.priceUsd, 4.99)
  assert.equal(CREDIT_COSTS['resume-optimizer'], 2)
  assert.equal(CREDIT_COSTS['interview-reply'], 1)
  assert.equal(utcMonthPeriod(new Date('2026-10-29T23:30:00Z')), '2026-10-01')
})

test('anonymous free allowance stops at ten and a short request is not charged', async () => {
  mockAts()
  const rejected = await atsPost(new Request('https://www.ezcoverletter.xyz/api/ats-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.70' },
    body: JSON.stringify({ resume: 'short', job: JOB }),
  }))
  assert.equal(rejected.status, 400)
  assert.equal(await ledger.used('anon:test-anon', utcMonthPeriod()), 0)

  for (let i = 0; i < 10; i += 1) {
    const response = await atsPost(atsBody(`203.0.113.${i + 10}`))
    assert.equal(response.status, 200)
  }
  const blocked = await atsPost(atsBody('203.0.113.89'))
  assert.equal(blocked.status, 402)
  assert.equal(await ledger.used('anon:test-anon', utcMonthPeriod()), 10)
})

test('concurrent reserves cannot pass the allowance', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => ledger.reserve({
    accountId: 'anon:race',
    period: '2026-10-01',
    cost: 1,
    allowance: 5,
    action: 'job-match',
  })))
  assert.equal(results.filter((item) => item.ok).length, 5)
  assert.equal(await ledger.used('anon:race', '2026-10-01'), 5)
})

test('a failed model call refunds the credit', async () => {
  globalThis.fetch = async () => { throw new Error('upstream down') }
  const response = await atsPost(atsBody('203.0.113.90'))
  assert.equal(response.status, 502)
  assert.equal(await ledger.used('anon:test-anon', utcMonthPeriod()), 0)
})

test('the same idempotency key does not charge twice', async () => {
  mockAts()
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.91', 'idempotency-key': 'idem-key-1234' }
  const first = await atsPost(new Request('https://www.ezcoverletter.xyz/api/ats-check', { method: 'POST', headers, body: JSON.stringify({ resume: RESUME, job: JOB }) }))
  const second = await atsPost(new Request('https://www.ezcoverletter.xyz/api/ats-check', { method: 'POST', headers, body: JSON.stringify({ resume: RESUME, job: JOB }) }))
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(await ledger.used('anon:test-anon', utcMonthPeriod()), 1)
})

test('webhook signature, duplicates, expiry, cancellation, and one-time export stay separate', async () => {
  const products = { oneTimeProductId: EXPORT_PRODUCT, creatorProductId: CREATOR, proProductId: 'prod_pro_test' }
  const paid = {
    id: 'evt_paid_1',
    eventType: 'subscription.paid',
    object: {
      id: 'sub_paid123',
      status: 'active',
      product: { id: CREATOR },
      current_period_end_date: '2099-01-01T00:00:00.000Z',
      metadata: { userId: USER_A },
    },
  }
  const raw = JSON.stringify(paid)
  const bad = await webhookPost(new Request('https://www.ezcoverletter.xyz/api/billing/webhook', {
    method: 'POST',
    headers: { 'creem-signature': '00' },
    body: raw,
  }))
  assert.equal(bad.status, 401)
  assert.equal(await ledger.getSubscription(USER_A), null)

  const good = await webhookPost(new Request('https://www.ezcoverletter.xyz/api/billing/webhook', {
    method: 'POST',
    headers: { 'creem-signature': creemSignatureHex(raw, SECRET) },
    body: raw,
  }))
  const again = await webhookPost(new Request('https://www.ezcoverletter.xyz/api/billing/webhook', {
    method: 'POST',
    headers: { 'creem-signature': creemSignatureHex(raw, SECRET) },
    body: raw,
  }))
  assert.equal(good.status, 200)
  assert.equal(again.status, 200)
  assert.equal((await ledger.getSubscription(USER_A))?.plan, 'creator')

  await applyCreemEvent(ledger, {
    id: 'evt_export',
    eventType: 'checkout.completed',
    object: { id: 'chk_export_1', status: 'completed', product: { id: EXPORT_PRODUCT }, order: { status: 'paid' }, metadata: { userId: USER_A, plan: 'pro' } },
  }, products)
  assert.equal((await ledger.getSubscription(USER_A))?.plan, 'creator')

  await applyCreemEvent(ledger, {
    id: 'evt_cancel',
    eventType: 'subscription.scheduled_cancel',
    object: { id: 'sub_paid123', status: 'scheduled_cancel', product: { id: CREATOR }, current_period_end_date: '2099-01-01T00:00:00.000Z', metadata: { userId: USER_A } },
  }, products)
  assert.equal(effectivePlan(await ledger.getSubscription(USER_A), new Date('2026-10-29T00:00:00Z')).plan, 'creator')

  await applyCreemEvent(ledger, {
    id: 'evt_expired',
    eventType: 'subscription.expired',
    object: { id: 'sub_paid123', status: 'expired', product: { id: CREATOR }, current_period_end_date: '2020-01-01T00:00:00.000Z', metadata: { userId: USER_A } },
  }, products)
  assert.equal(effectivePlan(await ledger.getSubscription(USER_A), new Date('2026-10-29T00:00:00Z')).plan, 'free')
})

test('payment failure removes paid credits and a refund does not invent export access', async () => {
  const products = { oneTimeProductId: EXPORT_PRODUCT, creatorProductId: CREATOR, proProductId: 'prod_pro_test' }
  await applyCreemEvent(ledger, {
    id: 'evt_due',
    eventType: 'subscription.past_due',
    object: { id: 'sub_due123', status: 'past_due', product: { id: 'prod_pro_test' }, current_period_end_date: '2099-01-01T00:00:00.000Z', metadata: { userId: USER_A } },
  }, products)
  assert.equal(effectivePlan(await ledger.getSubscription(USER_A)).plan, 'free')
  assert.match(effectivePlan(await ledger.getSubscription(USER_A)).message, /payment failed/i)

  process.env.CREEM_API_KEY = 'test-creem-key'
  process.env.CREEM_API_URL = 'https://test-api.creem.io'
  const token = sealEntitlement('chk_export_1', EXPORT_PRODUCT)
  assert.ok(token)
  const open = await exportPost(new Request('https://www.ezcoverletter.xyz/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${ENTITLEMENT_COOKIE}=${encodeURIComponent(token)}` },
    body: JSON.stringify({ format: 'word', letter: 'I led the analytics rollout.', contact: { fullName: 'Alex Chen', phone: '+1 555 0100', email: 'alex@example.com', linkedin: 'https://linkedin.com/in/alex' } }),
  }))
  assert.equal(open.status, 200)
  await ledger.markExport('chk_export_1', 'refunded')
  const closed = await exportPost(new Request('https://www.ezcoverletter.xyz/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${ENTITLEMENT_COOKIE}=${encodeURIComponent(token)}` },
    body: JSON.stringify({ format: 'word', letter: 'I led the analytics rollout.', contact: { fullName: 'Alex Chen', phone: '+1 555 0100', email: 'alex@example.com', linkedin: 'https://linkedin.com/in/alex' } }),
  }))
  assert.equal(closed.status, 401)
})

test('users cannot read or delete each other history', async () => {
  mockAts()
  const created = await atsPost(atsBody('203.0.113.92', USER_A))
  assert.equal(created.status, 200)
  const own = await historyList(new Request('https://www.ezcoverletter.xyz/api/history', { headers: { 'x-ezcl-user': `user:${USER_A}` } }))
  const ownBody = await own.json()
  assert.equal(ownBody.rows.length, 1)
  const other = await historyGet(new Request('https://www.ezcoverletter.xyz/api/history/x', { headers: { 'x-ezcl-user': `user:${USER_B}` } }), { params: Promise.resolve({ id: ownBody.rows[0].id }) })
  assert.equal(other.status, 404)
  const removed = await historyDelete(new Request('https://www.ezcoverletter.xyz/api/history/x', { method: 'DELETE', headers: { 'x-ezcl-user': `user:${USER_B}` } }), { params: Promise.resolve({ id: ownBody.rows[0].id }) })
  assert.equal(removed.status, 404)
  assert.equal((await ledger.listHistory(USER_A)).length, 1)
  const anon = await historyList(new Request('https://www.ezcoverletter.xyz/api/history'))
  assert.equal(anon.status, 401)
})

test('database and sign-in stay closed when they are not configured', async () => {
  delete process.env.EZCL_BILLING_TEST
  useTestLedger(null)
  globalThis.fetch = async () => { throw new Error('network') }
  const generated = await generatePost(new Request('https://www.ezcoverletter.xyz/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resume: RESUME, job: JOB, tone: 'natural' }),
  }))
  assert.equal(generated.status, 503)
  const login = await magicPost(new Request('https://www.ezcoverletter.xyz/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com' }),
  }))
  const loginBody = await login.json()
  assert.equal(login.status, 503)
  assert.equal(loginBody.access_token, undefined)
  const forged = await accountPost()
  assert.equal(forged.status, 405)
  const account = await accountGet(new Request('https://www.ezcoverletter.xyz/api/account?plan=pro'))
  assert.equal(account.status, 503)
})

test('RLS policies and the atomic credit update are in the migration', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261029_accounts_billing.sql', import.meta.url), 'utf8')
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /generations_select_own[\s\S]*auth\.uid\(\)/)
  assert.match(sql, /generations_delete_own[\s\S]*auth\.uid\(\)/)
  assert.match(sql, /used \+ p_cost <= allowance/)
  assert.match(sql, /revoke all on public\.credit_balances from anon, authenticated/)
  assert.doesNotMatch(sql, /for select to anon/i)
})
