import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { POST as subscriptionCheckout } from '../app/api/billing/checkout/route.ts'
import { POST as exportPost } from '../app/api/export/route.ts'
import { docxDocumentXml, responseBytes } from './export-bytes.ts'
import { POST as webhookPost } from '../app/api/billing/webhook/route.ts'
import { effectivePlan } from '../lib/billing/access.ts'
import { paidAccountId, PAID_PERIOD } from '../lib/billing/cycle.ts'
import { applyCreemEvent } from '../lib/billing/events.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import { useTestLedger } from '../lib/billing/runtime.ts'
import { creemSignatureHex } from '../lib/creem-signature.ts'
import { exportFailureAction } from '../lib/export-document-session.ts'
import { FORCED_SUBSCRIPTION_STATUS } from '../lib/billing/subscription-status.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const PRODUCTS = { oneTimeProductId: 'prod_export', creatorProductId: 'prod_creator', proProductId: 'prod_pro' }
const CONTACT = { fullName: 'Alex Chen', phone: '+1 555 0100', email: 'alex@example.com', linkedin: 'https://linkedin.com/in/alex' }

function paidEvent(id: string, requestId: string) {
  return {
    id,
    eventType: 'checkout.completed',
    object: {
      id: 'chk_letter',
      status: 'completed',
      request_id: requestId,
      product: { id: 'prod_export', price: 499, currency: 'USD', tax_mode: 'exclusive' },
      order: { status: 'paid', amount: 499, sub_total: 499, tax_amount: 0, amount_paid: 499, currency: 'USD' },
    },
  }
}

test('PostgreSQL function execution is not available in this environment', { skip: 'psql and Docker are not installed, so apply_billing_webhook was not executed' }, () => {})

test('a webhook payment can be refunded, and the old payment cannot restore it', async () => {
  const ledger = new MemoryLedger()
  const documentId = await ledger.saveExportDocument({ userId: USER, letter: 'Saved snapshot letter for one purchase.', title: 'Letter', contact: CONTACT })
  const attempt = await ledger.beginExportCheckout(USER, documentId)
  await applyCreemEvent(ledger, paidEvent('evt_paid', attempt.requestId || ''), PRODUCTS)
  assert.equal(await ledger.isDocumentPaid(USER, documentId), true)
  const again = await ledger.beginExportCheckout(USER, documentId)
  assert.equal(again.state, 'paid')
  assert.equal(again.checkoutId, 'chk_letter')

  await applyCreemEvent(ledger, {
    id: 'evt_refund',
    eventType: 'refund.created',
    object: { status: 'succeeded', checkout: { id: 'chk_letter', product: { id: 'prod_export' } } },
  }, PRODUCTS)
  assert.equal(await ledger.isDocumentPaid(USER, documentId), false)
  await applyCreemEvent(ledger, paidEvent('evt_paid_late', attempt.requestId || ''), PRODUCTS)
  assert.equal(await ledger.isDocumentPaid(USER, documentId), false)
  assert.equal(await ledger.isExportRevoked('chk_letter'), true)
})

test('a refund blocks only that document, and a repeated payment event does not grant it twice', async () => {
  const ledger = new MemoryLedger()
  useTestLedger(ledger)
  process.env.EZCL_BILLING_TEST = '1'
  try {
    const firstId = await ledger.saveExportDocument({ userId: USER, letter: 'First purchased letter.', title: 'First', contact: CONTACT })
    const secondId = await ledger.saveExportDocument({ userId: USER, letter: 'Second purchased letter.', title: 'Second', contact: CONTACT })
    const first = await ledger.beginExportCheckout(USER, firstId)
    const second = await ledger.beginExportCheckout(USER, secondId)
    const paid = await applyCreemEvent(ledger, {
      ...paidEvent('evt_first', first.requestId || ''),
      object: { ...paidEvent('evt_first', first.requestId || '').object, id: 'chk_first' },
    }, PRODUCTS)
    assert.equal('duplicate' in paid && paid.duplicate, false)
    const repeated = await applyCreemEvent(ledger, {
      ...paidEvent('evt_first', first.requestId || ''),
      object: { ...paidEvent('evt_first', first.requestId || '').object, id: 'chk_first' },
    }, PRODUCTS)
    assert.equal('duplicate' in repeated && repeated.duplicate, true)
    assert.equal(ledger.listPaidDocuments(USER).length, 1)

    await applyCreemEvent(ledger, {
      id: 'evt_second',
      eventType: 'checkout.completed',
      object: {
        id: 'chk_second',
        status: 'completed',
        request_id: second.requestId,
        product: { id: 'prod_export', price: 499, currency: 'USD', tax_mode: 'exclusive' },
        order: { status: 'paid', amount: 499, sub_total: 499, tax_amount: 0, amount_paid: 499, currency: 'USD' },
      },
    }, PRODUCTS)
    await applyCreemEvent(ledger, {
      id: 'evt_refund_first',
      eventType: 'refund.created',
      object: { status: 'succeeded', checkout: { id: 'chk_first', product: { id: 'prod_export' } } },
    }, PRODUCTS)
    await applyCreemEvent(ledger, {
      id: 'evt_refund_first_again',
      eventType: 'refund.created',
      object: { status: 'succeeded', checkout: { id: 'chk_first', product: { id: 'prod_export' } } },
    }, PRODUCTS)

    const refunded = await exportPost(new Request('https://www.ezcoverletter.xyz/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ezcl-user': `user:${USER}` },
      body: JSON.stringify({ format: 'pdf', documentId: firstId, contact: CONTACT }),
    }))
    assert.equal(refunded.status, 401)
    const kept = await exportPost(new Request('https://www.ezcoverletter.xyz/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ezcl-user': `user:${USER}` },
      body: JSON.stringify({ format: 'word', documentId: secondId, contact: CONTACT }),
    }))
    assert.equal(kept.status, 200)
    assert.match(docxDocumentXml(await responseBytes(kept)), /Second purchased letter/)
    assert.equal(await ledger.isDocumentPaid(USER, firstId), false)
    assert.equal(await ledger.isDocumentPaid(USER, secondId), true)
  } finally {
    useTestLedger(null)
    delete process.env.EZCL_BILLING_TEST
    delete process.env.CREEM_WEBHOOK_SECRET
    delete process.env.CREEM_PRODUCT_ID
  }
})

test('a one-time webhook with the wrong amount is not recorded', async () => {
  const ledger = new MemoryLedger()
  useTestLedger(ledger)
  process.env.EZCL_BILLING_TEST = '1'
  process.env.CREEM_WEBHOOK_SECRET = 'webhook-secret-test'
  process.env.CREEM_PRODUCT_ID = 'prod_export'
  try {
    const documentId = await ledger.saveExportDocument({ userId: USER, letter: 'Unpaid amount letter.', title: 'Amount', contact: CONTACT })
    const attempt = await ledger.beginExportCheckout(USER, documentId)
    const raw = JSON.stringify({
      id: 'evt_wrong_amount',
      eventType: 'checkout.completed',
      object: {
        id: 'chk_wrong_amount',
        status: 'completed',
        request_id: attempt.requestId,
        product: { id: 'prod_export', price: 499, currency: 'USD', tax_mode: 'exclusive' },
        order: { status: 'paid', amount: 499, sub_total: 499, tax_amount: 0, amount_paid: 100, currency: 'USD' },
      },
    })
    const response = await webhookPost(new Request('https://www.ezcoverletter.xyz/api/billing/webhook', {
      method: 'POST',
      headers: { 'creem-signature': creemSignatureHex(raw, 'webhook-secret-test') },
      body: raw,
    }))
    assert.equal(response.status, 400)
    assert.equal(await ledger.isDocumentPaid(USER, documentId), false)

    const validRaw = JSON.stringify({
      id: 'evt_taxed',
      eventType: 'checkout.completed',
      object: {
        id: 'chk_wrong_amount',
        status: 'completed',
        request_id: attempt.requestId,
        product: { id: 'prod_export', price: 499, currency: 'USD', tax_mode: 'exclusive' },
        order: { status: 'paid', amount: 499, sub_total: 499, tax_amount: 40, amount_paid: 539, currency: 'USD' },
      },
    })
    const accepted = await webhookPost(new Request('https://www.ezcoverletter.xyz/api/billing/webhook', {
      method: 'POST',
      headers: { 'creem-signature': creemSignatureHex(validRaw, 'webhook-secret-test') },
      body: validRaw,
    }))
    assert.equal(accepted.status, 200)
    assert.equal(await ledger.isDocumentPaid(USER, documentId), true)
  } finally {
    useTestLedger(null)
    delete process.env.EZCL_BILLING_TEST
    delete process.env.CREEM_WEBHOOK_SECRET
    delete process.env.CREEM_PRODUCT_ID
  }
})

test('an unverified checkout and a subscription without a user are not treated as success', async () => {
  const ledger = new MemoryLedger()
  await assert.rejects(() => applyCreemEvent(ledger, {
    id: 'evt_pending',
    eventType: 'checkout.completed',
    object: { id: 'chk_pending', status: 'completed', product: { id: 'prod_export' } },
  }, PRODUCTS))
  assert.equal(await ledger.isExportRevoked('chk_pending'), false)

  await assert.rejects(() => applyCreemEvent(ledger, {
    id: 'evt_nolink',
    eventType: 'subscription.paid',
    object: {
      id: 'sub_nolink',
      status: 'active',
      product: { id: 'prod_creator' },
      current_period_end_date: '2099-02-01T00:00:00Z',
    },
  }, PRODUCTS))
  assert.equal(await ledger.getSubscription(USER), null)
  await applyCreemEvent(ledger, {
    id: 'evt_nolink',
    eventType: 'subscription.paid',
    object: {
      id: 'sub_nolink',
      status: 'active',
      product: { id: 'prod_creator' },
      current_period_end_date: '2099-02-01T00:00:00Z',
      metadata: { userId: USER },
    },
  }, PRODUCTS)
  assert.equal((await ledger.getSubscription(USER))?.plan, 'creator')
})

test('paid, past_due, resume, cancel, and expiry follow the event type when object status lags', async () => {
  const ledger = new MemoryLedger()
  const period = {
    id: 'sub_cycle',
    product: { id: 'prod_creator' },
    current_period_start_date: '2099-01-01T00:00:00Z',
    current_period_end_date: '2099-02-01T00:00:00Z',
    last_transaction_id: 'tran_cycle',
    metadata: { userId: USER },
  }
  await applyCreemEvent(ledger, { id: 'evt_open', eventType: 'subscription.paid', object: { ...period, status: 'active' } }, PRODUCTS)
  const opened = await ledger.getSubscription(USER)
  assert.ok(opened?.cycleId)
  const bucket = paidAccountId(USER, 'sub_cycle', opened?.cycleId || '')
  const reserved = await ledger.reserve({ accountId: bucket, period: PAID_PERIOD, cost: 1, allowance: 100, action: 'cover-letter' })
  assert.equal(reserved.ok, true)

  await applyCreemEvent(ledger, { id: 'evt_due', eventType: 'subscription.past_due', object: { ...period, status: 'active' } }, PRODUCTS)
  assert.equal(effectivePlan(await ledger.getSubscription(USER)).plan, 'free')
  assert.equal(await ledger.used(bucket, PAID_PERIOD), 1)

  await applyCreemEvent(ledger, { id: 'evt_resume', eventType: 'subscription.paid', object: { ...period, status: 'active' } }, PRODUCTS)
  assert.equal(effectivePlan(await ledger.getSubscription(USER)).plan, 'creator')
  assert.equal((await ledger.getSubscription(USER))?.cycleId, opened?.cycleId)
  assert.equal(await ledger.used(bucket, PAID_PERIOD), 1)

  await applyCreemEvent(ledger, { id: 'evt_cancel', eventType: 'subscription.scheduled_cancel', object: { ...period, status: 'active' } }, PRODUCTS)
  assert.equal(effectivePlan(await ledger.getSubscription(USER), new Date('2099-01-15T00:00:00Z')).plan, 'creator')

  await applyCreemEvent(ledger, { id: 'evt_end', eventType: 'subscription.expired', object: { ...period, status: 'active', current_period_end_date: '2020-01-01T00:00:00Z' } }, PRODUCTS)
  assert.equal(effectivePlan(await ledger.getSubscription(USER)).plan, 'free')
})

test('same-cycle upgrade keeps the bucket and a lower product does not become a local downgrade', async () => {
  const ledger = new MemoryLedger()
  const period = {
    id: 'sub_up',
    current_period_start_date: '2099-01-01T00:00:00Z',
    current_period_end_date: '2099-02-01T00:00:00Z',
    last_transaction_id: 'tran_up',
    metadata: { userId: USER },
  }
  await applyCreemEvent(ledger, { id: 'evt_creator', eventType: 'subscription.paid', object: { ...period, status: 'active', product: { id: 'prod_creator' } } }, PRODUCTS)
  const cycleId = (await ledger.getSubscription(USER))?.cycleId
  await applyCreemEvent(ledger, { id: 'evt_pro', eventType: 'subscription.update', object: { ...period, status: 'active', product: { id: 'prod_pro' } } }, PRODUCTS)
  const upgraded = await ledger.getSubscription(USER)
  assert.equal(upgraded?.plan, 'pro')
  assert.equal(upgraded?.cycleId, cycleId)
  assert.equal(upgraded?.scheduledPlan ?? null, null)
  await applyCreemEvent(ledger, { id: 'evt_down', eventType: 'subscription.update', object: { ...period, status: 'active', product: { id: 'prod_creator' } } }, PRODUCTS)
  assert.equal((await ledger.getSubscription(USER))?.plan, 'pro')
  assert.equal((await ledger.getSubscription(USER))?.scheduledPlan ?? null, null)
})

test('one document keeps a single checkout and a paid export serves the saved snapshot', async () => {
  const ledger = new MemoryLedger()
  useTestLedger(ledger)
  process.env.EZCL_BILLING_TEST = '1'
  try {
    const documentId = await ledger.saveExportDocument({
      userId: USER,
      letter: 'Saved snapshot letter for one purchase.',
      title: 'Letter',
      contact: CONTACT,
    })
    const [first, second] = await Promise.all([
      ledger.beginExportCheckout(USER, documentId),
      ledger.beginExportCheckout(USER, documentId),
    ])
    assert.equal(first.requestId, second.requestId)
    await applyCreemEvent(ledger, paidEvent('evt_file', first.requestId || ''), PRODUCTS)
    const response = await exportPost(new Request('https://www.ezcoverletter.xyz/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ezcl-user': `user:${USER}` },
      body: JSON.stringify({
        format: 'word',
        documentId,
        letter: 'A different letter that must not replace the snapshot.',
        contact: CONTACT,
      }),
    }))
    assert.equal(response.status, 200)
    const body = docxDocumentXml(await responseBytes(response))
    assert.match(body, /Saved snapshot letter/)
    assert.doesNotMatch(body, /different letter/)
  } finally {
    useTestLedger(null)
    delete process.env.EZCL_BILLING_TEST
  }
})

test('a failed export does not choose another document, and a second subscription click does not call Creem again', async () => {
  assert.equal(exportFailureAction(500, null), 'stop')
  assert.equal(exportFailureAction(401, 'doc-1'), 'resume')
  assert.equal(exportFailureAction(401, null), 'create')

  const ledger = new MemoryLedger()
  useTestLedger(ledger)
  process.env.EZCL_BILLING_TEST = '1'
  process.env.CREEM_API_KEY = 'test-creem-key'
  process.env.CREEM_API_URL = 'https://test-api.creem.io'
  process.env.CREEM_PRODUCT_ID = 'prod_export'
  process.env.CREEM_CREATOR_PRODUCT_ID = 'prod_creator'
  process.env.CREEM_PRO_PRODUCT_ID = 'prod_pro'
  let calls = 0
  const previous = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ id: 'chk_sub', checkout_url: 'https://checkout.creem.io/pay/test-sub' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const request = () => subscriptionCheckout(new Request('https://www.ezcoverletter.xyz/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ezcl-user': `user:${USER}` },
      body: JSON.stringify({ plan: 'creator' }),
    }))
    const first = await request()
    const second = await request()
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(calls, 1)
    await ledger.saveSubscription({
      userId: USER,
      plan: 'creator',
      status: 'active',
      productId: 'prod_creator',
      creemSubscriptionId: 'sub_live',
      creemCustomerId: null,
      currentPeriodEnd: '2099-02-01T00:00:00Z',
    })
    const third = await request()
    assert.equal(third.status, 409)
    assert.equal(calls, 1)
    const sql = readFileSync(new URL('../supabase/migrations/20261030_billing_entitlements.sql', import.meta.url), 'utf8')
    for (const [eventType, status] of Object.entries(FORCED_SUBSCRIPTION_STATUS)) {
      assert.match(sql, new RegExp(`when '${eventType}' then '${status}'`))
    }
    assert.match(sql, /raise exception 'subscription user is not linked'/)
    assert.match(sql, /raise exception 'checkout payment is not verified'/)
    assert.match(sql, /checkout_id = coalesce\(checkout_id, v_checkout\)/)
    assert.doesNotMatch(sql, /scheduled_plan = 'creator'/)
  } finally {
    globalThis.fetch = previous
    useTestLedger(null)
    delete process.env.EZCL_BILLING_TEST
  }
})
