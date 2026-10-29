'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { downloadBlob, printHtmlDocument } from '@/lib/export-download'
import { formatUsd, PLANS, PRO_EXPORT } from '@/lib/plans'

type Account = {
  signedIn: boolean
  email: string | null
  plan: 'free' | 'creator' | 'pro'
  status: string
  message: string
  allowance: number
  used: number
  remaining: number
  periodStart: string
  currentPeriodEnd: string | null
  resetAt?: string | null
  scheduledPlan?: 'creator' | 'pro' | null
  purchases?: { id: string; title: string }[]
  history: { id: string; tool: string; title: string; createdAt: string }[]
  error?: string
}

export function AccountPanel({ billingReturn, welcome }: { billingReturn: boolean; welcome?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)

  async function downloadPurchase(documentId: string, format: 'pdf' | 'word') {
    setCancelMessage(null)
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, format }),
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      setCancelMessage(payload?.error || 'This letter could not be downloaded.')
      return
    }
    if (format === 'pdf') {
      printHtmlDocument(await response.text())
      return
    }
    downloadBlob(await response.blob(), 'cover-letter.doc')
  }

  function load() {
    void fetch('/api/account')
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as Account | null
        if (!response.ok) {
          setError(payload?.error || 'The account service is unavailable.')
          setAccount(null)
          return
        }
        setAccount(payload)
      })
      .catch(() => setError('Could not reach the server.'))
  }

  useEffect(() => {
    load()
  }, [])

  if (error) return <p role="alert" className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]">{error}</p>
  if (!account) return <p className="text-[13px] text-muted-foreground">Loading account…</p>

  return (
    <div className="flex flex-col gap-5">
      {welcome && account.signedIn ? (
        <p role="status" className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]">You are signed in.</p>
      ) : null}
      {billingReturn ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-[13px] leading-relaxed">
          Payment is processing. The plan updates when Creem confirms it. Returning to this page is not proof of payment.
        </p>
      ) : null}
      <section className="rounded-2xl border border-border bg-card px-5 py-5">
        <h2 className="text-[15px] font-semibold">{account.signedIn ? account.email || 'Signed in' : 'Signed out'}</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Plan: {PLANS[account.plan].name} · {account.remaining} of {account.allowance} credits left. Resets {account.resetAt || account.periodStart}.
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">Status: {account.status}</p>
        {account.currentPeriodEnd ? <p className="mt-2 text-[13px] text-muted-foreground">Current period ends {account.currentPeriodEnd}</p> : null}
        {account.scheduledPlan ? (
          <p className="mt-2 text-[13px] leading-relaxed">
            A later plan name was stored locally. This period keeps the current allowance. Creem has not been asked to change the next charge.
          </p>
        ) : null}
        {account.message ? <p className="mt-2 text-[13px] leading-relaxed">{account.message}</p> : null}
        <p className="mt-3 text-[13px] text-muted-foreground">
          {PRO_EXPORT.name} ({formatUsd(PRO_EXPORT.priceUsd)} one-time) unlocks PDF and Word for one saved cover letter. An active Creator or Pro subscription includes export until that period ends.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {account.signedIn ? (
            <button
              type="button"
              className="rounded-full border border-border px-4 py-2 text-[13px]"
              onClick={() => {
                void fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                  window.location.href = '/login'
                })
              }}
            >
              Log out
            </button>
          ) : (
            <Link href="/login" className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground">Sign in</Link>
          )}
          <Link href="/pricing" className="rounded-full border border-border px-4 py-2 text-[13px]">Upgrade</Link>
          {account.signedIn && account.plan !== 'free' ? (
            <button
              type="button"
              className="rounded-full border border-border px-4 py-2 text-[13px]"
              onClick={() => {
                setCancelMessage(null)
                void fetch('/api/billing/cancel', { method: 'POST' })
                  .then(async (response) => {
                    const payload = (await response.json().catch(() => null)) as { error?: string; status?: string } | null
                    setCancelMessage(response.ok ? `Cancellation requested (${payload?.status}).` : payload?.error || 'Cancellation failed.')
                    load()
                  })
                  .catch(() => setCancelMessage('Could not reach the server.'))
              }}
            >
              Cancel at period end
            </button>
          ) : null}
        </div>
        {cancelMessage ? <p className="mt-3 text-[13px]">{cancelMessage}</p> : null}
        {account.plan !== 'free' ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Cancellation asks Creem to stop renewal at the end of the current period. Paid credits and export remain until that period ends.
          </p>
        ) : null}
        {(account.purchases ?? []).length > 0 ? (
          <div className="mt-4">
            <h3 className="text-[13px] font-semibold">Purchased letters</h3>
            <ul className="mt-2 space-y-2 text-[13px]">
              {account.purchases?.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{item.title}</span>
                  <span className="flex gap-2">
                    <button type="button" className="underline-offset-4 hover:underline" onClick={() => void downloadPurchase(item.id, 'pdf')}>PDF</button>
                    <button type="button" className="underline-offset-4 hover:underline" onClick={() => void downloadPurchase(item.id, 'word')}>Word</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section className="rounded-2xl border border-border bg-card px-5 py-5">
        <h2 className="text-[15px] font-semibold">Saved results</h2>
        {account.history.length === 0 ? <p className="mt-2 text-[13px] text-muted-foreground">No saved results yet.</p> : (
          <ul className="mt-3 space-y-2">
            {account.history.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-[13px]">
                <Link href={`/account/history/${item.id}`} className="underline-offset-4 hover:underline">{item.title || item.tool}</Link>
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => {
                    void fetch(`/api/history/${item.id}`, { method: 'DELETE' }).then(() => load())
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
