import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POST as exportPost } from '../app/api/export/route.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import { useTestLedger } from '../lib/billing/runtime.ts'

const USER = '22222222-2222-4222-8222-222222222222'
const CONTACT = {
  fullName: 'Jane Doe',
  phone: '+1 555 0100',
  email: 'jane@example.com',
  linkedin: 'https://linkedin.com/in/janedoe',
}
const SAVED = [
  'Dear Hiring Manager,',
  '',
  'I built the Activation Hub.',
].join('\n')

function exportRequest(documentId: string, letter = 'A different unpaid letter.') {
  return new Request('https://www.ezcoverletter.xyz/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ezcl-user': `user:${USER}` },
    body: JSON.stringify({ format: 'pdf', documentId, letter, contact: CONTACT }),
  })
}

test('a purchased document still exports, and an unpaid document does not', async () => {
  const ledger = new MemoryLedger()
  useTestLedger(ledger)
  process.env.EZCL_BILLING_TEST = '1'
  try {
    const paidId = await ledger.saveExportDocument({
      userId: USER,
      letter: SAVED,
      title: 'Paid',
      contact: CONTACT,
    })
    const unpaidId = await ledger.saveExportDocument({
      userId: USER,
      letter: 'This letter was not purchased.',
      title: 'Unpaid',
      contact: CONTACT,
    })
    const attempt = await ledger.beginExportCheckout(USER, paidId)
    const confirmed = await ledger.confirmExportPayment('chk_saved_letter', attempt.requestId)
    assert.equal(confirmed.granted, true)

    const paid = await exportPost(exportRequest(paidId))
    const html = await paid.text()
    assert.equal(paid.status, 200)
    assert.match(html, /Dear Hiring Manager,/)
    assert.match(html, /I built the Activation Hub/)
    assert.match(html, /Jane Doe/)
    assert.match(html, /\+1 555 0100/)
    assert.match(html, /jane@example.com/)
    assert.match(html, /https:\/\/linkedin.com\/in\/janedoe/)
    assert.doesNotMatch(html, /A different unpaid letter/)
    assert.doesNotMatch(html, /EzCoverLetter|AI Job Search Toolkit/)

    const unpaid = await exportPost(exportRequest(unpaidId))
    const unpaidText = await unpaid.text()
    assert.equal(unpaid.status, 401)
    assert.equal(unpaidText.includes('id="letter"'), false)
    assert.equal(unpaidText.includes('This letter was not purchased'), false)

    const missing = await exportPost(exportRequest(''))
    assert.equal(missing.status, 401)
    assert.equal((await missing.text()).includes('id="letter"'), false)
  } finally {
    useTestLedger(null)
    delete process.env.EZCL_BILLING_TEST
  }
})
