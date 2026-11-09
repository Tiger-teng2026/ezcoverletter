import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Letter export — EzCoverLetter',
  description: 'Confirm the one-time cover letter export purchase and return to download PDF or Word. No subscription is required.',
  robots: { index: false, follow: false },
}

export default function SuccessLayout({ children }: { children: React.ReactNode }) {
  return children
}
