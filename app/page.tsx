import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Generator } from '@/components/generator'
import { HomeFaq } from '@/components/home-faq'
import { SaveNotice } from '@/components/save-notice'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { formatUsd, PLANS, PRO_EXPORT } from '@/lib/plans'
import { TOOLS } from '@/lib/toolkit'

export default function Page() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(ellipse_at_center,var(--color-primary)_0%,transparent_65%)] opacity-20 blur-2xl"
          />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-5 py-16 text-center sm:py-24">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3 text-accent" aria-hidden="true" />
              AI Job Search Toolkit
            </span>

            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              EzCoverLetter
              <span className="mt-2 block text-[0.42em] font-medium leading-snug text-muted-foreground sm:mt-3">
                Everything You Need to Prepare, Apply, and Interview with Confidence.
              </span>
            </h1>

            <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Six tools for English-speaking job searches. Free includes {PLANS.free.monthlyCredits} AI credits each UTC
              month. Creator is {formatUsd(PLANS.creator.monthlyPriceUsd)}/month for {PLANS.creator.monthlyCredits} credits
              per billing period. Pro is {formatUsd(PLANS.pro.monthlyPriceUsd)}/month for {PLANS.pro.monthlyCredits} credits
              per billing period. Active subscriptions include PDF and Word export. {PRO_EXPORT.name} is {formatUsd(PRO_EXPORT.priceUsd)} for one saved letter.
            </p>

            <div className="mt-1 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <a
                href="#tools"
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground"
              >
                Browse the tools
              </a>
              <Link
                href="/pricing"
                className="text-[13px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

        <section id="tools" className="scroll-mt-28 border-b border-border/60">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-12">
            <p className="text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Six tools
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="rounded-2xl border border-border bg-card px-5 py-5 transition-colors hover:border-primary/50"
                >
                  <h2 className="text-[15px] font-semibold tracking-tight">{tool.title}</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{tool.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="generator" className="mx-auto w-full max-w-6xl scroll-mt-28 px-5 py-10 sm:py-14">
          <SaveNotice />
          <div className="mt-6">
            <Generator />
          </div>
        </section>

        <HomeFaq />
      </main>

      <SiteFooter tagline="Prepare, apply, and interview with a letter that still sounds like you." />
    </div>
  )
}
