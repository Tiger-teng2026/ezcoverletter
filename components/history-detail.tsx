'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import { presentSavedResult, type ContentBlock, type SavedResultView } from '@/lib/history-display'

const actionClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40'

export function HistoryDetail() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : ''
  const [view, setView] = useState<SavedResultView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setView(null)
    void fetch(`/api/history/${id}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
        if (cancelled) return
        if (!response.ok) {
          setError(typeof payload?.error === 'string' ? payload.error : 'Could not open this result.')
          return
        }
        setView(presentSavedResult(payload ?? {}))
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the server.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function copyLetter() {
    if (!view?.copyText) return
    try {
      await navigator.clipboard.writeText(view.copyText)
      setCopied(true)
      setActionError(null)
    } catch {
      setActionError('Could not copy this letter.')
    }
  }

  async function deleteResult() {
    if (!id || deleting) return
    setDeleting(true)
    setActionError(null)
    try {
      const response = await fetch(`/api/history/${id}`, { method: 'DELETE' })
      if (response.status === 204) {
        router.push('/account')
        return
      }
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      setActionError(payload?.error || 'Could not delete this result.')
      setDeleting(false)
    } catch {
      setActionError('Could not reach the server.')
      setDeleting(false)
    }
  }

  return (
    <div>
      <Link href="/account" className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">
        Back to account
      </Link>
      {loading ? <p className="mt-6 text-[13px] text-muted-foreground">Loading saved result…</p> : null}
      {error ? (
        <p role="alert" className="mt-6 text-[13px] leading-relaxed">
          {error}{' '}
          {/sign in/i.test(error) ? (
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          ) : null}
        </p>
      ) : null}
      {view ? <SavedResult view={view} copied={copied} deleting={deleting} onCopy={() => void copyLetter()} onDelete={() => void deleteResult()} /> : null}
      {actionError ? (
        <p role="alert" className="mt-4 text-[13px] text-destructive">
          {actionError}
        </p>
      ) : null}
    </div>
  )
}

function SavedResult({
  view,
  copied,
  deleting,
  onCopy,
  onDelete,
}: {
  view: SavedResultView
  copied: boolean
  deleting: boolean
  onCopy: () => void
  onDelete: () => void
}) {
  return (
    <article className="mt-6">
      <p className="text-[13px] font-medium text-muted-foreground">{view.toolLabel}</p>
      <h1 className="mt-2 line-clamp-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl" title={view.heading}>{view.heading}</h1>
      <dl className="mt-3 flex flex-col gap-1 text-[13px] text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
        <div>
          <dt className="sr-only">Generated</dt>
          <dd>{view.dateLabel}</dd>
        </div>
        {view.tone ? (
          <div>
            <dt className="sr-only">Tone</dt>
            <dd>Tone · {view.tone}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {view.kind === 'cover-letter' && view.copyText ? (
          <button type="button" className={actionClass} onClick={onCopy}>
            {copied ? <Check className="size-3.5 text-accent" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy Cover Letter'}
          </button>
        ) : null}
        <button type="button" className={actionClass} onClick={onDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      <div className="mt-6">
        {view.kind === 'job-match' && view.match ? <MatchReport match={view.match} /> : null}
        {view.kind === 'cover-letter' && view.letter ? <LetterDocument letter={view.letter} /> : null}
        {view.kind === 'document' ? <DocumentBlocks blocks={view.blocks} /> : null}
      </div>

      <SourceDetails resume={view.resume} job={view.job} />
    </article>
  )
}

function MatchReport({ match }: { match: NonNullable<SavedResultView['match']> }) {
  const tone = match.matchScore >= 80 ? 'text-accent' : match.matchScore >= 60 ? 'text-primary' : 'text-destructive'
  return (
    <section aria-label="Job Match Score" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
        <h2 className="text-sm font-semibold tracking-tight">Job Match Score</h2>
        <p className={'font-mono text-4xl font-semibold tabular-nums sm:text-5xl ' + tone}>
          {match.matchScore}
          <span className="ml-1 text-[15px] font-medium text-muted-foreground">%</span>
        </p>
      </div>
      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-2">
        <SkillTags label="Matched Skills" skills={match.matchedSkills} empty="No overlapping skills were found." variant="matched" />
        <SkillTags label="Missing Skills" skills={match.missingSkills} empty="No major missing requirements stood out." variant="missing" />
      </div>
      <div className="border-t border-border/70 px-5 py-5 sm:px-6">
        <h2 className="text-[12px] font-semibold">Experience Match</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-card-foreground">{match.experienceMatch}</p>
      </div>
      <div className="border-t border-border/70 px-5 py-5 sm:px-6">
        <h2 className="text-[12px] font-semibold">Suggestions</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-card-foreground">
          {match.suggestions.map((item, index) => (
            <li key={`${index}-${item}`} className="pl-1">
              {item}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function SkillTags({
  label,
  skills,
  empty,
  variant,
}: {
  label: string
  skills: string[]
  empty: string
  variant: 'matched' | 'missing'
}) {
  const chip =
    variant === 'matched'
      ? 'border-accent/30 bg-accent/10 text-accent'
      : 'border-destructive/30 bg-destructive/10 text-destructive'
  return (
    <div>
      <h2 className="text-[12px] font-semibold">{label}</h2>
      {skills.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li key={skill} className={'rounded-full border px-2.5 py-1 text-[12px] font-medium ' + chip}>
              {skill}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LetterDocument({ letter }: { letter: string }) {
  const paragraphs = letter.replace(/\r\n/g, '\n').split(/\n{2,}/).filter((part) => part.trim().length > 0)
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl space-y-4 text-[15px] leading-relaxed text-card-foreground">
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 48)} className="break-words">
            {renderParagraph(paragraph)}
          </p>
        ))}
      </div>
    </div>
  )
}

function renderParagraph(paragraph: string) {
  const lines = paragraph.split('\n')
  return lines.map((line, lineIndex) => (
    <span key={`${lineIndex}-${line.slice(0, 24)}`}>
      {lineIndex > 0 ? <br /> : null}
      {renderInline(line)}
    </span>
  ))
}

function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((chunk, index) => {
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return (
        <mark
          key={`${index}-${chunk.slice(0, 24)}`}
          className="rounded-sm bg-accent/20 font-medium text-accent underline decoration-accent/40 underline-offset-2"
        >
          {chunk.slice(2, -2)}
        </mark>
      )
    }
    return <span key={`${index}-${chunk.slice(0, 24)}`}>{chunk}</span>
  })
}

function DocumentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card px-5 py-6 sm:px-6">
      {blocks.map((block, index) => {
        if (block.type === 'label') {
          return (
            <h2 key={`${block.text}-${index}`} className="text-[12px] font-semibold">
              {block.text}
            </h2>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={block.items[0]} className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-card-foreground">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={`${index}-${block.text.slice(0, 32)}`} className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-card-foreground">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function SourceDetails({ resume, job }: { resume: string | null; job: string | null }) {
  if (!resume && !job) return null
  return (
    <details className="mt-6 rounded-2xl border border-border bg-card px-5 py-4">
      <summary className="cursor-pointer text-[13px] font-semibold">Resume and job description</summary>
      <div className="mt-4 space-y-5">
        {resume ? <SourceBlock label="Resume" text={resume} /> : null}
        {job ? <SourceBlock label="Job description" text={job} /> : null}
      </div>
    </details>
  )
}

function SourceBlock({ label, text }: { label: string; text: string }) {
  return (
    <section>
      <h2 className="text-[12px] font-semibold">{label}</h2>
      <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-muted-foreground">
        {text}
      </pre>
    </section>
  )
}
