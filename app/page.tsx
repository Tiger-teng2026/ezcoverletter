import { FileText, Gauge, ShieldCheck, Sparkles } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Generator } from '@/components/generator'
import { UpgradeButton } from '@/components/upgrade-button'

const VALUES = [
  {
    icon: Gauge,
    title: 'Job Match Score',
    body: 'See how well your resume fits a posting — matched skills, gaps, and what to fix before you apply.',
  },
  {
    icon: FileText,
    title: 'ATS-Friendly Cover Letter',
    body: 'Generate a tailored cover letter from your resume and the job description, in a natural professional voice.',
  },
  {
    icon: Sparkles,
    title: 'Application Optimization',
    body: 'Use the match insights to tighten your application so it is clearer, more specific, and easier to screen.',
  },
] as const

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
              Job match + ATS-friendly cover letters
            </span>

            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              AI Job Application Assistant
              <span className="mt-2 block text-[0.58em] font-medium leading-snug text-muted-foreground sm:mt-3">
                for ATS-Friendly Cover Letters
              </span>
            </h1>

            <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              See your Job Match Score, then generate a cover letter tailored to the posting. Free to
              generate and copy. Pro Export is $4.99 one-time for PDF and Word.
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

        {/* Value + flow */}
        <section className="border-b border-border/60">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-12">
            <p className="text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              How it helps
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {VALUES.map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-border bg-card px-5 py-5"
                >
                  <item.icon className="size-4 text-primary" aria-hidden="true" />
                  <h2 className="mt-3 text-[15px] font-semibold tracking-tight">{item.title}</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
                </article>
              ))}
            </div>
            <p className="mt-8 text-center text-[13px] leading-relaxed text-muted-foreground">
              Paste resume + job description
              <span className="mx-2 text-border">→</span>
              Optional Job Match Score
              <span className="mx-2 text-border">→</span>
              ATS-friendly cover letter
            </p>
          </div>
        </section>

        {/* Generator */}
        <section id="generator" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-10 sm:py-14">
          <Generator />
        </section>
      </main>

      <SiteFooter tagline="Match the job. Write a cover letter that still sounds like you." />
    </div>
  )
}
