'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { CONTACT_EMAIL } from '@/lib/constants'
import { grantProAccess } from '@/lib/pro-access'

type UnlockState = 'checking' | 'granted' | 'pending' | 'missing'

export default function SuccessPage() {
  const [state, setState] = useState<UnlockState>('checking')
  const [message, setMessage] = useState('Confirming your Pro Export purchase…')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutId = params.get('checkout_id') || ''
    const orderId = params.get('order_id') || ''
    const productId = params.get('product_id') || ''

    if (!checkoutId && !orderId) {
      setState('missing')
      setMessage('No payment confirmation was attached to this page.')
      return
    }

    let cancelled = false

    async function unlock() {
      try {
        const res = await fetch('/api/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkout_id: checkoutId,
            order_id: orderId,
            product_id: productId,
          }),
        })
        const payload = (await res.json().catch(() => null)) as
          | { granted?: boolean; error?: string; checkoutId?: string }
          | null

        if (cancelled) return

        if (res.status === 402) {
          setState('pending')
          setMessage(payload?.error || 'Payment is still processing.')
          return
        }

        if (!res.ok || !payload?.granted) {
          setState('missing')
          setMessage(payload?.error || 'Could not confirm this payment.')
          return
        }

        grantProAccess(payload.checkoutId || checkoutId)
        setState('granted')
        setMessage('Pro Export is unlocked on this browser. PDF and Word are ready.')
      } catch {
        if (cancelled) return
        setState('missing')
        setMessage('Could not confirm this payment. Check your connection and try again.')
      }
    }

    void unlock()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-5 py-16 text-center sm:py-24">
        {state === 'checking' ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : state === 'granted' ? (
          <span className="flex size-10 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
            <Check className="size-5 text-accent" aria-hidden="true" />
          </span>
        ) : null}

        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          {state === 'granted'
            ? 'Pro Export unlocked'
            : state === 'pending'
              ? 'Payment still processing'
              : state === 'checking'
                ? 'Confirming payment'
                : 'Payment not confirmed'}
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{message}</p>

        {state === 'granted' ? (
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Your draft stays on this device. Open the generator and export PDF or Word with your real
            sign-off.
          </p>
        ) : null}

        <div className="mt-8 flex flex-col items-center gap-3">
          <a
            href="/#generator"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {state === 'granted' ? 'Export your cover letter →' : 'Back to generator'}
          </a>
          {state !== 'granted' && state !== 'checking' ? (
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Pro%20Export%20unlock`}
              className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Paid but stuck? Email {CONTACT_EMAIL}
            </a>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
