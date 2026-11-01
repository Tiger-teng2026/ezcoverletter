import type { Metadata } from 'next'
import { HistoryDetail } from '@/components/history-detail'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
  title: 'Saved result — EzCoverLetter',
  robots: { index: false, follow: false },
}

export default function HistoryDetailPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <HistoryDetail />
      </main>
      <SiteFooter />
    </div>
  )
}
