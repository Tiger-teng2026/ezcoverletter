import { createHmac, timingSafeEqual } from 'node:crypto'
import { readCreemConfig } from '@/lib/creem'

/** HttpOnly cookie that is the server-side Pro Export grant. */
export const ENTITLEMENT_COOKIE = 'ezcl_pro'

/** Chrome caps cookie lifetime at 400 days. The signed payload uses the same limit. */
export const ENTITLEMENT_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

export type EntitlementClaims = {
  v: 1
  productId: string
  checkoutId: string
  exp: number
}

export function entitlementSecret() {
  return process.env.ENTITLEMENT_SECRET?.trim() || ''
}

function signBody(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function sealEntitlement(checkoutId: string, productId: string, now = Date.now()): string | null {
  const secret = entitlementSecret()
  const id = checkoutId.trim()
  const product = productId.trim()
  if (!secret || !id || !product) return null

  const claims: EntitlementClaims = {
    v: 1,
    productId: product,
    checkoutId: id,
    exp: Math.floor(now / 1000) + ENTITLEMENT_MAX_AGE_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${signBody(body, secret)}`
}

export function openEntitlement(
  token: string | null | undefined,
  expectedProductId: string,
  now = Date.now(),
): EntitlementClaims | null {
  const secret = entitlementSecret()
  const productId = expectedProductId.trim()
  if (!secret || !token || !productId) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!body || !signature) return null

  const expected = signBody(body, secret)
  const actualBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  if (actualBytes.length !== expectedBytes.length) return null
  if (!timingSafeEqual(actualBytes, expectedBytes)) return null

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<EntitlementClaims>
    if (parsed.v !== 1) return null
    if (parsed.productId !== productId) return null
    if (typeof parsed.checkoutId !== 'string' || !parsed.checkoutId.trim()) return null
    if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) return null
    if (parsed.exp <= Math.floor(now / 1000)) return null
    return {
      v: 1,
      productId: parsed.productId,
      checkoutId: parsed.checkoutId,
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

export function readRequestCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }

  return null
}

export function entitlementFromRequest(req: Request, now = Date.now()): EntitlementClaims | null {
  const config = readCreemConfig()
  if (!config.ok) return null
  return openEntitlement(readRequestCookie(req, ENTITLEMENT_COOKIE), config.productId, now)
}

export function entitlementSetCookie(token: string) {
  return [
    `${ENTITLEMENT_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${ENTITLEMENT_MAX_AGE_SECONDS}`,
  ].join('; ')
}

export function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function entitlementGrantResponse(body: unknown, token: string) {
  const response = noStoreJson(body, 200)
  response.headers.append('Set-Cookie', entitlementSetCookie(token))
  return response
}
