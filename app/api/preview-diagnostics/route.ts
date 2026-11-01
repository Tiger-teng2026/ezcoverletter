import { CREEM_LIVE_PRODUCT_ID } from '@/lib/constants'

const TEST_SUPABASE_PROJECT_REF = 'syqbelgualmvlfsftimx'
const TEST_CREEM_API_URL = 'https://test-api.creem.io'

function present(name: string) {
  return Boolean(process.env[name]?.trim())
}

function normalizedUrl(name: string) {
  return (process.env[name]?.trim() || '').replace(/\\/+$/, '')
}

export async function GET() {
  // This endpoint intentionally exists only on Vercel Preview deployments.
  if (process.env.VERCEL_ENV !== 'preview') {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  const supabaseUrl = normalizedUrl('SUPABASE_URL')
  let supabaseProjectMatches = false
  try {
    supabaseProjectMatches = new URL(supabaseUrl).hostname === `${TEST_SUPABASE_PROJECT_REF}.supabase.co`
  } catch {
    // Report false without returning the configured URL.
  }

  const exportProduct = process.env.CREEM_PRODUCT_ID?.trim() || ''
  const creatorProduct = process.env.CREEM_CREATOR_PRODUCT_ID?.trim() || ''
  const proProduct = process.env.CREEM_PRO_PRODUCT_ID?.trim() || ''
  const products = [exportProduct, creatorProduct, proProduct]

  const checks = {
    previewOnly: true,
    billingTestBranch: process.env.VERCEL_GIT_COMMIT_REF === 'billing-test',
    previewDeploymentHostPresent: present('VERCEL_URL'),
    previewBranchAliasPresent: present('VERCEL_BRANCH_URL'),
    supabaseUrlPresent: present('SUPABASE_URL'),
    supabaseAnonKeyPresent: present('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKeyPresent: present('SUPABASE_SERVICE_ROLE_KEY'),
    supabasePointsToTestProject: supabaseProjectMatches,
    creemApiKeyPresent: present('CREEM_API_KEY'),
    creemUsesTestApi: normalizedUrl('CREEM_API_URL') === TEST_CREEM_API_URL,
    exportProductPresent: Boolean(exportProduct),
    creatorProductPresent: Boolean(creatorProduct),
    proProductPresent: Boolean(proProduct),
    creemProductsAreDistinct: products.every(Boolean) && new Set(products).size === products.length,
    noLiveProductInTestExport: Boolean(exportProduct) && exportProduct !== CREEM_LIVE_PRODUCT_ID,
    creemWebhookSecretPresent: present('CREEM_WEBHOOK_SECRET'),
    entitlementSecretPresent: present('ENTITLEMENT_SECRET'),
    deepseekApiKeyPresent: present('DEEPSEEK_API_KEY'),
  }

  return Response.json(
    { ok: Object.values(checks).every(Boolean), checks },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
