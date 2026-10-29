const KEY = 'ezcl_export_documents_v1'
const PAID_KEY = 'ezcl_paid_export_document'

function hashLetter(letter: string) {
  let hash = 5381
  for (let i = 0; i < letter.length; i += 1) hash = Math.imul(hash, 33) ^ letter.charCodeAt(i)
  return (hash >>> 0).toString(16)
}

function readAll() {
  if (typeof window === 'undefined') return {} as Record<string, string>
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(KEY) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function rememberExportDocument(letter: string, documentId: string) {
  if (typeof window === 'undefined' || !documentId) return
  const all = readAll()
  all[hashLetter(letter)] = documentId
  window.sessionStorage.setItem(KEY, JSON.stringify(all))
}

export function exportFailureAction(status: number, knownDocumentId: string | null) {
  if ((status === 401 || status === 403) && !knownDocumentId) return 'create' as const
  if (status === 401 || status === 403) return 'resume' as const
  return 'stop' as const
}

export function rememberPaidExportDocument(documentId: string) {
  if (typeof window === 'undefined' || !documentId) return
  window.sessionStorage.setItem(PAID_KEY, documentId)
}

export function paidExportDocument() {
  if (typeof window === 'undefined') return null
  const id = window.sessionStorage.getItem(PAID_KEY)
  return id || null
}

export function exportDocumentForLetter(letter: string) {
  const id = readAll()[hashLetter(letter)]
  if (typeof id === 'string' && id) return id
  return paidExportDocument()
}
