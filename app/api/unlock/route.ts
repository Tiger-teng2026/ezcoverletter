import { assessPaidCheckout, readCreemConfig, retrieveCreemCheckout } from '@/lib/creem'
import { entitlementGrantResponse, entitlementSecret, noStoreJson, sealEntitlement } from '@/lib/entitlement'
import { getTestLedger, testingBilling } from '@/lib/billing/runtime'
import { supabaseServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return noStoreJson({ granted: false, verified: false, error: 'Invalid request' }, 400)
  }

  const checkoutId = asString((body as { checkout_id?: unknown }).checkout_id)
  if (!checkoutId || checkoutId.length > 200) {
    return noStoreJson(
      { granted: false, verified: false, error: 'Missing payment confirmation from Creem.' },
      400,
    )
  }

  const config = readCreemConfig()
  if (!config.ok) {
    console.error('[unlock] Creem configuration refused', config.code)
    return noStoreJson(
      { granted: false, verified: false, reason: config.code, error: config.error },
      503,
    )
  }

  const retrieved = await retrieveCreemCheckout(checkoutId, config)
  if (!retrieved.ok) {
    return noStoreJson(
      {
        granted: false,
        verified: false,
        reason: 'query_failed',
        error: 'Could not verify this payment with Creem. Pro Export was not unlocked.',
      },
      502,
    )
  }

  const assessed = assessPaidCheckout(retrieved.session, checkoutId, config.productId)
  if (!assessed.ok) {
    if (assessed.reason === 'not_completed') {
      const paymentStatus = retrieved.session.status || ''
      const error =
        paymentStatus === 'expired'
          ? 'This checkout expired before payment was completed. Pro Export was not unlocked.'
          : paymentStatus === 'pending' || paymentStatus === 'processing'
            ? 'Payment is not complete yet. Finish checkout, then return here. Pro Export stays locked until Creem reports this payment as completed.'
            : 'Payment was not completed. Pro Export was not unlocked.'
      return noStoreJson(
        { granted: false, verified: false, reason: 'not_completed', paymentStatus, error },
        402,
      )
    }

    const error =
      assessed.reason === 'product_mismatch'
        ? 'This payment does not match Pro Export. Access was not unlocked.'
        : 'Could not verify this payment with Creem. Pro Export was not unlocked.'
    return noStoreJson(
      { granted: false, verified: false, reason: assessed.reason, error },
      assessed.reason === 'product_mismatch' ? 403 : 502,
    )
  }

  const sessionRecord = retrieved.session as { request_id?: unknown; metadata?: { documentId?: unknown } }
  const requestId = typeof sessionRecord.request_id === 'string' ? sessionRecord.request_id : ''
  const boundDocument = typeof sessionRecord.metadata?.documentId === 'string' ? sessionRecord.metadata.documentId : ''
  if (requestId || boundDocument) {
    const confirmed = await confirmBoundExport(checkoutId, requestId)
    if (!confirmed.granted) {
      return noStoreJson(
        {
          granted: false,
          verified: true,
          reason: confirmed.reason || 'unbound',
          error: 'This payment could not be attached to the saved cover letter. You do not need to pay again.',
        },
        409,
      )
    }
    return noStoreJson({
      granted: true,
      verified: true,
      checkoutId,
      documentId: confirmed.documentId,
      scope: 'document',
    })
  }

  if (!entitlementSecret()) {
    return noStoreJson(
      {
        granted: false,
        verified: true,
        reason: 'entitlement_unavailable',
        checkoutId,
        error:
          'Payment was confirmed, but Pro Export could not be activated on the server. Contact hello@ezcoverletter.xyz. You do not need to pay again.',
      },
      503,
    )
  }

  const token = sealEntitlement(checkoutId, config.productId)
  if (!token) {
    return noStoreJson(
      {
        granted: false,
        verified: true,
        reason: 'entitlement_unavailable',
        checkoutId,
        error:
          'Payment was confirmed, but Pro Export could not be activated on the server. Contact hello@ezcoverletter.xyz. You do not need to pay again.',
      },
      503,
    )
  }

  return entitlementGrantResponse({ granted: true, verified: true, checkoutId }, token)
}

async function confirmBoundExport(checkoutId: string, requestId: string) {
  const parsed = /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : null
  if (testingBilling()) {
    const ledger = getTestLedger()
    if (!ledger) return { granted: false as const, reason: 'unbound' }
    return ledger.confirmExportPayment(checkoutId, parsed)
  }
  const client = supabaseServiceClient()
  if (!client) return { granted: false as const, reason: 'unbound' }
  const result = await client.rpc('confirm_export_payment', {
    p_checkout_id: checkoutId,
    p_request_id: parsed,
  })
  if (result.error || !result.data || typeof result.data !== 'object') return { granted: false as const, reason: 'unbound' }
  const body = result.data as { granted?: boolean; documentId?: string; reason?: string }
  if (!body.granted) return { granted: false as const, reason: body.reason || 'unbound' }
  return { granted: true as const, documentId: body.documentId }
}
