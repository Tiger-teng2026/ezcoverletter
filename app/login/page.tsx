import type { Metadata } from 'next'
import { LoginForm } from '@/components/login-form'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SIGN_IN_UNAVAILABLE } from '@/lib/plans'
import { readSupabaseAuth } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Sign in — EzCoverLetter',
  description: 'Sign in with an email link to see your plan, monthly credits, and saved results.',
}

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const configured = Boolean(readSupabaseAuth())
  const notice = !configured
    ? null
    : params.error === 'link'
      ? 'That sign-in link is invalid or expired. Request a new email.'
      : params.error === 'not_configured'
        ? SIGN_IN_UNAVAILABLE
        : null
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          We email you a one-time link. No password is stored on this site.
        </p>
        <div className="mt-8">
          <LoginForm configured={configured} notice={notice} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
