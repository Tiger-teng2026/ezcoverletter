import { accountSnapshot, getTestLedger, testingBilling } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'
import { CREEM_LIVE_PRODUCT_ID } from '@/lib/constants'
import { allowlistedOriginFromRequest, CreemCheckoutError, createCreemCheckout, readCreemConfig } from '@/lib/creem'
import { PLANS, type PaidPlanId } from '@/lib/plans'
import { supabaseServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

function productFor(plan: PaidPlanId, oneTimeProductId: string, mode: 'live' | 'test') {
  const envName = PLANS[plan].productEnv
  const productId = process.env[envName]?.trim() || ''
  if (!productId) return { ok: false as const, error: `${PLANS[plan].name} checkout is not configured.`, status: 503 }
  if (productId === oneTimeProductId || (mode === 'test' && productId === CREEM_LIVE_PRODUCT_ID)) {
    return { ok: false as const, error: 'The subscription product must be separate from Pro Export.', status: 503 }
  }
  return { ok: true as const, productId }
}

export async function POST(req: Request) {
  const account = await accountSnapshot(req)
  if (!account.ok) return withCookies(Response.json({ error: account.error }, { status: account.status }), account.cookies ?? [])
  if (!account.snapshot.signedIn) {
    return withCookies(
      Response.json({ error: 'Sign in before starting a subscription.' }, { status: 401 }),
      account.cookies,
    )
  }
  const body = await req.json().catch(() => null)
  const plan = body && typeof body === 'object' && 'plan' in body ? body.plan : ''
  if (plan !== 'creator' && plan !== 'pro') {
    return withCookies(Response.json({ error: 'Choose Creator or Pro.' }, { status: 400 }), account.cookies)
  }
  const config = readCreemConfig()
  if (!config.ok) {
    return withCookies(Response.json({ error: config.error }, { status: 503 }), account.cookies)
  }
  const product = productFor(plan, config.productId, config.mode)
  if (!product.ok) return withCookies(Response.json({ error: product.error }, { status: product.status }), account.cookies)

  const userId = account.snapshot.userId
  if (!userId) {
    return withCookies(Response.json({ error: 'Sign in before starting a subscription.' }, { status: 401 }), account.cookies)
  }

  const successUrl = `${allowlistedOriginFromRequest(req)}/account?billing=return`
  try {
    if (testingBilling()) {
      const ledger = getTestLedger()
      if (!ledger) return withCookies(Response.json({ error: 'Checkout is unavailable right now. Please try again.' }, { status: 503 }), account.cookies)
      const attempt = await ledger.beginSubscriptionCheckout(userId, plan)
      if (attempt.state === 'blocked') {
        return withCookies(Response.json({ error: 'This account already has a Creem subscription. A second checkout is not started, because changing plans in place is not available.' }, { status: 409 }), account.cookies)
      }
      if (attempt.checkoutUrl) {
        return withCookies(Response.json({ checkoutUrl: attempt.checkoutUrl, checkoutId: attempt.checkoutId }), account.cookies)
      }
      if (!attempt.requestId) {
        return withCookies(Response.json({ error: 'Checkout is still being confirmed. Do not start another payment.' }, { status: 409 }), account.cookies)
      }
      const session = await createCreemCheckout(config, successUrl, {
        productId: product.productId,
        requestId: attempt.requestId,
        metadata: { userId, plan },
      })
      if (session.checkoutId) await ledger.attachSubscriptionCheckout(attempt.requestId, session.checkoutId, session.checkoutUrl)
      return withCookies(Response.json({ checkoutUrl: session.checkoutUrl, checkoutId: session.checkoutId }), account.cookies)
    }

    const client = supabaseServiceClient()
    if (!client) return withCookies(Response.json({ error: 'Checkout is unavailable right now. Please try again.' }, { status: 503 }), account.cookies)
    const begun = await client.rpc('begin_subscription_checkout', { p_user_id: userId, p_plan: plan })
    if (begun.error || !begun.data || typeof begun.data !== 'object') {
      return withCookies(Response.json({ error: 'Checkout is unavailable right now. Please try again.' }, { status: 503 }), account.cookies)
    }
    const attempt = begun.data as { state?: string; requestId?: string; checkoutId?: string | null; checkoutUrl?: string | null }
    if (attempt.state === 'blocked') {
      return withCookies(Response.json({ error: 'This account already has a Creem subscription. A second checkout is not started, because changing plans in place is not available.' }, { status: 409 }), account.cookies)
    }
    if (attempt.checkoutUrl) {
      return withCookies(Response.json({ checkoutUrl: attempt.checkoutUrl, checkoutId: attempt.checkoutId }), account.cookies)
    }
    if (!attempt.requestId) {
      return withCookies(Response.json({ error: 'Checkout is still being confirmed. Do not start another payment.' }, { status: 409 }), account.cookies)
    }
    const session = await createCreemCheckout(config, successUrl, {
      productId: product.productId,
      requestId: attempt.requestId,
      metadata: { userId, plan },
    })
    if (session.checkoutId) {
      await client.rpc('attach_subscription_checkout', {
        p_request_id: attempt.requestId,
        p_checkout_id: session.checkoutId,
        p_checkout_url: session.checkoutUrl,
      })
    }
    return withCookies(Response.json({ checkoutUrl: session.checkoutUrl, checkoutId: session.checkoutId }), account.cookies)
  } catch (error) {
    if (error instanceof CreemCheckoutError && error.alreadyExists) {
      return withCookies(Response.json({ error: 'Checkout is still being confirmed. Do not start another payment.' }, { status: 409 }), account.cookies)
    }
    return withCookies(Response.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 }), account.cookies)
  }
}
