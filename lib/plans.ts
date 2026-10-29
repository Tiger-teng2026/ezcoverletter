export const CREDIT_ACTIONS = [
  'cover-letter',
  'job-match',
  'resume-optimizer',
  'ats-check',
  'interview-start',
  'interview-feedback',
  'interview-reply',
  'linkedin',
  'career-email',
] as const

export type CreditAction = (typeof CREDIT_ACTIONS)[number]

/** One successful model call. Heavier rewrites cost more. Interview turns are billed one at a time. */
export const CREDIT_COSTS: Record<CreditAction, number> = {
  'cover-letter': 1,
  'job-match': 1,
  'resume-optimizer': 2,
  'ats-check': 1,
  'interview-start': 1,
  'interview-feedback': 1,
  'interview-reply': 1,
  linkedin: 1,
  'career-email': 1,
}

export const PLANS = {
  free: {
    id: 'free' as const,
    name: 'Free',
    monthlyPriceUsd: 0,
    monthlyCredits: 10,
    cardRequired: false,
  },
  creator: {
    id: 'creator' as const,
    name: 'Creator',
    monthlyPriceUsd: 9,
    monthlyCredits: 100,
    productEnv: 'CREEM_CREATOR_PRODUCT_ID',
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    monthlyPriceUsd: 19,
    monthlyCredits: 300,
    productEnv: 'CREEM_PRO_PRODUCT_ID',
  },
}

export type PaidPlanId = 'creator' | 'pro'
export type PlanId = 'free' | PaidPlanId

/** One saved cover letter. Active Creator and Pro subscriptions export separately. */
export const PRO_EXPORT = {
  name: 'Single Document Export',
  priceUsd: 4.99,
  productEnv: 'CREEM_PRODUCT_ID',
}

export function formatUsd(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`
}

export const QUOTA_MESSAGE =
  'AI credits for this period are used up. Upgrade to Creator or Pro for a higher allowance, or wait until the allowance resets.'

export const USAGE_UNAVAILABLE =
  'AI usage tracking is not configured. Monthly credits stay off until the Supabase database is configured.'

export const SIGN_IN_UNAVAILABLE = 'Sign-in is not configured.'

export const SAVE_NOTICE =
  'If you are signed in, the resume, job description, and result are saved to your account so you can open them later. Signed-out use still counts against the free monthly allowance and is not stored. Resume text is not written to server logs.'
