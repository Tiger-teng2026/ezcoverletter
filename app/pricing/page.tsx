import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SubscribeButton } from '@/components/subscribe-button'
import { UpgradeButton } from '@/components/upgrade-button'
import { formatUsd, PLANS, PRO_EXPORT } from '@/lib/plans'
import { TOOLS } from '@/lib/toolkit'

export const metadata: Metadata = {
  title: 'Pricing — EzCoverLetter',
  description: `Free includes ${PLANS.free.monthlyCredits} AI credits a UTC month. Creator is ${formatUsd(PLANS.creator.monthlyPriceUsd)}/month and Pro is ${formatUsd(PLANS.pro.monthlyPriceUsd)}/month. Active subscriptions include PDF and Word export. One saved letter can also be exported for ${formatUsd(PRO_EXPORT.priceUsd)}.`,
}

const CARDS = [PLANS.free, PLANS.creator, PLANS.pro] as const

export default function PricingPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-14">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Pricing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plans for AI credits, plus export for one letter.</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Free credits reset at 00:00 UTC on the first day of each month. Creator and Pro credits follow the paid Creem period.
          An active subscription includes PDF and Word export. A one-time purchase stays attached to one saved letter.
          If a paid period is already open, a second subscription checkout is not started. Plan changes are not sent to Creem from this page.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {CARDS.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-border bg-card px-5 py-5">
              <h2 className="text-[15px] font-semibold">{plan.name}</h2>
              <p className="mt-2 text-2xl font-semibold">{plan.monthlyPriceUsd === 0 ? 'Free' : `${formatUsd(plan.monthlyPriceUsd)}/month`}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {plan.monthlyCredits} AI credits {plan.id === 'free' ? 'per UTC month' : 'per billing period'}.
                {plan.id === 'free' ? '' : ' PDF and Word export while the subscription is active.'}
              </p>
              {plan.id === 'free' ? <p className="mt-4 text-[13px]">No card required.</p> : <SubscribeButton plan={plan.id} label={`Subscribe to ${plan.name}`} />}
            </article>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card px-5 py-5">
          <h2 className="text-[15px] font-semibold">{PRO_EXPORT.name} — {formatUsd(PRO_EXPORT.priceUsd)} one-time</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Unlocks PDF and Word for one saved cover letter after Creem confirms the payment. It does not start a subscription, and canceling a subscription does not remove it.
          </p>
          <div className="mt-4">
            <UpgradeButton size="lg" />
          </div>
        </div>
        <ul className="mt-8 space-y-2 text-[14px]">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="underline-offset-4 hover:underline">{tool.title}</Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  )
}
