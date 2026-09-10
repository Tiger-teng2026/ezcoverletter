import { CONTACT_EMAIL, SITE_URL } from '@/lib/constants'

const FAQS = [
  {
    q: 'How do I write an ATS-friendly cover letter?',
    a: 'Paste your resume and the real job description, keep the layout linear, and reuse the employer’s keywords only when they are true for you. EzCoverLetter scores the match, then drafts a one-page letter with proof instead of filler.',
  },
  {
    q: 'Is EzCoverLetter free?',
    a: 'Yes. Job Match Score, cover letter generation, and Copy are free. PDF and Word are Pro Export for $4.99 one-time — not a subscription.',
  },
  {
    q: 'What is a Job Match Score?',
    a: 'It compares your resume to one posting and returns a 0–100 fit score, matched skills, gaps, and what to fix before you apply. You can skip it and still generate a letter.',
  },
  {
    q: 'Do you store my resume?',
    a: `Resume and job text stay in your browser until you generate. We do not keep them on our servers for marketing or training. Questions: ${CONTACT_EMAIL}.`,
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
