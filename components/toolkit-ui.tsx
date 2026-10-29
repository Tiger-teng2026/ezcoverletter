'use client'

import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'

export const fieldClass =
  'rounded-lg border border-border bg-secondary px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60'

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={id}>
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      {rows <= 1 ? (
        <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={fieldClass} />
      ) : (
        <textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={fieldClass}
        />
      )}
    </label>
  )
}

export function CopyTextButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={!text.trim()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
    >
      {copied ? <Check className="size-3.5 text-accent" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function useToolkitRequest<T>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<T | null>(null)

  async function submit(url: string, body: unknown): Promise<T | null> {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json().catch(() => null)) as ({ error?: string } & Partial<T>) | null
      if (!response.ok || !payload || typeof payload !== 'object') {
        setError((payload && payload.error) || 'Request failed.')
        return null
      }
      if ('error' in payload && payload.error && Object.keys(payload).length === 1) {
        setError(payload.error)
        return null
      }
      setResult(payload as T)
      return payload as T
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, result, submit, setResult }
}

export function SubmitRow({
  loading,
  label,
  disabled = false,
}: {
  loading: boolean
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {loading ? 'Working…' : label}
    </button>
  )
}

export function StatusNote({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
      {error}
    </p>
  )
}
