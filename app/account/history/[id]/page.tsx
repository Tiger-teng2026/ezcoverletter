'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

type Row = {
  id: string
  tool: string
  title: string
  input: unknown
  output: unknown
  createdAt: string
  error?: string
}

export default function HistoryDetailPage() {
  const params = useParams<{ id: string }>()
  const [row, setRow] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch(`/api/history/${params.id}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as Row | null
        if (!response.ok) {
          setError(payload?.error || 'Could not open this result.')
          return
        }
        setRow(payload)
      })
      .catch(() => setError('Could not reach the server.'))
  }, [params.id])

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <Link href="/account" className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">Back to account</Link>
        {error ? <p role="alert" className="mt-6 text-[13px]">{error}</p> : null}
        {row ? (
          <article className="mt-6">
            <h1 className="text-2xl font-semibold">{row.title}</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">{row.tool} · {row.createdAt}</p>
            <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 text-[13px]">{JSON.stringify({ input: row.input, output: row.output }, null, 2)}</pre>
          </article>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  )
}
