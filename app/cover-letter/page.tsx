import type { Metadata } from 'next'
import { Generator } from '@/components/generator'
import { ToolShell } from '@/components/tool-shell'

export const metadata: Metadata = {
  title: 'Cover Letter Generator — EzCoverLetter',
  description:
    'Paste a resume and job description, see a Job Match Score, and generate a professional, concise, or natural cover letter. Copy is free. PDF and Word are Pro Export.',
}

export default function CoverLetterPage() {
  return (
    <ToolShell
      eyebrow="Cover Letter Generator"
      title="Match the job, then write the letter."
      description="Keep the existing flow: Job Match Score, three tones, keyword highlight, free copy, and server-checked PDF or Word export."
    >
      <div id="generator" className="scroll-mt-28">
        <Generator />
      </div>
    </ToolShell>
  )
}
