import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { toPreviewLetter } from '../lib/copy-letter.ts'
import { printHtmlDocument } from '../lib/export-download.ts'
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
  assert.doesNotMatch(pdf, /EzCoverLetter|AI Job Search Toolkit/)
  assert.doesNotMatch(word, /EzCoverLetter|AI Job Search Toolkit/)
  assert.match(pdf, /@page\s*\{[^}]*margin:\s*0/)
  assert.match(pdf, /#letter\s*\{[^}]*padding:\s*1in/)
  assert.match(word, /@page\s*\{[^}]*margin:\s*1in/)
  assert.doesNotMatch(word, /padding:\s*1in/)
  assert.equal(pdf.match(/<main id="letter"><p>([^<]*)<\/p>/)?.[1], 'Dear Hiring Manager,')
  assert.match(pdf, /margin:\s*0 0 10pt 0/)
})

test('printing clears and restores the iframe document title', () => {
  const pdf = buildPrintDocumentHtml(LETTER, CONTACT)
  assert.equal(pdf.match(/<main id="letter"><p>([^<]*)<\/p>/)?.[1], 'Dear Hiring Manager,')
  assert.doesNotMatch(pdf, /EzCoverLetter|AI Job Search Toolkit|datetime|timestamp|generated at/i)
  assert.match(pdf, /@page\s*\{[^}]*margin:\s*0/)

  const success = runPrint(pdf, () => {})
  assert.equal(success.frameTitleAtPrint, '')
  assert.equal(success.mainTitleAtPrint, 'EzCoverLetter — AI Job Search Toolkit')
  assert.equal(success.mainDocument.title, 'EzCoverLetter — AI Job Search Toolkit')
  assert.equal(success.frameDocument.title, 'EzCoverLetter — AI Job Search Toolkit')
  assert.equal(success.iframe.removed, false)
  success.timers.shift()?.()
  assert.equal(success.iframe.removed, true)

  const failure = runPrint(pdf, () => {
    throw new Error('print failed')
  })
  assert.equal(failure.frameTitleAtPrint, '')
  assert.equal(failure.mainDocument.title, 'EzCoverLetter — AI Job Search Toolkit')
  assert.equal(failure.frameDocument.title, 'EzCoverLetter — AI Job Search Toolkit')
  assert.equal(failure.iframe.removed, false)
})

function runPrint(html: string, print: () => void) {
  const frameDocument = {
    title: 'EzCoverLetter — AI Job Search Toolkit',
    readyState: 'complete',
    open() {},
    write() {},
    close() {},
  }
  const iframe = {
    contentDocument: frameDocument,
    contentWindow: {
      document: frameDocument,
      focus() {},
      print,
    },
    removed: false,
    setAttribute() {},
    remove() {
      this.removed = true
    },
  }
  const mainDocument = {
    title: 'EzCoverLetter — AI Job Search Toolkit',
    body: { appendChild() {} },
    createElement() {
      return iframe
    },
  }
  const timers: Array<() => void> = []
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  let frameTitleAtPrint = 'unset'
  let mainTitleAtPrint = 'unset'
  const originalPrint = iframe.contentWindow.print
  iframe.contentWindow.print = () => {
    frameTitleAtPrint = frameDocument.title
    mainTitleAtPrint = mainDocument.title
    originalPrint()
  }
  Object.assign(globalThis, {
    document: mainDocument,
    window: {
      setTimeout(callback: () => void) {
        timers.push(callback)
        return timers.length
      },
    },
  })
  try {
    printHtmlDocument(html)
    const triggerPrint = timers.shift()
    assert.equal(typeof triggerPrint, 'function')
    try {
      triggerPrint?.()
    } catch (error) {
      assert.match(error instanceof Error ? error.message : '', /print failed/)
    }
    return { mainDocument, frameDocument, iframe, timers, frameTitleAtPrint, mainTitleAtPrint }
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  }
}

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
