# EzCoverLetter — AI Job Application Assistant for ATS-Friendly Cover Letters

**Official site:** [https://ezcoverletter.xyz](https://ezcoverletter.xyz)

EzCoverLetter helps job seekers improve applications with a **Job Match Score** and **human-sounding, ATS-ready cover letters**. Paste your resume and a job description, see how you fit the role, then generate a tailored draft that mirrors role keywords, leads with measurable impact, and exports cleanly.

---

## Why traditional cover letters get rejected by ATS

Most applications never reach a recruiter. They first pass through an **Applicant Tracking System (ATS)**—software that parses, indexes, and ranks documents before a human opens them.

Common reasons strong candidates still fail that first gate:

### 1. Keyword mismatch
Job postings repeat specific tools, titles, and domain language (“TypeScript,” “activation,” “B2B SaaS,” “Kubernetes”). Generic letters that paraphrase everything into softer synonyms often **miss the exact phrases** ATS filters look for.

### 2. Unparseable formatting
Tables, text boxes, multi-column layouts, icons, and heavy design can break extraction. The ATS may store an empty or garbled version of your letter even when the PDF “looks fine” to you.

### 3. Vague, adjective-heavy copy
Phrases like “passionate team player” and “results-driven professional” add little signal. Screeners (and humans) prefer **proof**: metrics, scope, ownership, and outcomes tied to the role.

### 4. One recycled letter for every job
If swapping the company name changes nothing else, the letter is not tailored. ATS relevance scoring and recruiter skim tests both punish templates that ignore the posting.

### 5. Broken structure and sign-off
Duplicate closings, leftover placeholders (`[Phone]`, `[LinkedIn]`), or chat-export mess from general AI tools create an unfinished look—and sometimes confuse parsers.

---

## How to optimize a cover letter so it passes screening

Use this practical checklist before you hit Apply:

1. **Lead with the exact role + one clear fit reason**  
   Name the job title early. State why you match in one concrete sentence—not a biography.

2. **Mirror high-signal keywords from the posting**  
   Reuse the employer’s wording for tools, domains, and outcomes *when they are true for you*. Prefer exact terms over invented synonyms.

3. **Quantify impact**  
   Replace soft claims with numbers: latency cut, conversion lift, revenue influenced, time saved, scale owned.

4. **Keep layout simple**  
   Short paragraphs, linear text, one clean signature block. Avoid tables, columns, and decorative elements in the export file.

5. **Close with a specific ask**  
   Offer a short call or next step, then stop. One sign-off is enough.

6. **Generate from resume + JD, then edit your voice**  
   The fastest reliable workflow is pairing your resume with the real job description, then tightening one or two proof points yourself.

**Try it now:** [https://ezcoverletter.xyz](https://ezcoverletter.xyz)

---

## What EzCoverLetter does

- **Scores** how well your resume matches a specific job description (Job Match Score)  
- **Tailors** an ATS-friendly cover letter to that posting  
- **Avoids** generic AI buzzword sludge where possible  
- **Free:** 10 AI credits each UTC month, including generation, match, and Copy
- **Creator / Pro:** $9 or $19 per month, with export while the paid period is active
- **Single Document Export:** $4.99 one-time for PDF and Word of one saved letter
- Ships a small **blog** of ATS and application tips for ongoing SEO and education  

Built as a Next.js app with Markdown-powered blog posts under `content/blog`.

---

## Quick start (developers)

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and fill in server environment variables there. Do not prefix them with `NEXT_PUBLIC_`, do not commit real values, and do not expose them to the browser.

Local sandbox and production must not share a Creem key or product:

- Local sandbox: Creem test API, a test API key, and a test-mode product ID. Do not use the live product ID with the test API.
- Production: leave `CREEM_API_URL` empty so the live Creem API is used. Set `CREEM_API_KEY` to the live key and `CREEM_PRODUCT_ID` to the live product ID kept in `lib/constants.ts`. Do not put test keys in the Vercel production environment.

Names:
- `DEEPSEEK_API_KEY` — server-only DeepSeek API key. Put the real value in `.env.local`.
- `CREEM_API_KEY` — Creem API key for the same mode as `CREEM_API_URL`
- `CREEM_API_URL` — optional. Empty means the live Creem API. Set the Creem test API only for local sandbox.
- `CREEM_PRODUCT_ID` — product for that same mode. Required. Checkout and unlock are refused when it is missing or mixed with the other mode.
- `ENTITLEMENT_SECRET` — signs the HttpOnly Pro Export cookie and the anonymous usage cookie. Generate a long random value. Use a different value in sandbox and production.
- `CREEM_CREATOR_PRODUCT_ID` — Creem product for the $9 Creator subscription. Create it in the same Creem mode as the API key. Do not reuse the one-time export product.
- `CREEM_PRO_PRODUCT_ID` — Creem product for the $19 Pro subscription. Same rule as Creator.
- `CREEM_WEBHOOK_SECRET` — webhook signing secret from Creem Developers → Webhook.
- `SUPABASE_URL` — Project URL from Supabase → Project Settings → API. Put it in `.env.local`.
- `SUPABASE_ANON_KEY` — anon public key from that same API page. Server-only in this app. Put it in `.env.local`.
- `SUPABASE_SERVICE_ROLE_KEY` — service_role secret from that same API page. Server-only. Put it in `.env.local`.


Run `supabase/migrations/20261029_accounts_billing.sql` in the Supabase SQL editor before sign-in or credits can work. Point the Creem webhook at `https://www.ezcoverletter.xyz/api/billing/webhook`.

Useful routes:

| Route | Purpose |
| --- | --- |
| `/` | Generator |
| `/blog` | Article index |
| `/sitemap.xml` | Sitemap |
| `/robots.txt` | Crawler rules |

---

## ATS cover letter tips (short guide)

| Do | Don’t |
| --- | --- |
| Match repeated JD keywords in full sentences | Keyword-stuff a comma list |
| Show 1–3 quantified wins | Rely on empty adjectives |
| Use plain, linear formatting | Use tables / multi-column PDFs |
| Customize the middle paragraph per role | Reuse one letter for every company |
| Verify contact details before Pro Export | Leave `[placeholders]` in PDF/Word files |

For deeper reading, see the in-product blog at [ezcoverletter.xyz/blog](https://ezcoverletter.xyz/blog).

---

## Links

- **Product:** [https://ezcoverletter.xyz](https://ezcoverletter.xyz)  
- **Start free generator:** [https://ezcoverletter.xyz/#generator](https://ezcoverletter.xyz/#generator)  
- **Blog:** [https://ezcoverletter.xyz/blog](https://ezcoverletter.xyz/blog)

---

Tired of rewriting cover letters that never clear ATS? Check your Job Match Score and generate an ATS-optimized draft at **[https://ezcoverletter.xyz](https://ezcoverletter.xyz)**.
