/**
 * Existing live Creem product. Keep this id unchanged.
 * Checkout, verification, and export authorization read CREEM_PRODUCT_ID from the server environment.
 */
export const CREEM_LIVE_PRODUCT_ID = 'prod_6QbprGqKxrIfm6zJJIVGfO'

/**
 * Public Creem product page for the live product.
 * Checkout must create a server session first. Do not redirect here when session creation fails.
 */
export const CREEM_CHECKOUT_URL = `https://www.creem.io/payment/${CREEM_LIVE_PRODUCT_ID}`

/**
 * Hosts confirmed from Creem's checkout API docs (`checkout.creem.io`)
 * and Creem's official site (`www.creem.io`). Exact host match only.
 */
const CREEM_CHECKOUT_HOSTS = new Set(['checkout.creem.io', 'www.creem.io'])

/** Checkout redirects may only leave the app for these Creem checkout hosts. */
export function isCreemHostedCheckoutUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && CREEM_CHECKOUT_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export const CONTACT_EMAIL = 'hello@ezcoverletter.xyz'

/** Canonical production origin (www) — used by sitemap, robots, and metadataBase. */
export const SITE_URL = 'https://www.ezcoverletter.xyz'
