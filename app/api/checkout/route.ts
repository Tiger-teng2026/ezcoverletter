import { createCreemCheckout, successUrlFromRequest } from '@/lib/creem'
import { CREEM_CHECKOUT_URL, SITE_URL } from '@/lib/constants'

export const maxDuration = 30

export async function POST(req: Request) {
  const successUrl = successUrlFromRequest(req)

  try {
    const session = await createCreemCheckout(successUrl)
    if (session) {
      return Response.json({
        checkoutUrl: session.checkoutUrl,
        checkoutId: session.checkoutId,
      })
    }
  } catch (error) {
    console.error('[checkout] Creem session failed:', error)
  }

  const fallback = new URL(CREEM_CHECKOUT_URL)
  fallback.searchParams.set('success_url', successUrl || `${SITE_URL}/success`)

  return Response.json({ checkoutUrl: fallback.toString() })
}
