import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SaveNotice } from '@/components/save-notice'

export function ToolShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
        <SaveNotice />
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}
