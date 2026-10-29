'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { CONTACT_EMAIL } from '@/lib/constants'
import { track } from '@/lib/ga'
import { grantProAccess } from '@/lib/pro-access'
import { rememberPaidExportDocument } from '@/lib/export-document-session'
import { interpretUnlockResponse, type UnlockUiState } from '@/lib/unlock-result'

type SuccessPayload = {
  granted?: boolean
  verified?: boolean
  checkoutId?: string
  documentId?: string
  scope?: string
  paymentStatus?: string
  error?: string
}

export default function SuccessPage() {
  const [state, setState] = useState<UnlockUiState | 'checking'>('checking')
  const [message, setMessage] = useState('Confirming your payment with Creem…')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutId = params.get('checkout_id') || ''
    const orderId = params.get('order_id') || ''
    const productId = params.get('product_id') || ''

    if (!checkoutId && !orderId) {
      setState('failed')
      setMessage('No payment confirmation was attached to this page. Pro Export was not unlocked.')
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
            request_id: params.get('request_id') || '',
          }),
        })
        const payload = (await res.json().catch(() => null)) as SuccessPayload | null

        if (cancelled) return

        const verified = payload?.verified === true
        const granted = payload?.granted === true
        const documentScoped = payload?.scope === 'document'
        if (documentScoped && payload?.documentId) rememberPaidExportDocument(payload.documentId)
        const browserStateSaved = verified && granted && !documentScoped ? grantProAccess(payload?.checkoutId || checkoutId) : false
        const view = interpretUnlockResponse({
          status: res.status,
          verified,
          granted,
          paymentStatus: typeof payload?.paymentStatus === 'string' ? payload.paymentStatus : undefined,
          browserStateSaved,
          documentScoped,
        })

        if (view.trackPurchase && payload?.checkoutId) {
          const purchaseKey = `ezcl_ga_purchase_${payload.checkoutId}`
          let alreadyTracked = false
          try {
            alreadyTracked = window.sessionStorage.getItem(purchaseKey) === '1'
            if (!alreadyTracked) window.sessionStorage.setItem(purchaseKey, '1')
          } catch {
            alreadyTracked = false
          }
          if (!alreadyTracked) {
            track('purchase', {
              transaction_id: payload.checkoutId,
              value: 4.99,
              currency: 'USD',
            })
          }
        }

        if (view.state === 'granted') {
          setMessage(
            documentScoped
              ? 'This cover letter is unlocked. PDF and Word stay available for this letter.'
              : 'Pro Export is unlocked on this browser. PDF and Word are ready.',
          )
        } else if (view.state === 'pending') {
          setMessage(payload?.error || 'Payment is still processing. Pro Export stays locked until it completes.')
        } else if (view.state === 'entitlement_pending') {
          setMessage(
            browserStateSaved
              ? payload?.error ||
                  'Your payment was confirmed, but Pro Export is not active on this browser yet. Refresh this page. You do not need to pay again.'
              : 'Your payment was verified, but this browser could not save Pro status. Allow site data for this site, then refresh this page. You do not need to pay again.',
          )
        } else {
          setMessage(payload?.error || 'Could not confirm this payment. Pro Export was not unlocked.')
        }
        setState(view.state)
      } catch {
        if (cancelled) return
        setState('failed')
        setMessage('Could not confirm this payment. Check your connection and try again. Pro Export was not unlocked.')
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
                : state === 'entitlement_pending'
                  ? 'Pro Export not active yet'
                  : 'Payment not confirmed'}
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{message}</p>

        {state === 'granted' ? (
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Your draft stays in this tab. PDF and Word for a purchased letter use that saved letter. You can
            also download it from your account.
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
