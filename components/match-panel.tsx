import { Check, CircleAlert, ListChecks, Loader2, Target } from 'lucide-react'
import type { JobMatchResult } from '@/lib/match-schema'

type Props = {
  result: JobMatchResult | null
  isLoading: boolean
  isStale: boolean
}

function scoreTone(score: number) {
  if (score >= 80) return 'text-accent'
  if (score >= 60) return 'text-primary'
  return 'text-destructive'
}

function SkillList({
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
  const chipClass =
    variant === 'matched'
      ? 'border-accent/30 bg-accent/10 text-accent'
      : 'border-destructive/25 bg-destructive/10 text-destructive'

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] font-semibold">{label}</p>
      {skills.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li
              key={`${variant}-${skill}`}
              className={'rounded-full border px-2.5 py-1 text-[11px] font-medium ' + chipClass}
            >
              {skill}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MatchPanel({ result, isLoading, isStale }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-8 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Scoring your resume against this job…
      </div>
    )
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-6 text-center">
        <p className="text-[13px] font-medium">Optional — skip anytime</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Get a Job Match Score first, or jump to Generate Cover Letter below with just your resume
          and job description.
        </p>
      </div>
    )
  }

  return (
    <section
      aria-label="Job Match Score"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight">Job Match Score</h2>
        </div>
        <p className={'font-mono text-3xl font-semibold tabular-nums sm:text-4xl ' + scoreTone(result.matchScore)}>
          {result.matchScore}
          <span className="ml-1 text-[15px] font-medium text-muted-foreground">% Match</span>
        </p>
      </div>

      {isStale ? (
        <p
          role="status"
          className="border-b border-border/70 bg-secondary/60 px-5 py-2.5 text-[12px] leading-relaxed text-muted-foreground"
        >
          Resume or job description changed. Analyze again for an updated score.
        </p>
      ) : null}

      <div className="grid gap-6 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-2">
        <SkillList
          label="Matched skills"
          skills={result.matchedSkills}
          empty="No overlapping skills were found."
          variant="matched"
        />
        <SkillList
          label="Missing skills"
          skills={result.missingSkills}
          empty="No major missing requirements stood out."
          variant="missing"
        />
      </div>

      <div className="border-t border-border/70 px-5 py-5 sm:px-6">
        <p className="flex items-center gap-2 text-[12px] font-semibold">
          <Check className="size-3.5 text-accent" aria-hidden="true" />
          Experience match
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{result.experienceMatch}</p>
      </div>

      <div className="border-t border-border/70 px-5 py-5 sm:px-6">
        <p className="flex items-center gap-2 text-[12px] font-semibold">
          <ListChecks className="size-3.5 text-primary" aria-hidden="true" />
          Before you apply
        </p>
        <ul className="mt-3 space-y-2">
          {result.suggestions.map((item, index) => (
            <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-[10px] text-foreground">
                {index + 1}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function MatchError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-[12px] leading-relaxed text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}
