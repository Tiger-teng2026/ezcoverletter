import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POST as exportPost } from '../app/api/export/route.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import { useTestLedger } from '../lib/billing/runtime.ts'
import { buildDocx, buildPdf } from '../lib/export-files.ts'
import { docxContentTypes, docxDocumentXml, pdfPageCount, pdfText, responseBytes } from './export-bytes.ts'

const OWNER = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
const CONTACT = {
  fullName: 'Jane Doe',
  phone: '+1 555 0100',
  email: 'jane@example.com',
  linkedin: 'https://linkedin.com/in/janedoe',
}
const LETTER = ['Dear Hiring Manager,', '', 'I shipped the billing pipeline and kept the rollout measurable.'].join('\n')

function requestFor(userId: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (userId) headers['x-ezcl-user'] = `user:${userId}`
  return new Request('https://www.ezcoverletter.xyz/api/export', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function payFor(ledger: MemoryLedger, userId: string, letter: string) {
  const documentId = await ledger.saveExportDocument({ userId, letter, title: 'Letter', contact: CONTACT })
  const attempt = await ledger.beginExportCheckout(userId, documentId)
  const confirmed = await ledger.confirmExportPayment(`chk_${documentId}`, attempt.requestId)
  assert.equal(confirmed.granted, true)
  return documentId
}

test('a docx package is OOXML and a pdf package is a real PDF', async () => {
  const docx = buildDocx(LETTER, CONTACT)
  assert.equal(docx[0], 0x50)
  assert.equal(docx[1], 0x4b)
  const types = docxContentTypes(docx)
  assert.match(types, /wordprocessingml\.document\.main\+xml/)
  const xml = docxDocumentXml(docx)
  assert.match(xml, /<w:document /)
  assert.match(xml, /w:pgSz w:w="12240" w:h="15840"/)
  assert.match(xml, /I shipped the billing pipeline/)
  assert.match(xml, /Jane Doe/)
  assert.match(xml, /jane@example.com/)
  assert.doesNotMatch(xml, /<html|<!DOCTYPE/i)

  const pdf = await buildPdf(LETTER, CONTACT)
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString('ascii'), '%PDF-')
  assert.equal(await pdfPageCount(pdf), 1)
  const text = pdfText(pdf)
  assert.match(text, /Dear Hiring Manager,/)
  assert.match(text, /Jane Doe/)
  assert.match(text, /\+1 555 0100/)
  assert.match(text, /linkedin.com\/in\/janedoe/)
})

test('paid, unpaid, refunded, foreign, missing, empty, and long letters stay inside the export rules', async () => {
  const ledger = new MemoryLedger()
  useTestLedger(ledger)
  process.env.EZCL_BILLING_TEST = '1'
  try {
    const paidId = await payFor(ledger, OWNER, LETTER)
    const otherId = await payFor(ledger, OTHER, 'Another person wrote this letter for a different role.')
    const purchaseCount = () => (ledger as unknown as { exports: Map<string, string> }).exports.size
    const purchasesBefore = purchaseCount()

    const pdf = await exportPost(requestFor(OWNER, { format: 'pdf', documentId: paidId, contact: CONTACT }))
    assert.equal(pdf.status, 200)
    assert.match(pdf.headers.get('content-type') || '', /application\/pdf/)
    assert.match(pdf.headers.get('content-disposition') || '', /attachment; filename="cover-letter\.pdf"/)
    const pdfBytes = await responseBytes(pdf)
    assert.equal(Buffer.from(pdfBytes.subarray(0, 5)).toString('ascii'), '%PDF-')
    assert.match(pdfText(pdfBytes), /I shipped the billing pipeline/)

    const word = await exportPost(requestFor(OWNER, { format: 'word', documentId: paidId, contact: CONTACT }))
    assert.equal(word.status, 200)
    assert.match(word.headers.get('content-type') || '', /wordprocessingml\.document/)
    assert.match(word.headers.get('content-disposition') || '', /attachment; filename="cover-letter\.docx"/)
    assert.match(docxDocumentXml(await responseBytes(word)), /I shipped the billing pipeline/)
    assert.equal(purchaseCount(), purchasesBefore)

    const unpaidId = await ledger.saveExportDocument({
      userId: OWNER,
      letter: 'This letter was not purchased.',
      title: 'Unpaid',
      contact: CONTACT,
    })
    const unpaid = await exportPost(requestFor(OWNER, { format: 'pdf', documentId: unpaidId }))
    assert.equal(unpaid.status, 401)
    assert.equal((await unpaid.text()).includes('%PDF'), false)

    await ledger.revokeDocumentExport(`chk_${paidId}`)
    const refunded = await exportPost(requestFor(OWNER, { format: 'pdf', documentId: paidId }))
    assert.equal(refunded.status, 401)

    const foreign = await exportPost(requestFor(OWNER, { format: 'word', documentId: otherId }))
    assert.equal(foreign.status, 401)
    assert.equal((await foreign.text()).includes('Another person wrote'), false)

    const missing = await exportPost(requestFor(OWNER, {
      format: 'pdf',
      documentId: '55555555-5555-4555-8555-555555555555',
    }))
    assert.equal(missing.status, 401)

    const emptyId = await payFor(ledger, OWNER, '   ')
    const empty = await exportPost(requestFor(OWNER, { format: 'pdf', documentId: emptyId, contact: CONTACT }))
    assert.equal(empty.status, 400)
    assert.match(await empty.text(), /no cover letter/i)

    const longLetter = Array.from({ length: 90 }, (_, index) => {
      const label = String(index + 1).padStart(3, '0')
      return `Paragraph ${label} keeps a full sentence about the measurable rollout, the team, and the billing work that still belongs in the file.`
    }).join('\n\n')
    const longId = await payFor(ledger, OWNER, longLetter)
    const longPdf = await exportPost(requestFor(OWNER, { format: 'pdf', documentId: longId, contact: CONTACT }))
    assert.equal(longPdf.status, 200)
    const longBytes = await responseBytes(longPdf)
    assert.ok(await pdfPageCount(longBytes) >= 2)
    const longText = pdfText(longBytes)
    assert.match(longText, /Paragraph 001/)
    assert.match(longText, /Paragraph 090/)
    const longDocx = docxDocumentXml(buildDocx(longLetter, CONTACT))
    assert.match(longDocx, /Paragraph 001/)
    assert.match(longDocx, /Paragraph 090/)
  } finally {
    useTestLedger(null)
    delete process.env.EZCL_BILLING_TEST
  }
})
