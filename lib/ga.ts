export const GA_MEASUREMENT_ID = 'G-9HB1H56DYX'

type Gtag = (...args: unknown[]) => void

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
  }
}

function ensureGtag() {
  if (typeof window === 'undefined') return false
  window.dataLayer = window.dataLayer || []
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer!.push(arguments)
    }
  }
  return true
}

/** DebugView only shows hits tagged with debug_mode. */
export function isGaDebugEnabled() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
  try {
    if (window.localStorage.getItem('ga_debug') === '1') return true
  } catch {
    // ignore
  }
  return /(?:^|[?&])ga_debug=1(?:&|$)/.test(window.location.search)
}

function withDebug(params?: Record<string, unknown>) {
  if (!isGaDebugEnabled()) return params
  return { ...params, debug_mode: true }
}

/** Client-only GA4 event. Queues to dataLayer if gtag.js is still loading. */
export function track(event: string, params?: Record<string, unknown>) {
  if (!ensureGtag()) return
  window.gtag!('event', event, withDebug(params))
}

export function trackPageView(path: string) {
  if (!ensureGtag()) return
  window.gtag!(
    'config',
    GA_MEASUREMENT_ID,
    withDebug({
      page_path: path,
      send_page_view: true,
    }),
  )
}
