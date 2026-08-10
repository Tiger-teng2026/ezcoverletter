import Link from 'next/link'

/** Soft CTA pointing users from blog content to the home generator. */
export function BlogCta() {
  return (
    <aside
      aria-label="Try EzCoverLetter"
      className="rounded-2xl border border-border/80 bg-card px-5 py-5 sm:px-6"
    >
      <p className="text-[15px] font-medium leading-relaxed text-foreground">
        Tired of writing cover letters? Try EZ Cover Letter to pass ATS instantly.
      </p>
      <Link
        href="/#generator"
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Generate a cover letter →
      </Link>
    </aside>
  )
}
