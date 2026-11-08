import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { toPreviewLetter } from '../lib/copy-letter.ts'
import { buildPrintDocumentHtml, buildWordDocumentHtml } from '../lib/export-letter.ts'
import { letterExportUnlocked } from '../lib/letter-export-access.ts'

const CONTACT = {
  fullName: 'Jane Doe',
  phone: '+1 555 0100',
  email: 'jane@example.com',
  linkedin: 'https://linkedin.com/in/janedoe',
}

const LETTER = [
  'Dear Hiring Manager,',
  '',
  'I led the **Activation Hub**.',
  '',
  'Best regards,',
  '[User Full Name]',
  '[Phone] | [Email] | [LinkedIn]',
].join('\n')

test('preview sign-off uses entered contact details and omits empty fields', () => {
  const preview = toPreviewLetter(LETTER, {
    fullName: 'Jane Doe',
    phone: '',
    email: 'jane@example.com',
    linkedin: '[LinkedIn]',
  })
  assert.match(preview, /\*\*Activation Hub\*\*/)
  assert.match(preview, /Best regards,\nJane Doe\njane@example.com/)
  assert.equal(preview.includes('[User Full Name]'), false)
  assert.equal(preview.includes('[Phone]'), false)
  assert.equal(preview.includes('[Email]'), false)
  assert.equal(preview.includes('[LinkedIn]'), false)
  assert.equal(preview.includes(' | '), false)
})

test('preview contact updates across the four fields without inventing the missing ones', () => {
  const partial = toPreviewLetter('I led the launch.', { fullName: 'Jane Doe' })
  assert.equal(partial, 'I led the launch.\n\nBest regards,\nJane Doe')

  const complete = toPreviewLetter('I led the launch.', CONTACT)
  assert.equal(
    complete,
    'I led the launch.\n\nBest regards,\nJane Doe\n+1 555 0100 | jane@example.com | https://linkedin.com/in/janedoe',
  )
})

test('pdf and word keep the same body, real contact, and no generated title or timestamp', () => {
  const pdf = buildPrintDocumentHtml(LETTER, CONTACT)
  const word = buildWordDocumentHtml(LETTER, CONTACT)
  const body = (html: string) => html.match(/<main id="letter">([\s\S]*)<\/main>/)?.[1]
  assert.equal(body(pdf), body(word))
  assert.match(body(pdf) || '', /Activation Hub/)
  assert.match(body(pdf) || '', /Jane Doe/)
  assert.match(body(pdf) || '', /\+1 555 0100 \| jane@example.com \| https:\/\/linkedin.com\/in\/janedoe/)
  assert.doesNotMatch(pdf, /\[User Full Name\]|\[Phone\]|\[Email\]|\[LinkedIn\]/)
  assert.doesNotMatch(word, /\[User Full Name\]|\[Phone\]|\[Email\]|\[LinkedIn\]/)
  assert.match(pdf, /<title><\/title>/)
  assert.doesNotMatch(pdf, /<title>Cover Letter<\/title>/)
  assert.doesNotMatch(pdf, /datetime|timestamp|generated at/i)
  assert.doesNotMatch(word, /datetime|timestamp|generated at/i)
})

test('one purchased letter does not unlock a different letter', () => {
  assert.equal(
    letterExportUnlocked({
      legacyEntitled: false,
      subscribed: false,
      documentId: 'doc-paid',
      paidDocumentIds: ['doc-paid'],
    }),
    true,
  )
  assert.equal(
    letterExportUnlocked({
      legacyEntitled: false,
      subscribed: false,
      documentId: 'doc-other',
      paidDocumentIds: ['doc-paid'],
    }),
    false,
  )
  assert.equal(
    letterExportUnlocked({
      legacyEntitled: false,
      subscribed: false,
      documentId: null,
      paidDocumentIds: ['doc-paid'],
    }),
    false,
  )
})

test('subscription and the legacy signed entitlement still unlock export display', () => {
  assert.equal(
    letterExportUnlocked({
      legacyEntitled: false,
      subscribed: true,
      documentId: null,
      paidDocumentIds: [],
    }),
    true,
  )
  assert.equal(
    letterExportUnlocked({
      legacyEntitled: true,
      subscribed: false,
      documentId: null,
      paidDocumentIds: [],
    }),
    true,
  )
})

test('cover letter display does not treat the success URL as payment', () => {
  for (const relativePath of ['../components/generator.tsx', '../components/result-panel.tsx', '../lib/use-letter-export-access.ts']) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.equal(source.includes('request_id'), false)
    assert.equal(source.includes('checkout_id'), false)
    assert.equal(source.includes('searchParams'), false)
  }
})
