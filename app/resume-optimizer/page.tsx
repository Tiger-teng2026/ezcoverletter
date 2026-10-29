import type { Metadata } from 'next'
import { ResumeOptimizerTool } from '@/components/resume-optimizer-tool'
import { ToolShell } from '@/components/tool-shell'

export const metadata: Metadata = {
  title: 'AI Resume Optimizer — EzCoverLetter',
  description:
    'Paste a resume and a target job description. Get issue notes, before-and-after rewrites, and a full optimized resume you can copy or download.',
}

export default function ResumeOptimizerPage() {
  return (
    <ToolShell
      eyebrow="AI Resume Optimizer"
      title="Rewrite the resume for one role."
      description="The editor flags weak spots, rewrites experience and achievements you already have, and returns a full resume draft. It does not invent employers or metrics."
    >
      <ResumeOptimizerTool />
    </ToolShell>
  )
}
