import type { Metadata } from 'next'
import { LinkedInWriterTool } from '@/components/linkedin-writer-tool'
import { ToolShell } from '@/components/tool-shell'

export const metadata: Metadata = {
  title: 'LinkedIn Profile Writer — EzCoverLetter',
  description:
    'Draft LinkedIn headlines, an About section, experience bullets, and skill suggestions tailored to a target role.',
}

export default function LinkedInWriterPage() {
  return (
    <ToolShell
      eyebrow="LinkedIn Profile Writer"
      title="Draft the profile around the role you want."
      description="Paste your resume or current profile, name the target role, and copy the headline, About, experience, and skill suggestions that come back."
    >
      <LinkedInWriterTool />
    </ToolShell>
  )
}
