'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Briefcase, Check, Loader2, Sparkles, Target, User } from 'lucide-react'
import { MatchError, MatchPanel } from '@/components/match-panel'
import { ResultPanel } from '@/components/result-panel'
import { loadDraft, saveDraft } from '@/lib/draft-storage'
import { track } from '@/lib/ga'
import { parseMatchResult, type JobMatchResult } from '@/lib/match-schema'

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'concise', label: 'Concise & Short' },
  { id: 'natural', label: 'Natural Human' },
] as const

type ToneId = (typeof TONES)[number]['id']

const MIN_CHARS = 40

function Field({
  id,
  label,
  hint,
  icon,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const ready = value.trim().length >= MIN_CHARS

  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-card transition-colors focus-within:border-primary/60">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <label htmlFor={id} className="flex items-center gap-2 text-[13px] font-semibold">
          {icon}
          {label}
        </label>
        <span
          className={
            'font-mono text-[11px] tabular-nums ' +
            (ready ? 'text-accent' : 'text-muted-foreground')
          }
        >
          {ready ? 'Ready · ' : ''}
          {value.length.toLocaleString('en-US')}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={12}
        className="min-h-56 w-full resize-y bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-card-foreground outline-none placeholder:text-muted-foreground/70"
      />
      <p className="border-t border-border/50 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

export function Generator() {
  const [resume, setResume] = useState('')
  const [job, setJob] = useState('')
  const [tone, setTone] = useState<ToneId>('natural')
  const [highlight, setHighlight] = useState(true)
  const [letter, setLetter] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchResult, setMatchResult] = useState<JobMatchResult | null>(null)
  const [matchSnapshot, setMatchSnapshot] = useState<{ resume: string; job: string } | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const matchRef = useRef<HTMLDivElement>(null)
  const canSaveDraft = useRef(false)
  const startedApplication = useRef(false)
  const resumeSubmitted = useRef(false)
  const jobSubmitted = useRef(false)

  function handleResumeChange(value: string) {
    if (!startedApplication.current) {
      startedApplication.current = true
      track('start_application')
    }
    if (!resumeSubmitted.current && value.trim().length >= MIN_CHARS) {
      resumeSubmitted.current = true
      track('resume_submit')
    }
    setResume(value)
  }

  function handleJobChange(value: string) {
    if (!startedApplication.current) {
      startedApplication.current = true
      track('start_application')
    }
    if (!jobSubmitted.current && value.trim().length >= MIN_CHARS) {
      jobSubmitted.current = true
      track('job_description_submit')
    }
    setJob(value)
  }

  useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      setResume(draft.resume)
      setJob(draft.job)
      if (TONES.some((item) => item.id === draft.tone)) {
        setTone(draft.tone as ToneId)
      }
      setHighlight(draft.highlight)
      setLetter(draft.letter)
      setMatchResult(draft.matchResult)
      setMatchSnapshot(draft.matchSnapshot)
    }
  }, [])

  useEffect(() => {
    if (!canSaveDraft.current) {
      canSaveDraft.current = true
      return
    }
    saveDraft({
      resume,
      job,
      tone,
      highlight,
      letter,
      matchResult,
      matchSnapshot,
    })
  }, [resume, job, tone, highlight, letter, matchResult, matchSnapshot])

  const materialsReady =
    resume.trim().length >= MIN_CHARS && job.trim().length >= MIN_CHARS
  const canGenerate = materialsReady && !isLoading && !isMatching
  const canAnalyze = materialsReady && !isLoading && !isMatching
  const matchIsStale =
    !!matchResult &&
    !!matchSnapshot &&
    (matchSnapshot.resume !== resume || matchSnapshot.job !== job)
  const matchForGenerate = matchResult && !matchIsStale ? matchResult : null

  async function handleGenerate() {
    if (isLoading) return
    setError(null)

    if (resume.trim().length < MIN_CHARS || job.trim().length < MIN_CHARS) {
      setError('Paste both your resume and the job description (at least 40 characters each).')
      return
    }

    setIsLoading(true)
    setLetter('')
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume,
          job,
          tone,
          highlightKeywords: highlight,
          ...(matchForGenerate ? { matchAnalysis: matchForGenerate } : {}),
        }),
      })

      if (!res.ok || !res.body) {
        const message = await res.text()
        throw new Error(message || 'Generation failed. Please try again.')
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let acc = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        acc += value
        if (acc.startsWith('[Generation ')) {
          setError(acc)
          setLetter('')
        } else {
          setLetter(acc)
        }
      }

      if (acc.trim() && !acc.startsWith('[Generation ')) {
        track('cover_letter_generate')
      }
    } catch (err) {
      console.log('[v0] Generation error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAnalyzeMatch() {
    if (isMatching || isLoading) return
    setMatchError(null)

    if (resume.trim().length < MIN_CHARS || job.trim().length < MIN_CHARS) {
      setMatchError('Paste both your resume and the job description (at least 40 characters each).')
      return
    }

    setIsMatching(true)
    matchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, job }),
      })

      const payload = (await res.json().catch(() => null)) as
        | JobMatchResult
        | { error?: string }
        | null

      if (!res.ok) {
        const message =
          payload && 'error' in payload && payload.error
            ? payload.error
            : 'Could not score this job match. Please try again.'
        throw new Error(message)
      }

      const result = parseMatchResult(payload)
      if (!result) {
        throw new Error('Could not read a valid job match score. Please try again.')
      }

      setMatchResult(result)
      setMatchSnapshot({ resume, job })
      track('job_match_complete')
    } catch (err) {
      console.log('[v0] Match error:', err)
      setMatchResult(null)
      setMatchSnapshot(null)
      setMatchError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsMatching(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Step 1 · Paste your materials
        </p>
        <p className="text-[13px] text-muted-foreground">
          A local draft stays in this browser so checkout does not erase your letter. If you are signed in, the resume, job description, and result are also saved to your account.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          id="resume"
          label="Paste Resume / CV"
          hint="Put your name on the first line, plus email, phone, and LinkedIn — we autofill the export sign-off from these. Include hard metrics (%, $, days)."
          icon={<User className="size-3.5 text-primary" aria-hidden="true" />}
          value={resume}
          onChange={handleResumeChange}
          placeholder={
            'Jane Doe\nSenior Product Designer\njane.doe@email.com | +1 (415) 555-0188 | linkedin.com/in/jane-doe\n\nAcme Inc — Senior Product Designer (2021–2025)\n• Led checkout redesign that lifted conversion 18% and cut drop-off by 12 days in the funnel\n• Shipped a 120-component design system adopted by 40 engineers across 3 product squads\n• Ran 25+ discovery interviews and turned findings into a roadmap that grew activation 22%\n\nSkills: Figma, design systems, B2C SaaS, user research, HTML/CSS, A/B testing'
          }
        />
        <Field
          id="job"
          label="Paste Job Description"
          hint="Include the company name, a concrete product/initiative, and numbered requirements so the letter can open with a sharp, tailored hook."
          icon={<Briefcase className="size-3.5 text-accent" aria-hidden="true" />}
          value={job}
          onChange={handleJobChange}
          placeholder={
            'Product Designer, Growth — Northwind\nSan Francisco, CA (Hybrid)\n\nAbout the role:\nNorthwind is rebuilding onboarding around our new Activation Hub launch. You will own end-to-end design for signup, first-value, and retention experiments with PM and engineering.\n\nWhat you will do:\n• Lead UX for Activation Hub and related growth surfaces\n• Partner with PMs and engineers on rapid A/B tests\n• Strengthen our shared design system for growth use cases\n\nRequirements:\n• 5+ years product design, ideally B2C SaaS\n• Proven impact on conversion, activation, or retention metrics\n• Experience with design systems and cross-functional shipping'
          }
        />
      </div>

      {/* Optional Job Match Score */}
      <div ref={matchRef} className="flex flex-col gap-3 scroll-mt-24">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Step 2 · Job Match Score
          </p>
          <p className="text-[13px] text-muted-foreground">
            Optional. See how your resume fits this posting — or skip and generate a cover letter
            below.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleAnalyzeMatch}
            disabled={!canAnalyze}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-[13px] font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
          >
            {isMatching ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Scoring match…
              </>
            ) : (
              <>
                <Target className="size-4 text-primary" aria-hidden="true" />
                Get Job Match Score
              </>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground">
            Does not replace Generate. Cover letters still work without this step.
          </p>
        </div>

        {matchError ? <MatchError message={matchError} /> : null}
        <MatchPanel result={matchResult} isLoading={isMatching} isStale={matchIsStale} />
      </div>

      {/* Options */}
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Step 3 · Tune the letter
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold">Tone</span>
            <span className="text-[11px] text-muted-foreground">
              How the letter should sound to a human reader.
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Tone"
            className="flex flex-wrap gap-1 rounded-xl border border-border bg-secondary p-1"
          >
            {TONES.map((t) => {
              const active = tone === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTone(t.id)}
                  className={
                    'rounded-lg px-3.5 py-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
                    (active
                      ? 'bg-primary text-primary-foreground shadow-[0_0_18px_-8px_var(--color-primary)]'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="h-px bg-border" />

        <label className="flex cursor-pointer items-start gap-3">
          <span
            className={
              'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ' +
              (highlight ? 'border-accent bg-accent' : 'border-border bg-secondary')
            }
            aria-hidden="true"
          >
            {highlight && <Check className="size-3 text-accent-foreground" />}
          </span>
          <input
            type="checkbox"
            checked={highlight}
            onChange={(e) => setHighlight(e.target.checked)}
            className="sr-only"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">Highlight Matched Keywords</span>
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              Marks the exact phrases shared by your resume and the posting, so you can see the ATS
              match at a glance.
            </span>
          </span>
        </label>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Step 4 · Generate
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-primary to-accent px-8 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_40px_-12px_var(--color-primary)] transition-all hover:shadow-[0_14px_50px_-10px_var(--color-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Writing your letter…
            </>
          ) : (
            <>
              Generate Anti-AI Cover Letter
              <Sparkles className="size-4 transition-transform group-hover:rotate-12" aria-hidden="true" />
            </>
          )}
        </button>

        {error ? (
          <p
            role="alert"
            className="flex max-w-xl items-start gap-1.5 text-pretty text-center text-[12px] leading-relaxed text-destructive sm:text-left"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            {matchForGenerate
              ? 'Using your Job Match Score to tailor this letter · Skip match anytime'
              : 'Copy is included. PDF and Word need an active subscription or a $4.99 purchase of this letter.'}
          </p>
        )}
      </div>

      <div ref={resultRef} className="scroll-mt-24">
        <div className="mb-3 flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Step 5 · Review & export
          </p>
          <p className="text-[13px] text-muted-foreground">
            Copy is included. PDF and Word use your real sign-off after export is verified.
            details filled in.
          </p>
        </div>
        <ResultPanel letter={letter} isLoading={isLoading} resume={resume} />
      </div>
    </div>
  )
}
