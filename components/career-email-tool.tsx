'use client'

import { useState } from 'react'
import { CopyTextButton, StatusNote, SubmitRow, TextField, useToolkitRequest } from '@/components/toolkit-ui'
import type { EmailKind } from '@/lib/toolkit-parse'

const KINDS: { id: EmailKind; label: string }[] = [
  { id: 'recommendation', label: 'Recommendation' },
  { id: 'salary', label: 'Salary note' },
  { id: 'thank-you', label: 'Thank-you' },
  { id: 'follow-up', label: 'Follow-up' },
  { id: 'offer-reply', label: 'Offer reply' },
  { id: 'decline', label: 'Decline offer' },
]

const FIELDS: Record<EmailKind, { key: string; label: string; rows: number; placeholder: string }[]> = {
  recommendation: [
    { key: 'yourName', label: 'Your name', rows: 1, placeholder: 'Alex Chen' },
    { key: 'candidateName', label: 'Candidate name', rows: 1, placeholder: 'Jordan Lee' },
    { key: 'relationship', label: 'How you worked together', rows: 1, placeholder: 'I managed Jordan for two years' },
    { key: 'role', label: 'Role they are pursuing', rows: 1, placeholder: 'Senior analyst' },
    { key: 'highlights', label: 'Strengths you can vouch for', rows: 5, placeholder: 'Describe work you actually observed' },
  ],
  salary: [
    { key: 'yourName', label: 'Your name', rows: 1, placeholder: 'Alex Chen' },
    { key: 'role', label: 'Role', rows: 1, placeholder: 'Product designer' },
    { key: 'company', label: 'Company', rows: 1, placeholder: 'Northwind' },
    { key: 'ask', label: 'What you want to discuss', rows: 4, placeholder: 'The range, timing, or a competing offer you are willing to mention' },
  ],
  'thank-you': [
    { key: 'yourName', label: 'Your name', rows: 1, placeholder: 'Alex Chen' },
    { key: 'role', label: 'Role', rows: 1, placeholder: 'Account executive' },
    { key: 'interviewer', label: 'Interviewer', rows: 1, placeholder: 'Priya Shah' },
    { key: 'notes', label: 'What you discussed', rows: 5, placeholder: 'A project, question, or point you want to follow up on' },
  ],
  'follow-up': [
    { key: 'yourName', label: 'Your name', rows: 1, placeholder: 'Alex Chen' },
    { key: 'role', label: 'Role', rows: 1, placeholder: 'Data analyst' },
    { key: 'company', label: 'Company', rows: 1, placeholder: 'Northwind' },
    { key: 'context', label: 'Where the process stands', rows: 5, placeholder: 'You applied last Tuesday and have not heard back' },
  ],
  'offer-reply': [
    { key: 'yourName', label: 'Your name', rows: 1, placeholder: 'Alex Chen' },
    { key: 'role', label: 'Role', rows: 1, placeholder: 'Operations manager' },
    { key: 'company', label: 'Company', rows: 1, placeholder: 'Northwind' },
    { key: 'intent', label: 'Your intent', rows: 1, placeholder: 'Accept, ask a question, or request time' },
    { key: 'notes', label: 'Details to include', rows: 4, placeholder: 'Start date, a question, or a condition you want to raise' },
  ],
  decline: [
    { key: 'yourName', label: 'Your name', rows: 1, placeholder: 'Alex Chen' },
    { key: 'role', label: 'Role', rows: 1, placeholder: 'Marketing lead' },
    { key: 'company', label: 'Company', rows: 1, placeholder: 'Northwind' },
    { key: 'reason', label: 'Reason you are comfortable sharing', rows: 4, placeholder: 'You accepted another role, or the scope is not the right fit' },
  ],
}

export function CareerEmailTool() {
  const [kind, setKind] = useState<EmailKind>('thank-you')
  const [fields, setFields] = useState<Record<string, string>>({})
  const { loading, error, result, submit } = useToolkitRequest<{ kind: EmailKind; subject: string; body: string }>()

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit('/api/career-email', { kind, fields })
        }}
      >
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-muted-foreground">
          Email type
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as EmailKind)}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-[13px] text-foreground"
          >
            {KINDS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        {FIELDS[kind].map((field) => (
          <TextField
            key={field.key}
            id={`email-${field.key}`}
            label={field.label}
            value={fields[field.key] || ''}
            onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
            placeholder={field.placeholder}
            rows={field.rows}
          />
        ))}
        <SubmitRow loading={loading} label="Draft email" />
        <StatusNote error={error} />
      </form>

      {result ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{result.subject}</h2>
            <CopyTextButton text={`Subject: ${result.subject}\n\n${result.body}`} label="Copy email" />
          </div>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{result.body}</p>
        </section>
      ) : null}
    </div>
  )
}
