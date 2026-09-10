import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pro Export unlocked — EzCoverLetter',
  description: 'Confirm your EzCoverLetter Pro Export purchase and return to download PDF or Word.',
  robots: { index: false, follow: false },
}

export default function SuccessLayout({ children }: { children: React.ReactNode }) {
  return children
}
