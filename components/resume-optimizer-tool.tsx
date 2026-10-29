'use client'

import { useState } from 'react'
import { CopyTextButton, StatusNote, SubmitRow, TextField, downloadTextFile, useToolkitRequest } from '@/components/toolkit-ui'
import type { ResumeOptimization } from '@/lib/toolkit-parse'

export function ResumeOptimizerTool() {
  const [resume, setResume] = useState('')
  const [job, setJob] = useState('')
  const { loading, error, result, submit } = useToolkitRequest<ResumeOptimization>()

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit('/api/resume-optimizer', { resume, job })
        }}
      >
        <TextField id="resume-source" label="Resume" value={resume} onChange={setResume} placeholder="Paste your current resume" rows={10} />
        <TextField id="resume-job" label="Target job description" value={job} onChange={setJob} placeholder="Paste the role you want to tailor for" rows={8} />
        <SubmitRow loading={loading} label="Optimize resume" />
        <StatusNote error={error} />
      </form>

      {result ? (
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Optimized resume</h2>
            <div className="flex flex-wrap gap-2">
              <CopyTextButton text={result.optimizedResume} label="Copy resume" />
              <button
                type="button"
                onClick={() => downloadTextFile('optimized-resume.txt', result.optimizedResume)}
                className="inline-flex items-center rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium"
              >
                Download .txt
              </button>
            </div>
          </div>
          <article className="whitespace-pre-wrap text-[14px] leading-relaxed">{result.optimizedResume}</article>
          <div>
            <h3 className="text-[13px] font-semibold">Issues found</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
          {result.experienceRewrites.map((item) => (
            <div key={item.before} className="grid gap-3 sm:grid-cols-2">
              <p className="rounded-xl bg-secondary px-3 py-3 text-[13px]"><span className="font-medium">Before. </span>{item.before}</p>
              <p className="rounded-xl bg-secondary px-3 py-3 text-[13px]"><span className="font-medium">After. </span>{item.after}<span className="mt-2 block text-muted-foreground">{item.why}</span></p>
            </div>
          ))}
          {result.achievementEdits.map((item) => (
            <div key={item.before} className="grid gap-3 sm:grid-cols-2">
              <p className="rounded-xl bg-secondary px-3 py-3 text-[13px]"><span className="font-medium">Achievement before. </span>{item.before}</p>
              <p className="rounded-xl bg-secondary px-3 py-3 text-[13px]"><span className="font-medium">Achievement after. </span>{item.after}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
