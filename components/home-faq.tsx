import { CONTACT_EMAIL, SITE_URL } from '@/lib/constants'
import { formatUsd, PLANS, PRO_EXPORT } from '@/lib/plans'

const FAQS = [
  {
    q: 'How do I write an ATS-friendly cover letter?',
    a: 'Paste your resume and the real job description, keep the layout linear, and reuse the employer’s keywords only when they are true for you. EzCoverLetter scores the match, then drafts a one-page letter with proof instead of filler.',
  },
  {
    q: 'Is EzCoverLetter free?',
    a: `The Free plan includes ${PLANS.free.monthlyCredits} AI credits each UTC month, with no card. Creator is ${formatUsd(PLANS.creator.monthlyPriceUsd)}/month for ${PLANS.creator.monthlyCredits} credits each billing period. Pro is ${formatUsd(PLANS.pro.monthlyPriceUsd)}/month for ${PLANS.pro.monthlyCredits} credits each billing period. Active Creator and Pro subscriptions include cover letter PDF and Word. ${PRO_EXPORT.name} is ${formatUsd(PRO_EXPORT.priceUsd)} one-time for one saved letter and remains available after a subscription ends.`,
  },
  {
    q: 'What is a Job Match Score?',
    a: 'It compares your resume to one posting and returns a 0–100 fit score, matched skills, gaps, and what to fix before you apply. You can skip it and still generate a letter.',
  },
  {
    q: 'Do you store my resume?',
    a: `Signed-out text is not stored. If you are signed in, the resume, job description, and result are saved to your account until you delete them. They are not written to server logs or used for training. Questions: ${CONTACT_EMAIL}.`,
  },
] as const

export function HomeFaq() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
    url: SITE_URL,
  }

  return (
    <section className="border-t border-border/60">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-14">
        <p className="text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          FAQ
        </p>
        <h2 className="mt-2 text-center text-2xl font-semibold tracking-tight">
          ATS cover letters, without the guesswork
        </h2>
        <dl className="mt-8 space-y-4">
          {FAQS.map((item) => (
            <div key={item.q} className="rounded-2xl border border-border bg-card px-5 py-5">
              <dt className="text-[15px] font-semibold tracking-tight">{item.q}</dt>
              <dd className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
