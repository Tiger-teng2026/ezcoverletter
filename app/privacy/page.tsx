import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CONTACT_EMAIL } from '@/lib/constants'

export const metadata = {
  title: 'Privacy Policy — EzCoverLetter',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: October 29, 2026</p>

        <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            EzCoverLetter processes the resume, job description, interview answers, and profile or
            email details you submit to provide Job Match Score, cover letters, resume rewrites, ATS
            reviews, interview practice, LinkedIn drafts, and career emails. If you are signed in, those
            submissions and the generated drafts are saved to your account until you delete them. We do
            not use that content for marketing or to train models. If you are not signed in, we do not
            store the resume, job description, or generated draft on our servers. A
            draft and Pro Export unlock may stay in this browser so you can return after checkout.
            Clear site data in your browser to remove them.
          </p>
          <p>
            Payments are handled by Creem. Creator and Pro are monthly subscriptions. Single Document
            Export is a $4.99 one-time purchase for one saved cover letter. We do not collect or store your full payment card
            details on our site. Please review Creem&apos;s privacy practices for checkout-related
            data.
          </p>
          <p>
            Questions about privacy? Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>

        <Link href="/" className="mt-10 inline-block text-sm text-foreground underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </main>
      <SiteFooter />
    </div>
  )
}
