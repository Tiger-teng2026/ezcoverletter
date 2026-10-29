import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CONTACT_EMAIL } from '@/lib/constants'
import { formatUsd, PLANS, PRO_EXPORT } from '@/lib/plans'

export const metadata = {
  title: 'Terms of Service — EzCoverLetter',
}

export default function TermsPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: October 29, 2026</p>

        <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            By using EzCoverLetter, you agree to use the service for lawful personal or professional
            job-application purposes. You are responsible for the accuracy of the content you submit
            and for reviewing any generated cover letter, resume, profile, or email before sending it to employers.
          </p>
          <p>
            The Free plan includes {PLANS.free.monthlyCredits} AI credits each UTC month. Creator is {formatUsd(PLANS.creator.monthlyPriceUsd)} per month
            for {PLANS.creator.monthlyCredits} credits each billing period. Pro is {formatUsd(PLANS.pro.monthlyPriceUsd)} per month for {PLANS.pro.monthlyCredits} credits each billing period.
            Active Creator and Pro subscriptions include cover letter PDF and Word until the paid period ends. {PRO_EXPORT.name} is {formatUsd(PRO_EXPORT.priceUsd)} one-time for one saved letter.
            Fees are charged as displayed at checkout. Generated text is provided as-is without guarantee of employment outcomes.
          </p>
          <p>
            Questions about these terms? Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>

        <Link href="/" className="mt-10 inline-block text-sm text-foreground underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </main>
      <SiteFooter />
    </div>
  )
}
