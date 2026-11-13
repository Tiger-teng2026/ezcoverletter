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
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: November 13, 2026</p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            By using EzCoverLetter, you agree to use the service for lawful personal or professional
            job-application purposes. You are responsible for the accuracy of the content you submit
            and for reviewing any generated cover letter, resume, profile, or email before sending it to employers.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Plans and credits</h2>
            <p>
              The Free plan includes {PLANS.free.monthlyCredits} AI credits each UTC month. Copy is included.
              PDF and Word export of a saved cover letter is not included on the Free plan.
              Creator is {formatUsd(PLANS.creator.monthlyPriceUsd)} per month for {PLANS.creator.monthlyCredits} credits
              each billing period. Pro is {formatUsd(PLANS.pro.monthlyPriceUsd)} per month for {PLANS.pro.monthlyCredits} credits
              each billing period. Fees are charged as displayed at checkout.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Subscription and automatic renewal</h2>
            <p>
              Creator ({formatUsd(PLANS.creator.monthlyPriceUsd)}/month) and Pro ({formatUsd(PLANS.pro.monthlyPriceUsd)}/month)
              renew automatically each month until you cancel. After you cancel, paid credits and subscription export
              remain available until the end of the current paid period. When that period ends, the account returns to the Free plan.
              If a renewal payment fails, paid credits and subscription export are turned off. The Free allowance still applies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Subscription cancellation</h2>
            <p>
              Signed-in subscribers can cancel from the Account page with Cancel at period end.
              Cancellation stops the next renewal. It is not an immediate refund, and it does not remove a separate{' '}
              {formatUsd(PRO_EXPORT.priceUsd)} {PRO_EXPORT.name} already purchased for a saved letter.
              If a paid period is already open, this site does not start a second subscription checkout or change the plan in place.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Single Document Export</h2>
            <p>
              {PRO_EXPORT.name} is {formatUsd(PRO_EXPORT.priceUsd)} paid once for one saved cover letter.
              That purchase unlocks both PDF and Word for that letter. It does not require a Creator or Pro subscription,
              and it does not renew.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Refunds</h2>
            <p>
              Refunds are processed by Creem. This site does not offer a self-serve refund button, a promised refund window,
              or an automatic refund. This site removes the related access only after Creem confirms that the refund succeeded.
              A refund of a {formatUsd(PRO_EXPORT.priceUsd)} purchase stops PDF and Word downloads for that letter.
              A refund of a Creator or Pro subscription ends that subscription&apos;s paid credits and subscription export.
              One refund does not change a different purchase or a different saved letter.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">AI content</h2>
            <p>
              Generated text can be wrong, incomplete, or inaccurate. You should review your resume, cover letter,
              and other application materials before you send them. Generated text is provided as-is.
              We do not guarantee interviews, job offers, or other employment outcomes.
            </p>
          </section>

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
