'use client'

import { useState } from 'react'
import type { PaidPlanId } from '@/lib/plans'

export function SubscribeButton({ plan, label }: { plan: PaidPlanId; label: string }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setLoading(true)
          setError(null)
          void fetch('/api/billing/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan }),
          })
            .then(async (response) => {
              const payload = (await response.json().catch(() => null)) as { error?: string; checkoutUrl?: string } | null
              if (response.status === 401) {
                window.location.href = '/login'
                return
              }
              if (!response.ok || !payload?.checkoutUrl) {
                setError(payload?.error || 'Checkout is unavailable.')
                setLoading(false)
                return
              }
              window.location.href = payload.checkoutUrl
            })
            .catch(() => {
              setError('Could not reach the server.')
              setLoading(false)
            })
        }}
        className="inline-flex rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {loading ? 'Starting checkout…' : label}
      </button>
      {error ? <p role="alert" className="mt-2 text-[13px] text-muted-foreground">{error}</p> : null}
    </div>
  )
}
