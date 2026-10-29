'use client'

import { useState } from 'react'
import { StatusNote, SubmitRow, TextField, useToolkitRequest } from '@/components/toolkit-ui'
import { ATS_DISCLAIMER } from '@/lib/toolkit'
import type { AtsReport } from '@/lib/toolkit-parse'

export function AtsCheckerTool() {
  const [resume, setResume] = useState('')
  const [job, setJob] = useState('')
  const { loading, error, result, submit } = useToolkitRequest<AtsReport>()

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit('/api/ats-check', { resume, job })
        }}
      >
        <TextField id="ats-resume" label="Resume" value={resume} onChange={setResume} placeholder="Paste the resume you want reviewed" rows={10} />
        <TextField id="ats-job" label="Job description" value={job} onChange={setJob} placeholder="Paste one target job description" rows={8} />
        <SubmitRow loading={loading} label="Review resume" />
        <StatusNote error={error} />
      </form>

      {result ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" aria-live="polite">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{result.disclaimer || ATS_DISCLAIMER}</p>
          <h2 className="text-sm font-semibold">Match report</h2>
          <p className="text-[14px] leading-relaxed">{result.overview}</p>
          <ul className="flex flex-wrap gap-2">
            {result.keywordCoverage.map((item) => (
              <li key={item.keyword} className="rounded-full border border-border px-3 py-1 text-[12px]">
                {item.keyword} · {item.status}
              </li>
            ))}
          </ul>
          <ReportList title="Missing keywords" items={result.missingKeywords} />
          <ReportList title="Structure" items={result.structureIssues} />
          <ReportList title="Readability" items={result.readabilityIssues} />
          <ReportList title="Suggestions" items={result.suggestions} />
        </section>
      ) : null}
    </div>
  )
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
