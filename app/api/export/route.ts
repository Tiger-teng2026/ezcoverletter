import { buildPrintDocumentHtml, buildWordDocumentHtml } from '@/lib/export-letter'
import { entitlementFromRequest, noStoreJson } from '@/lib/entitlement'
import { getLedger, getTestLedger, oneTimeExportRevoked, testingBilling } from '@/lib/billing/runtime'
import { effectivePlan } from '@/lib/billing/access'
import { supabaseServiceClient, userFromRequest } from '@/lib/supabase/server'
import type { SignOffContact } from '@/lib/sign-off'

export const maxDuration = 30

const MAX_LETTER_CHARS = 40_000
const MAX_CONTACT_CHARS = 200

function asContactString(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_CONTACT_CHARS) : ''
}

function unauthorized() {
  return noStoreJson(
    { error: 'Pro Export is locked. A verified purchase is required before PDF or Word can be created.' },
    401,
  )
}

async function readerId(req: Request) {
  if (testingBilling()) {
    const header = req.headers.get('x-ezcl-user') || ''
    return header.startsWith('user:') ? header.slice(5) : null
  }
  const user = await userFromRequest(req)
  return user?.id ?? null
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return noStoreJson({ error: 'Invalid export request.' }, 400)
  }

  const format = (body as { format?: unknown }).format
  if (format !== 'pdf' && format !== 'word') {
    return noStoreJson({ error: 'Choose PDF or Word export.' }, 400)
  }

  const documentId = typeof (body as { documentId?: unknown }).documentId === 'string'
    ? (body as { documentId: string }).documentId.trim()
    : ''
  const letter = typeof (body as { letter?: unknown }).letter === 'string' ? (body as { letter: string }).letter : ''
  if (!documentId && !letter.trim()) {
    return noStoreJson({ error: 'There is no cover letter to export.' }, 400)
  }
  if (letter.length > MAX_LETTER_CHARS) {
    return noStoreJson({ error: 'This cover letter is too long to export.' }, 400)
  }

  const rawContact = (body as { contact?: unknown }).contact
  const contact: SignOffContact =
    rawContact && typeof rawContact === 'object'
      ? {
          fullName: asContactString((rawContact as SignOffContact).fullName),
          phone: asContactString((rawContact as SignOffContact).phone),
          email: asContactString((rawContact as SignOffContact).email),
          linkedin: asContactString((rawContact as SignOffContact).linkedin),
        }
      : {}

  const userId = await readerId(req)
  const purchased = userId && documentId ? await purchasedLetter(userId, documentId) : null
  const claims = entitlementFromRequest(req)
  const legacy = Boolean(claims) && !(await oneTimeExportRevoked(claims!.checkoutId))
  const subscribed = userId ? await subscriptionExportAllowed(userId) : false
  if (!purchased && !legacy && !subscribed) return unauthorized()

  const exportLetter = purchased?.letter || letter
  const exportContact = purchased
    ? {
        fullName: contact.fullName || purchased.contact.fullName || '',
        phone: contact.phone || purchased.contact.phone || '',
        email: contact.email || purchased.contact.email || '',
        linkedin: contact.linkedin || purchased.contact.linkedin || '',
      }
    : contact
  let html: string
  try {
    html = format === 'pdf' ? buildPrintDocumentHtml(exportLetter, exportContact) : buildWordDocumentHtml(exportLetter, exportContact)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed.'
    return noStoreJson({ error: message }, 400)
  }

  if (format === 'word') {
    return new Response(`\ufeff${html}`, {
      status: 200,
      headers: {
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cover-letter.doc"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function subscriptionExportAllowed(userId: string) {
  const ledger = getLedger()
  if (!ledger) return false
  const subscription = await ledger.getSubscription(userId)
  const access = effectivePlan(subscription)
  return access.plan === 'creator' || access.plan === 'pro'
}

async function purchasedLetter(userId: string, documentId: string): Promise<{ letter: string; contact: SignOffContact } | null> {
  if (testingBilling()) {
    const ledger = getTestLedger()
    const row = ledger?.getExportDocument(userId, documentId)
    if (!ledger || !row || !ledger.isDocumentPaid(userId, documentId)) return null
    return { letter: row.letter, contact: row.contact }
  }
  const client = supabaseServiceClient()
  if (!client) return null
  const purchase = await client
    .from('one_time_purchases')
    .select('status')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .eq('status', 'paid')
    .maybeSingle()
  if (purchase.error || !purchase.data) return null
  const document = await client
    .from('export_documents')
    .select('letter, contact')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle()
  if (document.error || !document.data || typeof document.data.letter !== 'string') return null
  const raw = document.data.contact
  const contact = raw && typeof raw === 'object' ? (raw as SignOffContact) : {}
  return { letter: document.data.letter, contact }
}
