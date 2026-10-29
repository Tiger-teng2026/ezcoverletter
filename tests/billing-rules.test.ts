import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decideSubscriptionChange, legacyCycleId, paidAccountId } from '../lib/billing/cycle.ts'
import { applyCreemEvent } from '../lib/billing/events.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import type { SubscriptionRecord } from '../lib/billing/ledger.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const PRODUCTS = { oneTimeProductId: 'prod_export', creatorProductId: 'prod_creator', proProductId: 'prod_pro' }

function baseSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    userId: USER,
    plan: 'creator',
    status: 'active',
    productId: 'prod_creator',
    creemSubscriptionId: 'sub_cycle',
    creemCustomerId: null,
    currentPeriodEnd: '2099-02-01T00:00:00Z',
    cycleId: 'sub_cycle:2099-01-01T00:00:00Z',
    periodStart: '2099-01-01T00:00:00Z',
    openedByTransaction: 'tran_open',
    ...overrides,
  }
}

test('the additive migration keeps grants in one database function', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261030_billing_entitlements.sql', import.meta.url), 'utf8')
  assert.match(sql, /create or replace function public\.apply_billing_webhook/)
  assert.match(sql, /status = 'applied'/)
  assert.match(sql, /where public\.one_time_purchases\.status is distinct from 'refunded'/)
  assert.match(sql, /create or replace function public\.record_webhook_failure/)
  assert.match(sql, /where public\.webhook_events\.status is distinct from 'applied'/)
  assert.match(sql, /v_free_allowance integer := 10/)
  assert.match(sql, /on delete set null/)
  assert.match(sql, /on delete restrict/)
  assert.match(sql, /export_checkout_one_live/)
  assert.match(sql, /greatest\(public\.credit_balances\.allowance, excluded\.allowance\)/)
  assert.doesNotMatch(sql, /drop table/i)
})

test('duplicate subscription payments do not open a second credit bucket', () => {
  const existing = baseSubscription()
  const repeated = decideSubscriptionChange(existing, {
    subscriptionId: 'sub_cycle',
    plan: 'creator',
    periodStart: '2099-01-01T00:00:00Z',
    periodEnd: '2099-02-01T00:00:00Z',
    transactionId: 'tran_open',
    eventType: 'subscription.paid',
  })
  assert.equal(repeated.openNewBucket, false)
  assert.equal(repeated.cycleId, existing.cycleId)
})

test('a later paid period opens one new bucket and an upgrade keeps the current bucket', () => {
  const existing = baseSubscription()
  const renewal = decideSubscriptionChange(existing, {
    subscriptionId: 'sub_cycle',
    plan: 'creator',
    periodStart: '2099-02-01T00:00:00Z',
    periodEnd: '2099-03-01T00:00:00Z',
    transactionId: 'tran_next',
    eventType: 'subscription.paid',
  })
  assert.equal(renewal.openNewBucket, true)
  assert.equal(renewal.cycleId, 'sub_cycle:2099-02-01T00:00:00Z')

  const upgrade = decideSubscriptionChange(existing, {
    subscriptionId: 'sub_cycle',
    plan: 'pro',
    periodStart: '2099-01-01T00:00:00Z',
    periodEnd: '2099-02-01T00:00:00Z',
    transactionId: 'tran_upgrade',
    eventType: 'subscription.update',
  })
  assert.equal(upgrade.openNewBucket, false)
  assert.equal(upgrade.plan, 'pro')
  assert.equal(upgrade.cycleId, existing.cycleId)
  assert.equal(upgrade.raiseAllowance, true)
  assert.equal(upgrade.allowance, 300)
})

test('a downgrade waits until the next period and missing fields do not open a bucket', () => {
  const existing = baseSubscription({ plan: 'pro', productId: 'prod_pro' })
  const downgrade = decideSubscriptionChange(existing, {
    subscriptionId: 'sub_cycle',
    plan: 'creator',
    periodStart: '2099-01-01T00:00:00Z',
    periodEnd: '2099-02-01T00:00:00Z',
    transactionId: null,
    eventType: 'subscription.update',
  })
  assert.equal(downgrade.plan, 'pro')
  assert.equal(downgrade.scheduledPlan, null)
  assert.equal(downgrade.openNewBucket, false)

  const incomplete = decideSubscriptionChange(existing, {
    subscriptionId: 'sub_cycle',
    plan: 'pro',
    periodStart: null,
    periodEnd: '2099-03-01T00:00:00Z',
    transactionId: 'tran_missing',
    eventType: 'subscription.paid',
  })
  assert.equal(incomplete.openNewBucket, false)
  assert.equal(incomplete.cycleId, existing.cycleId)
})

test('an old subscription initializes one legacy bucket id', () => {
  const cycleId = legacyCycleId('sub_old', '2099-04-01T00:00:00.000Z')
  assert.equal(cycleId, 'legacy:sub_old:2099-04-01T00:00:00Z')
  assert.equal(paidAccountId('user-1', 'sub_old', cycleId || ''), 'paid:user-1:sub_old:legacy:sub_old:2099-04-01T00:00:00Z')
})

test('one document cannot start a second live checkout, and a refund blocks a later payment', async () => {
  const ledger = new MemoryLedger()
  const documentId = await ledger.saveExportDocument({ userId: USER, letter: 'Saved letter for one purchase.', title: 'Letter A' })
  const first = await ledger.beginExportCheckout(USER, documentId)
  const second = await ledger.beginExportCheckout(USER, documentId)
  assert.equal(first.state, 'created')
  assert.equal(second.state, 'creating')
  assert.equal(second.requestId, first.requestId)

  await applyCreemEvent(ledger, {
    id: 'evt_refund_first',
    eventType: 'refund.created',
    object: {
      status: 'succeeded',
      checkout: { id: 'chk_letter', product: { id: 'prod_export' } },
    },
  }, PRODUCTS)
  await applyCreemEvent(ledger, {
    id: 'evt_paid_later',
    eventType: 'checkout.completed',
    object: {
      id: 'chk_letter',
      status: 'completed',
      product: { id: 'prod_export' },
      order: { status: 'paid' },
      request_id: first.requestId,
    },
  }, PRODUCTS)
  assert.equal(await ledger.isExportRevoked('chk_letter'), true)
})

test('the owner can change a letter sign-off and cannot change the letter body', async () => {
  const ledger = new MemoryLedger()
  const documentId = await ledger.saveExportDocument({
    userId: USER,
    letter: 'Locked body.',
    title: 'Letter B',
    contact: { name: 'Ada' },
  })
  assert.equal(await ledger.updateExportContact(USER, documentId, { name: 'Grace' }), true)
  assert.equal(await ledger.updateExportContact('22222222-2222-4222-8222-222222222222', documentId, { name: 'Other' }), false)
  assert.equal(ledger.getExportDocument(USER, documentId)?.contact.name, 'Grace')
  assert.equal(ledger.getExportDocument(USER, documentId)?.letter, 'Locked body.')
})

test('an export refund does not change an active subscription', async () => {
  const ledger = new MemoryLedger()
  await applyCreemEvent(ledger, {
    id: 'evt_sub',
    eventType: 'subscription.paid',
    object: {
      id: 'sub_keep',
      status: 'active',
      product: { id: 'prod_creator' },
      current_period_start_date: '2099-01-01T00:00:00Z',
      current_period_end_date: '2099-02-01T00:00:00Z',
      last_transaction_id: 'tran_keep',
      metadata: { userId: USER },
    },
  }, PRODUCTS)
  await applyCreemEvent(ledger, {
    id: 'evt_export_refund',
    eventType: 'refund.created',
    object: {
      status: 'succeeded',
      checkout: { id: 'chk_only', product: { id: 'prod_export' } },
      subscription: { id: 'sub_keep', product: { id: 'prod_export' } },
    },
  }, PRODUCTS)
  assert.equal((await ledger.getSubscription(USER))?.status, 'active')
  assert.equal(await ledger.isExportRevoked('chk_only'), true)
})
