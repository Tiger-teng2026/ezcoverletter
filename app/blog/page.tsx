import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { BlogCta } from '@/components/blog-cta'
import { formatPostDate, getAllPosts } from '@/lib/blog'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Blog — EzCoverLetter',
  description:
    'Practical guides on ATS-friendly cover letters, common mistakes, and job-application tips from EzCoverLetter.',
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Blog — EzCoverLetter',
    description:
      'Practical guides on ATS-friendly cover letters, common mistakes, and job-application tips.',
    type: 'website',
    url: `${SITE_URL}/blog`,
    siteName: 'EzCoverLetter',
  },
}

/** Build-time static generation for crawler-friendly HTML. */
export const dynamic = 'force-static'

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-16">
        <header className="mb-10">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Blog
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Cover letter tips that actually help
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Short reads on ATS, structure, and mistakes to avoid—so your letter gets read.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">No posts yet. Check back soon.</p>
        ) : (
          <ul className="space-y-4">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="block rounded-2xl border border-border/70 bg-card px-5 py-5 transition-colors hover:border-border hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {post.date && (
                    <time
                      dateTime={post.date}
                      className="text-[12px] text-muted-foreground"
                    >
                      {formatPostDate(post.date)}
                    </time>
                  )}
                  <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      {post.description}
                    </p>
                  )}
                  <span className="mt-3 inline-block text-[13px] font-medium text-primary">
                    Read article →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <BlogCta />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-[11px] text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} EzCoverLetter</p>
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-foreground">
              {CONTACT_EMAIL}
            </a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
