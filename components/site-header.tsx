import { PenLine } from 'lucide-react'
import { UpgradeButton } from '@/components/upgrade-button'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <a href="/" className="flex items-center gap-2.5" aria-label="EzCoverLetter home">
          <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-card">
            <PenLine className="size-4 text-primary" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            EzCoverLetter
          </span>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="/blog"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Blog
          </a>
          <a
            href="/#generator"
            className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:inline-flex"
          >
            Start free
          </a>
          <UpgradeButton size="sm" />
        </div>
      </div>
    </header>
  )
}
