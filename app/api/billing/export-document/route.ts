import { accountSnapshot, getTestLedger, testingBilling } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'
import { supabaseServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(req: Request) {
  const account = await accountSnapshot(req)
  if (!account.ok) return withCookies(Response.json({ error: account.error }, { status: account.status }), account.cookies ?? [])
  if (!account.snapshot.signedIn || !account.snapshot.userId) {
    return withCookies(Response.json({ error: 'Sign in before buying export for a cover letter.' }, { status: 401 }), account.cookies)
  }
  const body = await req.json().catch(() => null)
  const letter = body && typeof body === 'object' && typeof (body as { letter?: unknown }).letter === 'string'
    ? (body as { letter: string }).letter
    : ''
  if (!letter.trim() || letter.length > 40000) {
    return withCookies(Response.json({ error: 'There is no cover letter to save for export.' }, { status: 400 }), account.cookies)
  }
  const title = body && typeof body === 'object' && typeof (body as { title?: unknown }).title === 'string'
    ? (body as { title: string }).title
    : ''
  const contact = body && typeof body === 'object' && (body as { contact?: unknown }).contact && typeof (body as { contact?: unknown }).contact === 'object'
    ? (body as { contact: Record<string, string> }).contact
    : {}
  const generationId = body && typeof body === 'object' && typeof (body as { generationId?: unknown }).generationId === 'string'
    ? (body as { generationId: string }).generationId
    : null

  if (testingBilling()) {
    const ledger = getTestLedger()
    if (!ledger) return withCookies(Response.json({ error: account.error }, { status: 503 }), account.cookies)
    const documentId = await ledger.saveExportDocument({
      userId: account.snapshot.userId,
      letter,
      title,
      contact,
      generationId,
    })
    return withCookies(Response.json({ documentId }), account.cookies)
  }

  const client = supabaseServiceClient()
  if (!client) return withCookies(Response.json({ error: 'Saved letters are unavailable.' }, { status: 503 }), account.cookies)
  const saved = await client.rpc('save_export_document', {
    p_user_id: account.snapshot.userId,
    p_letter: letter,
    p_title: title,
    p_contact: contact,
    p_generation_id: generationId,
  })
  if (saved.error || typeof saved.data !== 'string') {
    return withCookies(Response.json({ error: 'That cover letter could not be saved for export.' }, { status: 400 }), account.cookies)
  }
  return withCookies(Response.json({ documentId: saved.data }), account.cookies)
}
