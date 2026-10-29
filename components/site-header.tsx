import { PenLine } from 'lucide-react'
import { UpgradeButton } from '@/components/upgrade-button'
import { TOOLS } from '@/lib/toolkit'

const navClass =
  'rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex h-16 items-center justify-between gap-3">
          <a href="/" className="flex min-w-0 items-center gap-2.5" aria-label="EzCoverLetter home">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
              <PenLine className="size-4 text-primary" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-[15px] font-semibold tracking-tight">EzCoverLetter</span>
              <span className="mt-0.5 hidden text-[10px] font-medium text-muted-foreground sm:block">
                AI Job Search Toolkit
              </span>
            </span>
          </a>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <a href="/pricing" className={navClass}>
              Pricing
            </a>
            <a href="/account" className={`${navClass} hidden sm:inline-flex`}>
              Account
            </a>
            <a href="/blog" className={`${navClass} hidden sm:inline-flex`}>
              Blog
            </a>
            <UpgradeButton size="sm" />
          </div>
        </div>

        <nav aria-label="Tools" className="hidden flex-wrap gap-1 pb-3 md:flex">
          {TOOLS.map((tool) => (
            <a key={tool.href} href={tool.href} className={navClass}>
              {tool.title}
            </a>
          ))}
        </nav>

        <details className="pb-3 md:hidden">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-muted-foreground">
            Tools and pages
          </summary>
          <div className="mt-2 flex flex-col">
            {TOOLS.map((tool) => (
              <a key={tool.href} href={tool.href} className={navClass}>
                {tool.title}
              </a>
            ))}
            <a href="/blog" className={navClass}>
              Blog
            </a>
            <a href="/account" className={navClass}>
              Account
            </a>
          </div>
        </details>
      </div>
    </header>
  )
}
