'use client'

import { useState } from 'react'
import { SIGN_IN_UNAVAILABLE } from '@/lib/plans'

export function LoginForm({ configured, notice = null }: { configured: boolean; notice?: string | null }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(configured ? notice : SIGN_IN_UNAVAILABLE)
  const [loading, setLoading] = useState(false)

  if (!configured) {
    return <p role="alert" className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]">{SIGN_IN_UNAVAILABLE}</p>
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        setLoading(true)
        setMessage(null)
        void fetch('/api/auth/magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
          .then(async (response) => {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null
            setMessage(response.ok ? 'Check your email for the sign-in link.' : payload?.error || 'Sign-in failed.')
          })
          .catch(() => setMessage('Could not reach the server.'))
          .finally(() => setLoading(false))
      }}
    >
      <label className="text-[12px] font-medium text-muted-foreground" htmlFor="login-email">
        Email
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-[13px]"
          placeholder="you@example.com"
        />
      </label>
      <button type="submit" disabled={loading} className="inline-flex w-fit rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
        {loading ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {message ? <p role={notice && message === notice ? 'alert' : 'status'} className="text-[13px] text-muted-foreground">{message}</p> : null}
    </form>
  )
}
