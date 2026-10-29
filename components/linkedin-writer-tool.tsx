'use client'

import { useState } from 'react'
import { CopyTextButton, StatusNote, SubmitRow, TextField, useToolkitRequest } from '@/components/toolkit-ui'
import type { LinkedInDraft } from '@/lib/toolkit-parse'

export function LinkedInWriterTool() {
  const [resume, setResume] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [job, setJob] = useState('')
  const { loading, error, result, submit } = useToolkitRequest<LinkedInDraft>()

  const combined = result
    ? [
        result.headlines.map((headline) => `Headline: ${headline}`).join('\n'),
        result.about,
        result.positioning,
        result.skills.join(', '),
        ...result.experienceSuggestions.map((item) => `${item.role}\n${item.bullets.map((bullet) => `- ${bullet}`).join('\n')}`),
      ].join('\n\n')
    : ''

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit('/api/linkedin', { resume, targetRole, job })
        }}
      >
        <TextField id="li-role" label="Target role" value={targetRole} onChange={setTargetRole} placeholder="Product manager" rows={1} />
        <TextField id="li-profile" label="Resume or current profile" value={resume} onChange={setResume} placeholder="Paste your resume or current LinkedIn text" rows={10} />
        <TextField id="li-job" label="Job description (optional)" value={job} onChange={setJob} placeholder="Paste a posting if you want the profile tailored to it" rows={6} />
        <SubmitRow loading={loading} label="Write profile" />
        <StatusNote error={error} />
      </form>

      {result ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Profile draft</h2>
            <CopyTextButton text={combined} label="Copy all" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">Headlines</h3>
            <ul className="mt-2 space-y-2">
              {result.headlines.map((headline) => (
                <li key={headline} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-[13px]">
                  <span>{headline}</span>
                  <CopyTextButton text={headline} />
                </li>
              ))}
            </ul>
          </div>
          <CopyBlock title="About" text={result.about} />
          <CopyBlock title="Positioning" text={result.positioning} />
          <div>
            <h3 className="text-[13px] font-semibold">Skills</h3>
            <p className="mt-2 text-[13px] text-muted-foreground">{result.skills.join(', ')}</p>
          </div>
          {result.experienceSuggestions.map((item) => (
            <div key={item.role}>
              <h3 className="text-[13px] font-semibold">{item.role}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                {item.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <CopyTextButton text={text} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed">{text}</p>
    </div>
  )
}
