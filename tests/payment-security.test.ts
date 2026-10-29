import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { CREEM_LIVE_PRODUCT_ID } from '../lib/constants.ts'
import { successUrlFromRequest } from '../lib/creem.ts'
import {
  ENTITLEMENT_COOKIE,
  ENTITLEMENT_MAX_AGE_SECONDS,
  openEntitlement,
  sealEntitlement,
} from '../lib/entitlement.ts'
import { interpretUnlockResponse } from '../lib/unlock-result.ts'
import { POST as unlockPost } from '../app/api/unlock/route.ts'
import { POST as checkoutPost } from '../app/api/checkout/route.ts'
import { POST as exportPost } from '../app/api/export/route.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import { useTestLedger } from '../lib/billing/runtime.ts'

const ENV_KEYS = ['ENTITLEMENT_SECRET', 'CREEM_API_KEY', 'CREEM_API_URL', 'CREEM_PRODUCT_ID'] as const
const TEST_SECRET = 'test-entitlement-secret-not-a-real-key'
const TEST_PRODUCT_ID = 'prod_test_sandbox'
const CHECKOUT_ID = 'chk_paid_123'
const LETTER = 'I shipped the billing pipeline and cut invoice time by 30 percent.'
const CONTACT = {
  fullName: 'Jane Doe',
  phone: '+1 555 0100',
  email: 'jane@example.com',
  linkedin: 'https://linkedin.com/in/janedoe',
}

let previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined>
let previousFetch: typeof fetch

beforeEach(() => {
  previousEnv = {
    ENTITLEMENT_SECRET: process.env.ENTITLEMENT_SECRET,
    CREEM_API_KEY: process.env.CREEM_API_KEY,
    CREEM_API_URL: process.env.CREEM_API_URL,
    CREEM_PRODUCT_ID: process.env.CREEM_PRODUCT_ID,
  }
  previousFetch = globalThis.fetch
  process.env.EZCL_BILLING_TEST = '1'
  useTestLedger(new MemoryLedger())
  process.env.ENTITLEMENT_SECRET = TEST_SECRET
  process.env.CREEM_API_KEY = 'test-creem-key'
  process.env.CREEM_API_URL = 'https://test-api.creem.io'
  process.env.CREEM_PRODUCT_ID = TEST_PRODUCT_ID
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  globalThis.fetch = previousFetch
  delete process.env.EZCL_BILLING_TEST
  useTestLedger(null)
})

function completedSession(checkoutId = CHECKOUT_ID, product: unknown = { id: TEST_PRODUCT_ID }, status = 'completed') {
  return { id: checkoutId, status, product }
}

function mockCheckout(session: unknown, status = 200) {
  globalThis.fetch = async () => Response.json(session, { status })
}

function unlockRequest(checkoutId = CHECKOUT_ID, extra: Record<string, unknown> = {}) {
  return new Request('https://www.ezcoverletter.xyz/api/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      checkout_id: checkoutId,
      order_id: 'ord_fake',
      product_id: 'prod_client_supplied',
      ...extra,
    }),
  })
}

function exportRequest(token: string | null, body: Record<string, unknown>) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('cookie', `${ENTITLEMENT_COOKIE}=${encodeURIComponent(token)}`)
  return new Request('http://localhost:3000/api/export', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function cookieToken(response: Response) {
  const raw = response.headers.get('set-cookie')
  assert.ok(raw)
  assert.match(raw, /HttpOnly/)
  assert.match(raw, /Secure/)
  assert.match(raw, /SameSite=Lax/)
  assert.match(raw, new RegExp(`Max-Age=${ENTITLEMENT_MAX_AGE_SECONDS}`))
  const match = raw.match(new RegExp(`${ENTITLEMENT_COOKIE}=([^;]+)`))
  assert.ok(match)
  return decodeURIComponent(match[1])
}

describe('payment verification and export authorization', { concurrency: 1 }, () => {
  test('missing CREEM_API_KEY does not unlock and does not call Creem', async () => {
    delete process.env.CREEM_API_KEY
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json(completedSession())
    }

    const response = await unlockPost(unlockRequest())
    const payload = await response.json()

    assert.equal(called, false)
    assert.equal(response.status, 503)
    assert.equal(payload.granted, false)
    assert.equal(payload.verified, false)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('a forged checkout id cannot unlock when Creem does not know it', async () => {
    globalThis.fetch = async () => new Response('missing', { status: 404 })
    const response = await unlockPost(unlockRequest('chk_forged'))
    const payload = await response.json()

    assert.equal(response.status, 502)
    assert.equal(payload.granted, false)
    assert.equal(payload.verified, false)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('a completed payload for a different checkout id cannot unlock', async () => {
    mockCheckout(completedSession('chk_real'))
    const response = await unlockPost(unlockRequest('chk_forged'))
    const payload = await response.json()

    assert.notEqual(response.status, 200)
    assert.equal(payload.granted, false)
    assert.equal(payload.verified, false)
  })

  test('a payment that is not completed cannot unlock', async () => {
    for (const status of ['pending', 'processing', 'expired']) {
      mockCheckout(completedSession(CHECKOUT_ID, { id: TEST_PRODUCT_ID }, status))
      const response = await unlockPost(unlockRequest())
      const payload = await response.json()
      assert.equal(response.status, 402, status)
      assert.equal(payload.granted, false)
      assert.equal(payload.verified, false)
      assert.equal(payload.paymentStatus, status)
      assert.equal(response.headers.get('set-cookie'), null)
    }
  })

  test('a missing or mismatched product id cannot unlock', async () => {
    mockCheckout({ id: CHECKOUT_ID, status: 'completed' })
    const missing = await unlockPost(unlockRequest())
    const missingPayload = await missing.json()
    assert.equal(missing.status, 403)
    assert.equal(missingPayload.granted, false)
    assert.equal(missingPayload.verified, false)

    mockCheckout(completedSession(CHECKOUT_ID, { id: 'prod_other' }))
    const mismatch = await unlockPost(unlockRequest())
    const mismatchPayload = await mismatch.json()
    assert.equal(mismatch.status, 403)
    assert.equal(mismatchPayload.granted, false)
    assert.equal(mismatchPayload.verified, false)
    assert.equal(mismatch.headers.get('set-cookie'), null)
  })

  test('client-supplied product id cannot override the Creem product', async () => {
    mockCheckout(completedSession(CHECKOUT_ID, { id: 'prod_other' }))
    const response = await unlockPost(
      unlockRequest(CHECKOUT_ID, { product_id: TEST_PRODUCT_ID }),
    )
    const payload = await response.json()
    assert.equal(payload.granted, false)
    assert.equal(payload.verified, false)
  })

  test('a Creem query failure cannot unlock', async () => {
    globalThis.fetch = async () => {
      throw new Error('network down')
    }
    const response = await unlockPost(unlockRequest())
    const payload = await response.json()
    assert.equal(response.status, 502)
    assert.equal(payload.granted, false)
    assert.equal(payload.verified, false)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('a verified payment without ENTITLEMENT_SECRET does not grant access', async () => {
    delete process.env.ENTITLEMENT_SECRET
    mockCheckout(completedSession())
    const response = await unlockPost(unlockRequest())
    const payload = await response.json()
    assert.equal(response.status, 503)
    assert.equal(payload.verified, true)
    assert.equal(payload.granted, false)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('a verified payment sets a signed cookie and can export twice', async () => {
    mockCheckout(completedSession(CHECKOUT_ID, TEST_PRODUCT_ID))
    const unlock = await unlockPost(unlockRequest())
    const payload = await unlock.json()
    assert.equal(unlock.status, 200)
    assert.equal(payload.verified, true)
    assert.equal(payload.granted, true)
    assert.equal(payload.checkoutId, CHECKOUT_ID)

    const token = cookieToken(unlock)
    assert.equal(token.includes(TEST_SECRET), false)
    assert.ok(openEntitlement(token, TEST_PRODUCT_ID))

    const pdf = await exportPost(exportRequest(token, { format: 'pdf', letter: LETTER, contact: CONTACT }))
    const pdfHtml = await pdf.text()
    assert.equal(pdf.status, 200)
    assert.match(pdf.headers.get('content-type') || '', /text\/html/)
    assert.match(pdfHtml, /id="letter"/)
    assert.match(pdfHtml, /I shipped the billing pipeline/)
    assert.match(pdfHtml, /Jane Doe/)
    assert.match(pdfHtml, /jane@example.com/)
    assert.doesNotMatch(pdfHtml, /\[User Full Name\]/)

    const word = await exportPost(exportRequest(token, { format: 'word', letter: LETTER, contact: CONTACT }))
    const wordHtml = await word.text()
    assert.equal(word.status, 200)
    assert.match(word.headers.get('content-type') || '', /application\/msword/)
    assert.match(word.headers.get('content-disposition') || '', /cover-letter\.doc/)
    assert.match(wordHtml, /Jane Doe/)
    assert.match(wordHtml, /\+1 555 0100/)
    assert.match(wordHtml, /linkedin\.com\/in\/janedoe/)

    const refreshed = await exportPost(exportRequest(token, { format: 'pdf', letter: LETTER, contact: CONTACT }))
    assert.equal(refreshed.status, 200)
    assert.match(await refreshed.text(), /I shipped the billing pipeline/)
  })

  test('localStorage-style unlocked flag cannot authorize export', async () => {
    const response = await exportPost(
      exportRequest(null, {
        format: 'word',
        letter: LETTER,
        contact: CONTACT,
        unlocked: true,
      }),
    )
    const text = await response.text()
    assert.equal(response.status, 401)
    assert.equal(text.includes('id="letter"'), false)
    assert.equal(text.includes(LETTER), false)
    assert.equal(text.includes('Jane Doe'), false)
  })

  test('a tampered, expired, or wrong-product cookie cannot authorize export', async () => {
    const token = sealEntitlement(CHECKOUT_ID, TEST_PRODUCT_ID)
    assert.ok(token)
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    const tamperedResponse = await exportPost(
      exportRequest(tampered, { format: 'pdf', letter: LETTER, contact: CONTACT }),
    )
    const tamperedText = await tamperedResponse.text()
    assert.equal(tamperedResponse.status, 401)
    assert.equal(tamperedText.includes(LETTER), false)
    assert.equal(tamperedText.includes('id="letter"'), false)

    const expired = sealEntitlement(
      CHECKOUT_ID,
      TEST_PRODUCT_ID,
      Date.now() - (ENTITLEMENT_MAX_AGE_SECONDS + 60) * 1000,
    )
    assert.equal(openEntitlement(expired, TEST_PRODUCT_ID), null)
    const expiredResponse = await exportPost(
      exportRequest(expired, { format: 'word', letter: LETTER, contact: CONTACT }),
    )
    assert.equal(expiredResponse.status, 401)
    assert.equal((await expiredResponse.text()).includes(LETTER), false)

    const claims = {
      v: 1,
      productId: 'prod_other',
      checkoutId: CHECKOUT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    const signature = createHmac('sha256', TEST_SECRET).update(body).digest('base64url')
    const wrongProduct = await exportPost(
      exportRequest(`${body}.${signature}`, { format: 'pdf', letter: LETTER, contact: CONTACT }),
    )
    assert.equal(wrongProduct.status, 401)
    assert.equal((await wrongProduct.text()).includes('id="letter"'), false)
  })

  test('an entitled export with placeholder contact does not return a file', async () => {
    const token = sealEntitlement(CHECKOUT_ID, TEST_PRODUCT_ID)
    assert.ok(token)
    const response = await exportPost(
      exportRequest(token, {
        format: 'pdf',
        letter: LETTER,
        contact: { ...CONTACT, fullName: '[User Full Name]' },
      }),
    )
    const text = await response.text()
    assert.equal(response.status, 400)
    assert.equal(text.includes('id="letter"'), false)
  })

  test('checkout creation failure does not fall back to the public payment link', async () => {
    globalThis.fetch = async () => new Response('nope', { status: 500 })
    const response = await checkoutPost(
      new Request('http://localhost:3000/api/checkout', {
        method: 'POST',
        headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' },
      }),
    )
    const text = await response.text()
    assert.equal(response.status, 502)
    assert.equal(text.includes('creem.io/payment'), false)
    assert.equal(text.includes(CREEM_LIVE_PRODUCT_ID), false)
  })

  test('a non-Creem checkout URL is rejected', async () => {
    globalThis.fetch = async () =>
      Response.json({ id: 'chk_test', checkout_url: 'https://evil.example/pay' })
    const response = await checkoutPost(
      new Request('https://www.ezcoverletter.xyz/api/checkout', { method: 'POST' }),
    )
    const text = await response.text()
    assert.equal(response.status, 502)
    assert.equal(text.includes('evil.example'), false)
  })

  test('the documented Creem checkout host is accepted and other hosts are rejected', async () => {
    globalThis.fetch = async () =>
      Response.json({ id: 'chk_test', checkout_url: 'https://checkout.creem.io/ch_test' })
    const allowed = await checkoutPost(new Request('http://localhost:3000/api/checkout', { method: 'POST' }))
    const allowedPayload = await allowed.json()
    assert.equal(allowed.status, 200)
    assert.equal(allowedPayload.checkoutUrl, 'https://checkout.creem.io/ch_test')

    globalThis.fetch = async () =>
      Response.json({ id: 'chk_test', checkout_url: 'https://creem.io/checkout/chk_test' })
    const apex = await checkoutPost(new Request('http://localhost:3000/api/checkout', { method: 'POST' }))
    const apexText = await apex.text()
    assert.equal(apex.status, 502)
    assert.equal(apexText.includes('creem.io/checkout'), false)

    globalThis.fetch = async () =>
      Response.json({ id: 'chk_test', checkout_url: 'https://checkout.creem.io.evil.example/ch_test' })
    const lookalike = await checkoutPost(new Request('http://localhost:3000/api/checkout', { method: 'POST' }))
    const lookalikeText = await lookalike.text()
    assert.equal(lookalike.status, 502)
    assert.equal(lookalikeText.includes('evil.example'), false)
  })

  test('missing CREEM_PRODUCT_ID refuses checkout and does not call Creem', async () => {
    delete process.env.CREEM_PRODUCT_ID
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json({ checkout_url: 'https://checkout.creem.io/ch_test' })
    }
    const response = await checkoutPost(new Request('http://localhost:3000/api/checkout', { method: 'POST' }))
    const payload = await response.json()
    assert.equal(called, false)
    assert.equal(response.status, 503)
    assert.equal(payload.reason, 'missing_product_id')
    assert.equal(String(payload.checkoutUrl || ''), '')
  })

  test('missing CREEM_PRODUCT_ID refuses entitlement and does not set a cookie', async () => {
    delete process.env.CREEM_PRODUCT_ID
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json(completedSession())
    }
    const response = await unlockPost(unlockRequest())
    const payload = await response.json()
    assert.equal(called, false)
    assert.equal(response.status, 503)
    assert.equal(payload.granted, false)
    assert.equal(payload.verified, false)
    assert.equal(payload.reason, 'missing_product_id')
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('a matching test product id can pass verification', async () => {
    mockCheckout(completedSession(CHECKOUT_ID, { id: TEST_PRODUCT_ID }))
    const response = await unlockPost(unlockRequest(CHECKOUT_ID, { product_id: 'prod_client_forged' }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.verified, true)
    assert.equal(payload.granted, true)
    assert.match(response.headers.get('set-cookie') || '', /HttpOnly/)
  })

  test('the live product cannot be used with the test API', async () => {
    process.env.CREEM_PRODUCT_ID = CREEM_LIVE_PRODUCT_ID
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json(completedSession(CHECKOUT_ID, { id: CREEM_LIVE_PRODUCT_ID }))
    }
    const checkout = await checkoutPost(new Request('http://localhost:3000/api/checkout', { method: 'POST' }))
    const unlock = await unlockPost(unlockRequest())
    assert.equal(called, false)
    assert.equal(checkout.status, 503)
    assert.equal((await checkout.json()).reason, 'test_api_with_live_product')
    assert.equal(unlock.status, 503)
    const unlockPayload = await unlock.json()
    assert.equal(unlockPayload.granted, false)
    assert.equal(unlockPayload.verified, false)
    assert.equal(unlock.headers.get('set-cookie'), null)
  })

  test('the production API rejects a product id other than the live product', async () => {
    process.env.CREEM_API_URL = 'https://api.creem.io'
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json(completedSession())
    }
    const response = await checkoutPost(new Request('https://www.ezcoverletter.xyz/api/checkout', { method: 'POST' }))
    const payload = await response.json()
    assert.equal(called, false)
    assert.equal(response.status, 503)
    assert.equal(payload.reason, 'live_api_with_other_product')
  })

  test('the production API accepts the existing live product id', async () => {
    process.env.CREEM_API_URL = 'https://api.creem.io'
    process.env.CREEM_PRODUCT_ID = CREEM_LIVE_PRODUCT_ID
    let requested = ''
    globalThis.fetch = async (input) => {
      requested = String(input)
      return Response.json(completedSession(CHECKOUT_ID, CREEM_LIVE_PRODUCT_ID))
    }
    const unlock = await unlockPost(unlockRequest(CHECKOUT_ID, { product_id: TEST_PRODUCT_ID }))
    const payload = await unlock.json()
    assert.equal(unlock.status, 200)
    assert.equal(payload.verified, true)
    assert.equal(payload.granted, true)
    assert.match(requested, /^https:\/\/api\.creem\.io\/v1\/checkouts\?/)
    assert.equal(requested.includes(TEST_PRODUCT_ID), false)
  })

  test('an unofficial Creem API host is rejected', async () => {
    process.env.CREEM_API_URL = 'https://payments.example'
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json(completedSession())
    }
    const response = await unlockPost(unlockRequest())
    const payload = await response.json()
    assert.equal(called, false)
    assert.equal(response.status, 503)
    assert.equal(payload.reason, 'invalid_api_url')
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('success_url ignores an arbitrary host and still starts a Creem session', async () => {
    let captured = ''
    globalThis.fetch = async (_input, init) => {
      captured = String(init?.body || '')
      return Response.json({
        id: 'chk_test',
        checkout_url: 'https://www.creem.io/checkout/chk_test',
      })
    }

    const response = await checkoutPost(
      new Request('https://www.ezcoverletter.xyz/api/checkout', {
        method: 'POST',
        headers: {
          host: 'evil.example',
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'https',
        },
      }),
    )
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.checkoutUrl, 'https://www.creem.io/checkout/chk_test')
    assert.match(captured, /https:\/\/www\.ezcoverletter\.xyz\/success/)
    assert.match(captured, new RegExp(TEST_PRODUCT_ID))
    assert.equal(captured.includes(CREEM_LIVE_PRODUCT_ID), false)
    assert.equal(captured.includes('evil.example'), false)
  })

  test('success_url allowlist accepts production and local dev only', () => {
    assert.equal(
      successUrlFromRequest(
        new Request('https://www.ezcoverletter.xyz/api/checkout', {
          headers: { host: 'www.ezcoverletter.xyz', 'x-forwarded-proto': 'https' },
        }),
      ),
      'https://www.ezcoverletter.xyz/success',
    )
    assert.equal(
      successUrlFromRequest(
        new Request('http://localhost:3000/api/checkout', {
          headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' },
        }),
      ),
      'http://localhost:3000/success',
    )
    assert.equal(
      successUrlFromRequest(
        new Request('https://www.ezcoverletter.xyz/api/checkout', {
          headers: { host: 'www.ezcoverletter.xyz.evil.example', 'x-forwarded-proto': 'https' },
        }),
      ),
      'https://www.ezcoverletter.xyz/success',
    )
    assert.equal(
      successUrlFromRequest(
        new Request('https://www.ezcoverletter.xyz/api/checkout', {
          headers: { host: 'www.ezcoverletter.xyz', 'x-forwarded-proto': 'http' },
        }),
      ),
      'https://www.ezcoverletter.xyz/success',
    )
  })

  test('purchase analytics are not allowed unless verification and entitlement both succeed', () => {
    assert.deepEqual(
      interpretUnlockResponse({ status: 200, verified: true, granted: true, browserStateSaved: true }),
      { state: 'granted', trackPurchase: true },
    )
    assert.equal(
      interpretUnlockResponse({ status: 200, verified: false, granted: true, browserStateSaved: true }).trackPurchase,
      false,
    )
    assert.equal(
      interpretUnlockResponse({ status: 200, verified: true, granted: true, browserStateSaved: false }).state,
      'entitlement_pending',
    )
    assert.equal(
      interpretUnlockResponse({ status: 200, verified: true, granted: false, browserStateSaved: false }).trackPurchase,
      false,
    )
    assert.equal(
      interpretUnlockResponse({ status: 402, verified: false, paymentStatus: 'processing', browserStateSaved: false })
        .state,
      'pending',
    )
    assert.equal(
      interpretUnlockResponse({ status: 402, verified: false, paymentStatus: 'expired', browserStateSaved: false })
        .state,
      'failed',
    )
    assert.equal(
      interpretUnlockResponse({ status: 502, verified: false, browserStateSaved: false }).trackPurchase,
      false,
    )
  })

  test('checkout and unlock no longer grant access from a checkout id pattern or public link', () => {
    const unlockSource = readFileSync(new URL('../app/api/unlock/route.ts', import.meta.url), 'utf8')
    const checkoutSource = readFileSync(new URL('../app/api/checkout/route.ts', import.meta.url), 'utf8')
    const clientSource = readFileSync(new URL('../lib/start-checkout.ts', import.meta.url), 'utf8')
    const creemSource = readFileSync(new URL('../lib/creem.ts', import.meta.url), 'utf8')
    assert.equal(unlockSource.includes('looksLikePaidRedirect'), false)
    assert.equal(creemSource.includes('looksLikePaidRedirect'), false)
    assert.equal(checkoutSource.includes('CREEM_CHECKOUT_URL'), false)
    assert.equal(clientSource.includes('CREEM_CHECKOUT_URL'), false)
    assert.equal(clientSource.includes('creem.io/payment'), false)
  })
})
