/**
 * Display-only check. It does not grant export access.
 * The export route still decides from the signed cookie, the saved purchase, or the subscription.
 */
export function letterExportUnlocked(input: {
  legacyEntitled: boolean
  subscribed: boolean
  documentId: string | null
  paidDocumentIds: readonly string[]
}) {
  if (input.legacyEntitled || input.subscribed) return true
  const documentId = input.documentId?.trim() || ''
  return documentId.length > 0 && input.paidDocumentIds.includes(documentId)
}
