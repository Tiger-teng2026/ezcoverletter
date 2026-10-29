import { applyCreemEvent, parseCreemEvent } from '@/lib/billing/events'
import { getLedger, testingBilling } from '@/lib/billing/runtime'
import { verifyCreemSignature } from '@/lib/creem-signature'
import { USAGE_UNAVAILABLE } from '@/lib/plans'
import { supabaseServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(req: Request) {
  const secret = process.env.CREEM_WEBHOOK_SECRET?.trim() || ''
  if (!secret) {
    return Response.json({ error: 'Webhook verification is not configured.' }, { status: 503 })
  }
  const raw = await req.text()
  if (!verifyCreemSignature(raw, req.headers.get('creem-signature'), secret)) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }
  const event = parseCreemEvent(raw)
  if (!event) return Response.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  const products = {
    oneTimeProductId: process.env.CREEM_PRODUCT_ID?.trim() || '',
    creatorProductId: process.env.CREEM_CREATOR_PRODUCT_ID?.trim() || '',
    proProductId: process.env.CREEM_PRO_PRODUCT_ID?.trim() || '',
  }

  if (!testingBilling()) {
    const client = supabaseServiceClient()
    if (!client) return Response.json({ error: USAGE_UNAVAILABLE }, { status: 503 })
    const applied = await client.rpc('apply_billing_webhook', {
      p_event: JSON.parse(raw) as unknown,
      p_one_time_product: products.oneTimeProductId,
      p_creator_product: products.creatorProductId,
      p_pro_product: products.proProductId,
    })
    if (applied.error) {
      console.error('[billing] webhook failed', applied.error.code || 'rpc')
      await client.rpc('record_webhook_failure', {
        p_event_id: event.id,
        p_event_type: event.eventType,
        p_error: 'webhook failed',
      })
      return Response.json({ error: 'Webhook processing failed.' }, { status: 500 })
    }
    const body = applied.data as { busy?: boolean; duplicate?: boolean } | null
    if (body?.busy) return Response.json({ error: 'Webhook processing failed.' }, { status: 500 })
    console.info('[billing] webhook', event.eventType, event.id, body?.duplicate ? 'duplicate' : 'applied')
    return Response.json({ ok: true })
  }

  const ledger = getLedger()
  if (!ledger) return Response.json({ error: USAGE_UNAVAILABLE }, { status: 503 })

  try {
    const result = await applyCreemEvent(ledger, event, products)
    console.info('[billing] webhook', event.eventType, event.id, 'duplicate' in result && result.duplicate ? 'duplicate' : 'applied')
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[billing] webhook failed', error instanceof Error ? error.name : 'Error')
    return Response.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}
