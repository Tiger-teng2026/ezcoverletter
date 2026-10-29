import type { Metadata } from 'next'
import { AccountPanel } from '@/components/account-panel'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
  title: 'Account — EzCoverLetter',
  robots: { index: false, follow: false },
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string; welcome?: string }> }) {
  const params = await searchParams
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Your plan, credits, and saved results. Subscription status changes only after Creem confirms them.
        </p>
        <div className="mt-8">
          <AccountPanel billingReturn={params.billing === 'return'} welcome={params.welcome === '1'} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
