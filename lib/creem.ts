import { CREEM_LIVE_PRODUCT_ID, SITE_URL, isCreemHostedCheckoutUrl } from '@/lib/constants'

export type CreemCheckout = {
  id?: string
  status?: string
  checkout_url?: string
  checkoutUrl?: string
  product?: unknown
  product_id?: unknown
}

const ALLOWED_SUCCESS_ORIGINS = new Set([
  'https://www.ezcoverletter.xyz',
  'https://ezcoverletter.xyz',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

export const CREEM_PRODUCTION_API = 'https://api.creem.io'
export const CREEM_TEST_API = 'https://test-api.creem.io'

export type CreemRuntimeConfig = {
  apiKey: string
  apiBase: string
  productId: string
  mode: 'live' | 'test'
}

export type CreemConfigResult =
  | ({ ok: true } & CreemRuntimeConfig)
  | { ok: false; code: string; error: string }

function officialApiMode(apiBase: string): 'live' | 'test' | null {
  if (apiBase === CREEM_PRODUCTION_API) return 'live'
  if (apiBase === CREEM_TEST_API) return 'test'
  return null
}

/**
 * One server-side Creem configuration. Checkout, verification, and cookies all use this.
 * Incomplete or mixed test/live settings fail closed and do not call Creem.
 */
export function readCreemConfig(): CreemConfigResult {
  const apiKey = process.env.CREEM_API_KEY?.trim() || ''
  const productId = process.env.CREEM_PRODUCT_ID?.trim() || ''
  const apiBase = (process.env.CREEM_API_URL?.trim() || CREEM_PRODUCTION_API).replace(/\/+$/, '')

  if (!apiKey) {
    return {
      ok: false,
      code: 'missing_api_key',
      error: 'Checkout is unavailable because payment verification is not configured. Pro Export was not unlocked.',
    }
  }
  if (!productId) {
    return {
      ok: false,
      code: 'missing_product_id',
      error: 'Checkout is unavailable because the Creem product is not configured. Pro Export was not unlocked.',
    }
  }

  const mode = officialApiMode(apiBase)
  if (!mode) {
    return {
      ok: false,
      code: 'invalid_api_url',
      error: 'Checkout is unavailable because the Creem API address is not an official Creem host. Pro Export was not unlocked.',
    }
  }
  if (mode === 'test' && productId === CREEM_LIVE_PRODUCT_ID) {
    return {
      ok: false,
      code: 'test_api_with_live_product',
      error:
        'Checkout is unavailable because the live product cannot be used with the Creem test API. Pro Export was not unlocked.',
    }
  }
  if (mode === 'live' && productId !== CREEM_LIVE_PRODUCT_ID) {
    return {
      ok: false,
      code: 'live_api_with_other_product',
      error:
        'Checkout is unavailable because the production Creem API only accepts the existing live product. Pro Export was not unlocked.',
    }
  }

  return { ok: true, apiKey, apiBase, productId, mode }
}

function firstHeaderValue(value: string | null) {
  if (!value) return ''
  return value.split(',')[0]?.trim().toLowerCase() || ''
}

function isVercelDeploymentHost(host: string) {
  if (!host || host.length > 253) return false
  const labels = host.split('.')
  if (labels.length < 3 || labels.at(-1) !== 'app' || labels.at(-2) !== 'vercel') return false
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

/** Exact *.vercel.app hostname only. A scheme, wildcard, or other host is rejected. */
function vercelDeploymentOrigin(value: string | undefined) {
  const host = value?.trim().toLowerCase() || ''
  if (!isVercelDeploymentHost(host)) return ''
  return `https://${host}`
}

/**
 * Preview login and checkout return the stable branch alias whenever it is valid.
 * The per-deployment VERCEL_URL is used only when that alias is missing.
 * The request host must be one of those two exact hosts; other vercel.app names are not accepted.
 */
function previewCallbackOrigin(requestOrigin: string) {
  if (process.env.VERCEL_ENV !== 'preview') return ''
  const branch = vercelDeploymentOrigin(process.env.VERCEL_BRANCH_URL)
  const deployment = vercelDeploymentOrigin(process.env.VERCEL_URL)
  if (branch && (requestOrigin === branch || requestOrigin === deployment)) return branch
  if (!branch && deployment && requestOrigin === deployment) return deployment
  return ''
}

export function allowlistedOriginFromRequest(req: Request) {
  const host = firstHeaderValue(req.headers.get('x-forwarded-host') || req.headers.get('host'))
  const forwardedProto = firstHeaderValue(req.headers.get('x-forwarded-proto'))
  const proto =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : host.startsWith('localhost:') || host.startsWith('127.0.0.1:')
        ? 'http'
        : 'https'
  const origin = `${proto}://${host}`
  const vercelEnv = process.env.VERCEL_ENV

  if (vercelEnv === 'production') {
    if (origin === 'https://www.ezcoverletter.xyz' || origin === 'https://ezcoverletter.xyz') return origin
    return SITE_URL
  }

  if (vercelEnv === 'preview') {
    const preview = previewCallbackOrigin(origin)
    if (preview) return preview
    // An unrecognized host is not echoed. A valid branch alias still keeps the
    // login on Preview instead of falling through to the production site.
    return vercelDeploymentOrigin(process.env.VERCEL_BRANCH_URL) || SITE_URL
  }

  if (ALLOWED_SUCCESS_ORIGINS.has(origin)) return origin
  return SITE_URL
}

/**
 * Checkout and login redirects stay on production, local dev, or this Preview branch.
 * Preview prefers the stable branch alias. Production ignores preview and localhost hosts.
 */
export function successUrlFromRequest(req: Request) {
  return `${allowlistedOriginFromRequest(req)}/success`
}

export function creemProductId(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id.trim()
  }
  return ''
}

function checkoutProductIds(session: CreemCheckout) {
  const ids: string[] = []
  const fromProduct = creemProductId(session.product)
  if (fromProduct) ids.push(fromProduct)
  if (typeof session.product_id === 'string' && session.product_id.trim()) {
    const id = session.product_id.trim()
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

export type PaidCheckoutAssessment =
  | { ok: true; productId: string }
  | { ok: false; reason: 'not_completed' | 'product_mismatch' | 'query_failed' }

/** A paid grant requires the requested checkout, status completed, and the configured product only. */
export function assessPaidCheckout(
  session: CreemCheckout,
  expectedCheckoutId: string,
  expectedProductId: string,
): PaidCheckoutAssessment {
  const checkoutId = expectedCheckoutId.trim()
  const productId = expectedProductId.trim()
  if (!productId || !session.id || session.id !== checkoutId) return { ok: false, reason: 'query_failed' }
  if (session.status !== 'completed') return { ok: false, reason: 'not_completed' }

  const productIds = checkoutProductIds(session)
  if (productIds.length === 0 || productIds.some((id) => id !== productId)) {
    return { ok: false, reason: 'product_mismatch' }
  }

  return { ok: true, productId }
}

export class CreemCheckoutError extends Error {
  readonly status: number
  readonly alreadyExists: boolean

  constructor(status: number, alreadyExists: boolean) {
    super('Creem checkout failed')
    this.name = 'CreemCheckoutError'
    this.status = status
    this.alreadyExists = alreadyExists
  }
}

export async function createCreemCheckout(
  config: CreemRuntimeConfig,
  successUrl: string,
  options?: { productId?: string; metadata?: Record<string, string>; requestId?: string },
) {
  const body: Record<string, unknown> = {
    product_id: options?.productId || config.productId,
    success_url: successUrl,
  }
  if (options?.requestId) body.request_id = options.requestId
  if (options?.metadata && Object.keys(options.metadata).length > 0) body.metadata = options.metadata

  const res = await fetch(`${config.apiBase}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[checkout] Creem session failed', res.status)
    throw new CreemCheckoutError(res.status, /already exists/i.test(detail))
  }

  const data = (await res.json()) as CreemCheckout
  const checkoutUrl = data.checkout_url || data.checkoutUrl
  if (!checkoutUrl || !isCreemHostedCheckoutUrl(checkoutUrl)) {
    console.error('[checkout] Creem session URL was missing or not an allowed checkout host')
    throw new Error('Creem checkout URL missing')
  }

  return {
    checkoutUrl,
    checkoutId: typeof data.id === 'string' ? data.id : undefined,
  }
}

export type RetrievedCheckout =
  | { ok: true; session: CreemCheckout }
  | { ok: false; reason: 'query_failed' }

export async function retrieveCreemCheckout(
  checkoutId: string,
  config: CreemRuntimeConfig,
): Promise<RetrievedCheckout> {
  try {
    const res = await fetch(
      `${config.apiBase}/v1/checkouts?checkout_id=${encodeURIComponent(checkoutId)}`,
      {
        headers: { 'x-api-key': config.apiKey },
        cache: 'no-store',
      },
    )

    if (!res.ok) return { ok: false, reason: 'query_failed' }
    const data = (await res.json()) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, reason: 'query_failed' }
    }
    return { ok: true, session: data as CreemCheckout }
  } catch (error) {
    console.error('[unlock] Creem checkout query failed', error instanceof Error ? error.name : 'Error')
    return { ok: false, reason: 'query_failed' }
  }
}
