import type { Metadata } from 'next'
import { InterviewCoachTool } from '@/components/interview-coach-tool'
import { ToolShell } from '@/components/tool-shell'

export const metadata: Metadata = {
  title: 'AI Interview Coach — EzCoverLetter',
  description:
    'Generate behavioral and role interview questions from a job description, then get written feedback and continue a text mock interview.',
}

export default function InterviewCoachPage() {
  return (
    <ToolShell
      eyebrow="AI Interview Coach"
      title="Practice the interview in writing."
      description="Start from a job description, review sample structures, submit your own answer, and continue the conversation one question at a time. Voice and video are not part of this version."
    >
      <InterviewCoachTool />
    </ToolShell>
  )
}
