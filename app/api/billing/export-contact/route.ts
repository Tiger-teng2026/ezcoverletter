import { accountSnapshot, getTestLedger, testingBilling } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'
import { userFromRequest } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(req: Request) {
  const account = await accountSnapshot(req)
  if (!account.ok) return withCookies(Response.json({ error: account.error }, { status: account.status }), account.cookies ?? [])
  if (!account.snapshot.signedIn || !account.snapshot.userId) {
    return withCookies(Response.json({ error: 'Sign in to edit the sign-off on a purchased letter.' }, { status: 401 }), account.cookies)
  }
  const body = await req.json().catch(() => null)
  const documentId = body && typeof body === 'object' && typeof (body as { documentId?: unknown }).documentId === 'string'
    ? (body as { documentId: string }).documentId
    : ''
  const contact = body && typeof body === 'object' && (body as { contact?: unknown }).contact && typeof (body as { contact?: unknown }).contact === 'object'
    ? (body as { contact: Record<string, string> }).contact
    : null
  if (!documentId || !contact) {
    return withCookies(Response.json({ error: 'Choose a saved letter and a sign-off.' }, { status: 400 }), account.cookies)
  }

  if (testingBilling()) {
    const ledger = getTestLedger()
    if (!ledger) return withCookies(Response.json({ error: 'Sign-off could not be saved.' }, { status: 503 }), account.cookies)
    const updated = await ledger.updateExportContact(account.snapshot.userId, documentId, contact)
    if (!updated) return withCookies(Response.json({ error: 'That letter was not found.' }, { status: 404 }), account.cookies)
    return withCookies(Response.json({ ok: true }), account.cookies)
  }

  const user = await userFromRequest(req)
  if (!user) return withCookies(Response.json({ error: 'Sign in to edit the sign-off on a purchased letter.' }, { status: 401 }), account.cookies)
  const { error } = await user.client.rpc('update_export_contact', { p_document_id: documentId, p_contact: contact })
  if (error) return withCookies(Response.json({ error: 'That letter was not found.' }, { status: 404 }), account.cookies)
  return withCookies(Response.json({ ok: true }), account.cookies)
}
