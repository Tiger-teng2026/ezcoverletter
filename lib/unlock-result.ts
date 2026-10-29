export type UnlockUiState = 'granted' | 'pending' | 'failed' | 'entitlement_pending'

/**
 * Decide what the success page may show and whether a purchase event is allowed.
 * Purchase analytics fire only for a verified Creem payment whose entitlement
 * was stored both on the server and in this browser.
 */
export function interpretUnlockResponse(input: {
  status: number
  verified?: boolean
  granted?: boolean
  paymentStatus?: string
  browserStateSaved: boolean
  documentScoped?: boolean
}): { state: UnlockUiState; trackPurchase: boolean } {
  if (input.verified === true && input.granted === true && (input.browserStateSaved || input.documentScoped === true)) {
    return { state: 'granted', trackPurchase: true }
  }

  if (input.verified === true) {
    return { state: 'entitlement_pending', trackPurchase: false }
  }

  if (input.status === 402 && input.paymentStatus !== 'expired') {
    return { state: 'pending', trackPurchase: false }
  }

  return { state: 'failed', trackPurchase: false }
}
