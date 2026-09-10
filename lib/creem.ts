import { CREEM_PRODUCT_ID, SITE_URL } from '@/lib/constants'

type CreemCheckout = {
  id?: string
  status?: string
  checkout_url?: string
  checkoutUrl?: string
  product?: unknown
}

export function creemApiKey() {
  return process.env.CREEM_API_KEY?.trim() || ''
}

export function creemApiBase() {
  return process.env.CREEM_API_URL?.trim() || 'https://api.creem.io'
}

export function successUrlFromRequest(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}/success`
  return `${SITE_URL}/success`
}

export function creemProductId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
  }
  return ''
}

export function looksLikePaidRedirect(params: {
  checkoutId?: string
  orderId?: string
  productId?: string
}) {
  const checkoutId = params.checkoutId?.trim() || ''
  if (!/^ch[k]?_[A-Za-z0-9]+$/i.test(checkoutId)) return false

  const productId = params.productId?.trim() || ''
  if (productId && productId !== CREEM_PRODUCT_ID) return false

  const orderId = params.orderId?.trim() || ''
  if (orderId && !/^ord_[A-Za-z0-9]+$/i.test(orderId)) return false

  return true
}

export async function createCreemCheckout(successUrl: string) {
  const apiKey = creemApiKey()
  if (!apiKey) return null

  const res = await fetch(`${creemApiBase()}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      product_id: CREEM_PRODUCT_ID,
      success_url: successUrl,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `Creem HTTP ${res.status}`)
  }

  const data = (await res.json()) as CreemCheckout
  const checkoutUrl = data.checkout_url || data.checkoutUrl
  if (!checkoutUrl) {
    throw new Error('Creem checkout URL missing')
  }

  return {
    checkoutUrl,
    checkoutId: typeof data.id === 'string' ? data.id : undefined,
  }
}

export async function retrieveCreemCheckout(checkoutId: string) {
  const apiKey = creemApiKey()
  if (!apiKey) return null

  const res = await fetch(
    `${creemApiBase()}/v1/checkouts?checkout_id=${encodeURIComponent(checkoutId)}`,
    {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    },
  )

  if (!res.ok) return null
  return (await res.json()) as CreemCheckout
}
