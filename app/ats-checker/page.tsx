import type { Metadata } from 'next'
import { AtsCheckerTool } from '@/components/ats-checker-tool'
import { ToolShell } from '@/components/tool-shell'
import { ATS_DISCLAIMER } from '@/lib/toolkit'

export const metadata: Metadata = {
  title: 'ATS Resume Checker — EzCoverLetter',
  description:
    'Compare a resume with one job description for keyword coverage, missing terms, structure, and readability. This is an editorial review, not an employer ATS score.',
}

export default function AtsCheckerPage() {
  return (
    <ToolShell
      eyebrow="ATS Resume Checker"
      title="See how a resume reads against one posting."
      description={ATS_DISCLAIMER}
    >
      <AtsCheckerTool />
    </ToolShell>
  )
}
