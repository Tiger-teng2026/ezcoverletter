import { ShieldCheck } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Generator } from '@/components/generator'
import { UpgradeButton } from '@/components/upgrade-button'

export default function Page() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(ellipse_at_center,var(--color-primary)_0%,transparent_65%)] opacity-20 blur-2xl"
          />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-5 py-16 text-center sm:py-24">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3 text-accent" aria-hidden="true" />
              Reads human. Passes ATS.
            </span>

            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              Tailor Cover Letters in 10 Seconds
            </h1>

            <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              No AI buzzwords. 100% tailored to pass ATS and impress recruiters. Free to generate —
              upgrade for polished PDF & Word exports.
            </p>

            <div className="mt-1 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <UpgradeButton size="lg" />
              <a
                href="#generator"
                className="text-[13px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Or start free below ↓
              </a>
            </div>
          </div>
        </section>

        {/* Generator */}
        <section id="generator" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-10 sm:py-14">
          <Generator />
        </section>
      </main>

      <SiteFooter tagline="Written by you, assisted by AI — never the other way around." />
    </div>
  )
}
