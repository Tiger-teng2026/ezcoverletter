import { isCreemHostedCheckoutUrl } from '@/lib/constants'
import { track } from '@/lib/ga'

/** Start checkout for one saved cover letter. Reuses the same begin_checkout event. */
export async function startDocumentCheckout(documentId: string): Promise<{ ok: true; alreadyOwned?: boolean } | { ok: false; error: string }> {
  track('begin_checkout')
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
    })
    const payload = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string; alreadyOwned?: boolean } | null
    if (payload?.alreadyOwned) return { ok: true, alreadyOwned: true }
    if (res.ok && payload?.checkoutUrl && isCreemHostedCheckoutUrl(payload.checkoutUrl)) {
      window.location.assign(payload.checkoutUrl)
      return { ok: true }
    }
    return { ok: false, error: payload?.error || 'Checkout is unavailable right now. Please try again.' }
  } catch {
    return { ok: false, error: 'Checkout is unavailable right now. Please try again.' }
  }
}

/** Start Pro Export checkout in the same tab so Creem can return to /success. */
export async function startProCheckout(): Promise<{ ok: true } | { ok: false; error: string }> {
  track('begin_checkout')
  try {
    const res = await fetch('/api/checkout', { method: 'POST' })
    const payload = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null
    if (res.ok && payload?.checkoutUrl && isCreemHostedCheckoutUrl(payload.checkoutUrl)) {
      window.location.assign(payload.checkoutUrl)
      return { ok: true }
    }
    return {
      ok: false,
      error: payload?.error || 'Checkout is unavailable right now. Please try again.',
    }
  } catch {
    return { ok: false, error: 'Checkout is unavailable right now. Please try again.' }
  }
}
