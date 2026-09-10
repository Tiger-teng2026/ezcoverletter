import { CREEM_PRODUCT_ID } from '@/lib/constants'
import {
  creemApiKey,
  creemProductId,
  looksLikePaidRedirect,
  retrieveCreemCheckout,
} from '@/lib/creem'

export const maxDuration = 30

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return Response.json({ granted: false, error: 'Invalid request' }, { status: 400 })
  }

  const checkoutId = asString((body as { checkout_id?: unknown }).checkout_id)
  const orderId = asString((body as { order_id?: unknown }).order_id)
  const productId = asString((body as { product_id?: unknown }).product_id)

  if (creemApiKey() && checkoutId) {
    const session = await retrieveCreemCheckout(checkoutId)
    if (session) {
      const paidProduct = creemProductId(session.product)
      const productOk = !paidProduct || paidProduct === CREEM_PRODUCT_ID
      if (session.status === 'completed' && productOk) {
        return Response.json({ granted: true, verified: true, checkoutId })
      }
      if (session.status && session.status !== 'completed') {
        return Response.json(
          { granted: false, error: 'Payment is not complete yet. Finish checkout, then return here.' },
          { status: 402 },
        )
      }
    }

    return Response.json(
      { granted: false, error: 'Could not verify this payment. Contact hello@ezcoverletter.xyz.' },
      { status: 400 },
    )
  }

  if (looksLikePaidRedirect({ checkoutId, orderId, productId })) {
    return Response.json({ granted: true, verified: false, checkoutId })
  }

  return Response.json(
    { granted: false, error: 'Missing payment confirmation from Creem.' },
    { status: 400 },
  )
}
