import { CREEM_CHECKOUT_URL, SITE_URL } from '@/lib/constants'
import { track } from '@/lib/ga'

export function paymentLinkWithReturn() {
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL
  const successUrl = `${origin}/success`
  return `${CREEM_CHECKOUT_URL}?success_url=${encodeURIComponent(successUrl)}`
}

/** Start Pro Export checkout in the same tab so Creem can return to /success. */
export async function startProCheckout() {
  track('begin_checkout')
  try {
    const res = await fetch('/api/checkout', { method: 'POST' })
    if (res.ok) {
      const payload = (await res.json()) as { checkoutUrl?: string }
      if (payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl)
        return
      }
    }
  } catch {
    // Fall through to the static Creem payment link.
  }

  window.location.assign(paymentLinkWithReturn())
}
