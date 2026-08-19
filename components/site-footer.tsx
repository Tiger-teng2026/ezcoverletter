import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/constants'

type Props = {
  /** Optional tagline shown on the homepage footer. */
  tagline?: string
}

export function SiteFooter({ tagline }: Props) {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-5 py-8 text-[11px] text-muted-foreground">
        <div className="flex w-full flex-col items-center justify-between gap-3 sm:flex-row sm:gap-4">
          <p>© {new Date().getFullYear()} EzCoverLetter</p>

          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          >
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="transition-colors hover:text-foreground"
            >
              {CONTACT_EMAIL}
            </a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
          </nav>

          {tagline ? <p className="text-center sm:text-right">{tagline}</p> : null}
        </div>

        <div className="flex w-full justify-center">
          <a
            href="https://www.producthunt.com/products/ezcoverletter?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-ezcoverletter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex opacity-95 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="EZCoverLetter - Generate tailored, ATS-friendly cover letters in 60s with AI | Product Hunt"
              width={250}
              height={54}
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1226028&theme=light&t=1787150542872"
            />
          </a>
        </div>
      </div>
    </footer>
  )
}
