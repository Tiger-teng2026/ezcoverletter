import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
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
        <p className="mt-2 text-sm text-muted-foreground">Last updated: August 8, 2026</p>

        <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            EzCoverLetter processes the resume and job description text you submit solely to
            generate a cover letter. We do not permanently store your resume, job description, or
            generated letter on our servers for marketing or training purposes.
          </p>
          <p>
            Payments are handled by Creem. We do not collect or store your full payment card details
            on our site. Please review Creem&apos;s privacy practices for checkout-related data.
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
    </div>
  )
}
