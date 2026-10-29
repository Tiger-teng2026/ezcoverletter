'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, FileText, Loader2, Lock } from 'lucide-react'
import { extractContactFromResume } from '@/lib/contact-from-resume'
import { toFrictionCopyText } from '@/lib/copy-letter'
import { loadContact, saveContact } from '@/lib/draft-storage'
import { downloadBlob, printHtmlDocument } from '@/lib/export-download'
import { exportDocumentForLetter, exportFailureAction, rememberExportDocument } from '@/lib/export-document-session'
import { track } from '@/lib/ga'
import { clearProDisplay, useProAccess } from '@/lib/pro-access'
import type { SignOffContact } from '@/lib/sign-off'
type Props = {
  letter: string
  isLoading: boolean
  /** Used only to autofill Pro export contact fields from the pasted resume. */
  resume?: string
}

/** Screen preview: highlight keywords without padding that creates gaps before punctuation. */
function renderLetter(letter: string) {
  return letter.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) => {
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return (
        <mark
          key={i}
          className="rounded-sm bg-accent/20 font-medium text-accent underline decoration-accent/40 underline-offset-2"
        >
          {chunk.slice(2, -2)}
        </mark>
      )
    }
    return <span key={i}>{chunk}</span>
  })
}


function ContactInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
}) {
  const filled = value.trim().length > 0

  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        {label}
        {filled ? (
          <span className="inline-flex items-center gap-1 text-accent">
            <Check className="size-3" aria-hidden="true" />
            Ready
          </span>
        ) : null}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-border bg-secondary px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60"
      />
    </label>
  )
}

const proButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-500/20 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400'

export function ResultPanel({ letter, isLoading, resume = '' }: Props) {
  const hasProAccess = useProAccess()
  const [copied, setCopied] = useState(false)
  const [proHint, setProHint] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'word' | null>(null)
  const exportLock = useRef(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const canSaveContact = useRef(false)

  useEffect(() => {
    const stored = loadContact()
    if (stored.fullName) setFullName((prev) => prev || stored.fullName || '')
    if (stored.phone) setPhone((prev) => prev || stored.phone || '')
    if (stored.email) setEmail((prev) => prev || stored.email || '')
    if (stored.linkedin) setLinkedin((prev) => prev || stored.linkedin || '')
  }, [])

  useEffect(() => {
    if (!resume.trim()) return
    const extracted = extractContactFromResume(resume)
    setFullName((prev) => prev || extracted.fullName || '')
    setPhone((prev) => prev || extracted.phone || '')
    setEmail((prev) => prev || extracted.email || '')
    setLinkedin((prev) => prev || extracted.linkedin || '')
  }, [resume])

  useEffect(() => {
    if (!canSaveContact.current) {
      canSaveContact.current = true
      return
    }
    saveContact({ fullName, phone, email, linkedin })
  }, [fullName, phone, email, linkedin])

  const contact: SignOffContact = { fullName, phone, email, linkedin }
  const hasContent = letter.trim().length > 0
  const exportReady =
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    email.trim().length > 0 &&
    linkedin.trim().length > 0
  const filledCount = [fullName, phone, email, linkedin].filter((v) => v.trim()).length

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toFrictionCopyText(letter))
      track('cover_letter_copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      console.log('[v0] Clipboard write failed:', err)
    }
  }

  async function createExportDocument() {
    const saved = await fetch('/api/billing/export-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter, title: 'Cover letter', contact }),
    })
    const savedPayload = (await saved.json().catch(() => null)) as { documentId?: string; error?: string } | null
    if (saved.status === 401) {
      window.location.href = '/login'
      return null
    }
    if (!saved.ok || !savedPayload?.documentId) {
      setProHint(savedPayload?.error || 'This letter could not be saved for export.')
      return null
    }
    rememberExportDocument(letter, savedPayload.documentId)
    return savedPayload.documentId
  }

  async function finishExportResponse(res: Response, format: 'pdf' | 'word') {
    if (format === 'pdf') {
      const html = await res.text()
      if (!html.includes('id="letter"')) {
        setProHint('Export failed.')
        return
      }
      printHtmlDocument(html)
      return
    }
    const blob = await res.blob()
    if (blob.size === 0) {
      setProHint('Word export failed.')
      return
    }
    downloadBlob(blob, 'cover-letter.doc')
  }

  function requireContactForExport(): boolean {
    if (!exportReady) {
      setProHint(
        'Before PDF/Word export, fill in your Full Name, Phone, Email, and LinkedIn below. Pro Export never includes [placeholder] text.',
      )
      window.setTimeout(() => setProHint(null), 6000)
      return false
    }
    return true
  }

  async function deliverExport(format: 'pdf' | 'word') {
    if (exportLock.current) return
    exportLock.current = true
    setExporting(format)
    setProHint(null)
    try {
      const known = exportDocumentForLetter(letter)
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, letter, contact, documentId: known || undefined }),
      })

      if (res.ok) {
        await finishExportResponse(res, format)
        return
      }

      const action = exportFailureAction(res.status, known)
      if (action === 'stop') {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setProHint(payload?.error || 'Export failed.')
        return
      }

      clearProDisplay()
      const documentId = action === 'resume' ? known : await createExportDocument()
      if (!documentId) return
      const { startDocumentCheckout } = await import('@/lib/start-checkout')
      const result = await startDocumentCheckout(documentId)
      if (!result.ok) {
        setProHint(result.error)
        return
      }
      if (result.alreadyOwned) {
        const paid = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, documentId, contact }),
        })
        if (!paid.ok) {
          const payload = (await paid.json().catch(() => null)) as { error?: string } | null
          setProHint(payload?.error || 'This letter is paid, but the file could not be created.')
          return
        }
        await finishExportResponse(paid, format)
      }
    } catch (err) {
      console.log('[v0] Export failed:', err)
      setProHint(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      exportLock.current = false
      setExporting(null)
    }
  }

  async function handleWordClick() {
    track('pro_export_click', { format: 'word' })
    if (!requireContactForExport()) return
    await deliverExport('word')
  }

  async function handlePdfClick() {
    track('pro_export_click', { format: 'pdf' })
    if (!requireContactForExport()) return
    await deliverExport('pdf')
  }

  return (
    <section
      aria-label="Generated cover letter"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold tracking-tight">Your Cover Letter</h2>
            {isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                writing…
              </span>
            )}
          </div>
          {hasContent && (
            <p className="pl-6 text-[11px] text-muted-foreground">
              {hasProAccess
                ? 'Pro Export unlocked on this browser · PDF and Word use your real sign-off'
                : 'Copy is included. PDF and Word need a subscription or a purchase of this letter.'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasContent}
            title="Free: copy raw text with placeholders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {copied ? (
              <Check className="size-3.5 text-accent" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            type="button"
            onClick={() => void handleWordClick()}
            disabled={!hasContent || exporting !== null}
            title={hasProAccess ? 'Download Word' : 'Export this letter: Word'}
            className={proButtonClass}
          >
            {hasProAccess ? null : <Lock className="size-3" aria-hidden="true" />}
            <Download className="size-3.5" aria-hidden="true" />
            Word
            <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {hasProAccess ? 'READY' : 'PRO'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handlePdfClick()}
            disabled={!hasContent || exporting !== null}
            title={hasProAccess ? 'Download PDF' : 'Export this letter: PDF'}
            className={proButtonClass}
          >
            {hasProAccess ? null : <Lock className="size-3" aria-hidden="true" />}
            <Download className="size-3.5" aria-hidden="true" />
            PDF
            <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {hasProAccess ? 'READY' : 'PRO'}
            </span>
          </button>
        </div>
      </div>

      {proHint && (
        <p
          role="status"
          className="border-b border-violet-500/30 bg-violet-500/10 px-5 py-2.5 text-[12px] leading-relaxed text-violet-100"
        >
          {proHint}
        </p>
      )}

      {/* Contact form appears once a letter exists — keeps empty state clean */}
      {hasContent && (
        <div className="border-b border-border/70 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <p className="text-[13px] font-semibold">Sign-off details for PDF / Word</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Autofilled from your resume when possible. Required before PDF or Word export —
                Free Copy never uses these fields.
              </p>
            </div>
            <p
              className={
                'text-[11px] font-medium tabular-nums ' +
                (exportReady ? 'text-accent' : 'text-muted-foreground')
              }
            >
              {exportReady ? 'Export details ready' : `${filledCount}/4 fields filled`}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ContactInput
              id="export-full-name"
              label="Full Name"
              value={fullName}
              onChange={setFullName}
              placeholder="Jane Doe"
            />
            <ContactInput
              id="export-phone"
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="+1 (555) 123-4567"
              type="tel"
            />
            <ContactInput
              id="export-email"
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="jane@example.com"
              type="email"
            />
            <ContactInput
              id="export-linkedin"
              label="LinkedIn URL"
              value={linkedin}
              onChange={setLinkedin}
              placeholder="https://linkedin.com/in/janedoe"
              type="url"
            />
          </div>
        </div>
      )}

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        {hasContent ? (
          <article
            aria-live="polite"
            className="letter-preview mx-auto max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-card-foreground"
          >
            {renderLetter(letter)}
          </article>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-secondary">
              <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Paste your resume and job description, then generate. Your letter appears here — with
              Copy is included. PDF and Word require a verified subscription or a purchase of this letter.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
