import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { BlogCta } from '@/components/blog-cta'
import { formatPostDate, getAllPostSlugs, getPostBySlug } from '@/lib/blog'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/constants'

type PageProps = {
  params: Promise<{ slug: string }>
}

/** Build-time static generation for crawler-friendly HTML. */
export const dynamic = 'force-static'

export async function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) {
    return { title: 'Post not found — EzCoverLetter', robots: { index: false } }
  }

  const url = `${SITE_URL}/blog/${post.slug}`

  return {
    title: `${post.title} — EzCoverLetter`,
    description: post.description || undefined,
    alternates: {
      canonical: url,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: post.title,
      description: post.description || undefined,
      type: 'article',
      url,
      siteName: 'EzCoverLetter',
      ...(post.date ? { publishedTime: post.date } : {}),
    },
    twitter: {
      card: 'summary',
      title: post.title,
      description: post.description || undefined,
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-12">
          <article>
            <Link
              href="/blog"
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              ← All posts
            </Link>

            <header className="mt-5 border-b border-border/60 pb-8">
              {post.date && (
                <time dateTime={post.date} className="text-[12px] text-muted-foreground">
                  {formatPostDate(post.date)}
                </time>
              )}
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {post.title}
              </h1>
              {post.description && (
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                  {post.description}
                </p>
              )}
            </header>

            <div
              className="blog-prose mt-8"
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />

            <div className="mt-12 lg:hidden">
              <BlogCta />
            </div>
          </article>

          <aside className="hidden lg:sticky lg:top-24 lg:block">
            <BlogCta />
          </aside>
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
