import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CONTACT_EMAIL } from '@/lib/constants'
import { formatUsd, PLANS, PRO_EXPORT } from '@/lib/plans'

export const metadata = {
  title: 'Privacy Policy — EzCoverLetter',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: November 13, 2026</p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            This policy describes what EzCoverLetter processes to provide Job Match Score, cover letters,
            resume rewrites, ATS reviews, interview practice, LinkedIn drafts, and career emails.
            EzCoverLetter does not use that content for its own marketing or to train its own models.
            This policy does not describe how long each provider keeps data, or whether a provider uses it to train models.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Information we collect</h2>
            <p>Depending on how you use the site, we process:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Email address and account information when you sign in.</li>
              <li>Resume or CV text, job description, and other text you submit for generation.</li>
              <li>Cover letters and other drafts the service generates.</li>
              <li>Name, phone, email, and LinkedIn details you provide for a letter&apos;s signature.</li>
              <li>Checkout and subscription status needed to tell whether a purchase or plan is active.</li>
              <li>Page visits and product events such as generate, copy, checkout, and purchase.</li>
            </ul>
            <p>
              We do not collect or store your full payment card details on this site.
              Payments are handled by Creem. {PRO_EXPORT.name} is {formatUsd(PRO_EXPORT.priceUsd)} one-time for one saved cover letter.
              Creator ({formatUsd(PLANS.creator.monthlyPriceUsd)}/month) and Pro ({formatUsd(PLANS.pro.monthlyPriceUsd)}/month) are optional subscriptions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">AI processing — DeepSeek</h2>
            <p>
              EzCoverLetter uses the DeepSeek API to generate text. A resume, job description, and other generation
              input you submit is sent from this site&apos;s server to DeepSeek. That happens for signed-in and signed-out generation.
              If you are not signed in, we do not write the resume, job description, or generated draft into our saved-history database.
              The request still passes through our server on its way to DeepSeek. Clearing site data in your browser removes the local draft.
              It does not reach a copy that was already sent for generation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Third-party services</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Supabase stores account authentication and, when you are signed in, saved generations and related account records.</li>
              <li>Vercel hosts the site and provides related runtime services, including Vercel Analytics.</li>
              <li>Google Analytics 4 receives page visits and product events.</li>
              <li>Creem processes checkout, subscription, and refund status. Review Creem&apos;s privacy practices for checkout data.</li>
              <li>DeepSeek receives the generation input described above and returns generated text.</li>
            </ul>
            <p>These providers process data for the purposes above. This policy does not claim that they store nothing.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Data storage</h2>
            <p>
              If you are not signed in, a draft can stay in this browser&apos;s local storage, including the resume,
              job description, generated letter, and contact fields you entered, so you can return to the page.
              If you are signed in, the resume, job description, and generated result can be saved to your account in Supabase
              until you delete that saved result.
            </p>
            <p>
              After a one-time purchase, the saved letter and the signature contact details can also be stored with that purchase.
              Deleting a saved result in Account removes that history entry. It does not remove the purchased copy used for PDF and Word.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Analytics</h2>
            <p>
              We use Google Analytics 4 and Vercel Analytics. Events can include page views, generation, copy, checkout, and purchase.
              A purchase event can include the checkout id, the {formatUsd(PRO_EXPORT.priceUsd)} amount, and the currency.
              These events are not written to include the resume text, job description, or cover letter body.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Data deletion</h2>
            <p>
              Signed-in users can delete one saved result from the Account page. That is separate from deleting a purchased letter copy.
              There is no self-serve button to delete an entire account.
            </p>
            <p>
              To ask us to delete your account and the personal data we hold for it, email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline-offset-4 hover:underline">
                {CONTACT_EMAIL}
              </a>
              . We handle that request by removing the associated account data we store, including saved generations
              and purchased letter copies. We do not promise a specific number of days to finish the request.
              Browser storage remains on your device until you clear it.
            </p>
          </section>

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
