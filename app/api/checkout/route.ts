import { CreemCheckoutError, createCreemCheckout, readCreemConfig, successUrlFromRequest } from '@/lib/creem'
import { noStoreJson } from '@/lib/entitlement'
import { getTestLedger, testingBilling } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'
import { supabaseServiceClient, userFromRequest } from '@/lib/supabase/server'

export const maxDuration = 30

type AttemptState = {
  state?: string
  requestId?: string
  documentId?: string
  checkoutId?: string | null
  checkoutUrl?: string | null
}

export async function POST(req: Request) {
  const config = readCreemConfig()
  if (!config.ok) {
    console.error('[checkout] Creem configuration refused', config.code)
    return noStoreJson({ error: config.error, reason: config.code }, 503)
  }

  const body = await req.json().catch(() => null)
  let documentId = body && typeof body === 'object' && typeof (body as { documentId?: unknown }).documentId === 'string'
    ? (body as { documentId: string }).documentId.trim()
    : ''
  const successUrl = successUrlFromRequest(req)

  if (testingBilling()) {
    const ledger = getTestLedger()
    if (!ledger) return noStoreJson({ error: 'Checkout is unavailable right now. Please try again.' }, 503)
    const header = req.headers.get('x-ezcl-user') || ''
    const userId = header.startsWith('user:') ? header.slice(5) : '00000000-0000-4000-8000-000000000001'
    if (!documentId) {
      documentId = await ledger.saveExportDocument({
        userId,
        letter: 'Security probe letter for checkout host checks. It is not a customer document.',
        title: 'Probe',
      })
    }
    const attempt = await ledger.beginExportCheckout(userId, documentId)
    if (attempt.state === 'forbidden') return noStoreJson({ error: 'That cover letter could not be found.' }, 404)
    if (attempt.state === 'paid') return noStoreJson({ alreadyOwned: true, documentId })
    if (attempt.checkoutUrl) return noStoreJson({ checkoutUrl: attempt.checkoutUrl, checkoutId: attempt.checkoutId })
    return finishCheckout(config, successUrl, attempt, userId, async (checkoutId, checkoutUrl) => {
      if (attempt.requestId) await ledger.attachExportCheckout(attempt.requestId, checkoutId, checkoutUrl)
    })
  }

  const user = await userFromRequest(req)
  if (!user) return noStoreJson({ error: 'Sign in before buying export for a cover letter.' }, 401)
  if (!documentId) return noStoreJson({ error: 'Choose one saved cover letter before checkout.' }, 400)
  const client = supabaseServiceClient()
  if (!client) return noStoreJson({ error: 'Checkout is unavailable right now. Please try again.' }, 503)
  const begun = await client.rpc('begin_export_checkout', { p_user_id: user.id, p_document_id: documentId })
  if (begun.error || !begun.data || typeof begun.data !== 'object') {
    return withCookies(noStoreJson({ error: 'Checkout is unavailable right now. Please try again.' }, 503), user.cookies)
  }
  const attempt = begun.data as AttemptState
  if (attempt.state === 'forbidden') {
    return withCookies(noStoreJson({ error: 'That cover letter could not be found.' }, 404), user.cookies)
  }
  if (attempt.state === 'paid') {
    return withCookies(noStoreJson({ alreadyOwned: true, documentId }), user.cookies)
  }
  if (attempt.checkoutUrl) {
    return withCookies(noStoreJson({ checkoutUrl: attempt.checkoutUrl, checkoutId: attempt.checkoutId }), user.cookies)
  }
  const response = await finishCheckout(config, successUrl, attempt, user.id, async (checkoutId, checkoutUrl) => {
    if (!attempt.requestId) return
    await client.rpc('attach_export_checkout', {
      p_request_id: attempt.requestId,
      p_checkout_id: checkoutId,
      p_checkout_url: checkoutUrl,
    })
  })
  return withCookies(response, user.cookies)
}

async function finishCheckout(
  config: Parameters<typeof createCreemCheckout>[0],
  successUrl: string,
  attempt: AttemptState,
  userId: string,
  attach: (checkoutId: string, checkoutUrl: string) => Promise<void>,
) {
  if (!attempt.requestId) return noStoreJson({ error: 'Checkout is still being confirmed. Do not start another payment.' }, 409)
  try {
    const session = await createCreemCheckout(config, successUrl, {
      requestId: attempt.requestId,
      metadata: { documentId: attempt.documentId || '', userId },
    })
    if (session.checkoutId) await attach(session.checkoutId, session.checkoutUrl)
    return noStoreJson({ checkoutUrl: session.checkoutUrl, checkoutId: session.checkoutId })
  } catch (error) {
    console.error('[checkout] Creem session was not created', error instanceof Error ? error.name : 'Error')
    if (error instanceof CreemCheckoutError && error.alreadyExists) {
      return noStoreJson({ error: 'Checkout is still being confirmed. Do not start another payment.' }, 409)
    }
    return noStoreJson({ error: 'Could not start checkout. Please try again.' }, 502)
  }
}
