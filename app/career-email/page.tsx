import type { Metadata } from 'next'
import { CareerEmailTool } from '@/components/career-email-tool'
import { ToolShell } from '@/components/tool-shell'

export const metadata: Metadata = {
  title: 'Career Email Toolkit — EzCoverLetter',
  description:
    'Draft recommendation letters, salary notes, interview thank-you emails, follow-ups, offer replies, and offer declines.',
}

export default function CareerEmailPage() {
  return (
    <ToolShell
      eyebrow="Career Email Toolkit"
      title="Draft the email, then send it yourself."
      description="Each email type has its own fields. The draft uses only what you type. Copy the subject and body after you review it."
    >
      <CareerEmailTool />
    </ToolShell>
  )
}
