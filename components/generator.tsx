'use client'

import { useRef, useState } from 'react'
import { AlertCircle, Briefcase, Check, Loader2, Sparkles, User } from 'lucide-react'
import { ResultPanel } from '@/components/result-panel'

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
  const resultRef = useRef<HTMLDivElement>(null)

  const canGenerate =
    resume.trim().length >= MIN_CHARS && job.trim().length >= MIN_CHARS && !isLoading

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
        body: JSON.stringify({ resume, job, tone, highlightKeywords: highlight }),
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
    } catch (err) {
      console.log('[v0] Generation error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Step 1 · Paste your materials
        </p>
        <p className="text-[13px] text-muted-foreground">
          Resume and job description stay on your device until you hit generate.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          id="resume"
          label="Paste Resume / CV"
          hint="Put your name on the first line, plus email, phone, and LinkedIn — we autofill Pro export sign-off from these. Include hard metrics (%, $, days)."
          icon={<User className="size-3.5 text-primary" aria-hidden="true" />}
          value={resume}
          onChange={setResume}
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
          onChange={setJob}
          placeholder={
            'Product Designer, Growth — Northwind\nSan Francisco, CA (Hybrid)\n\nAbout the role:\nNorthwind is rebuilding onboarding around our new Activation Hub launch. You will own end-to-end design for signup, first-value, and retention experiments with PM and engineering.\n\nWhat you will do:\n• Lead UX for Activation Hub and related growth surfaces\n• Partner with PMs and engineers on rapid A/B tests\n• Strengthen our shared design system for growth use cases\n\nRequirements:\n• 5+ years product design, ideally B2C SaaS\n• Proven impact on conversion, activation, or retention metrics\n• Experience with design systems and cross-functional shipping'
          }
        />
      </div>

      {/* Options */}
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Step 2 · Tune the letter
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
          Step 3 · Generate
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
            Free to generate · Powered by DeepSeek AI · ATS-optimized
          </p>
        )}
      </div>

      <div ref={resultRef} className="scroll-mt-24">
        <div className="mb-3 flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Step 4 · Review & export
          </p>
          <p className="text-[13px] text-muted-foreground">
            Copy is free. PDF and Word are Pro — with your real sign-off details filled in.
          </p>
        </div>
        <ResultPanel letter={letter} isLoading={isLoading} resume={resume} />
      </div>
    </div>
  )
}
