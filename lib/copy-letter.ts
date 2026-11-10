/**
 * Plain-text clipboard for the free Copy button.
 * The on-screen letter keeps **keyword** highlights. Copy removes that markup
 * and does not add Markdown wrappers. Paragraph breaks stay.
 * The sign-off is "Best regards," plus only contact fields the user actually filled.
 */

import { stripTrailingSignOff, type SignOffContact } from '@/lib/sign-off'

const UNFILLED_FIELD =
  /^\[(?:User Full Name|User Phone Number|User Email|User LinkedIn URL|Phone|Email|LinkedIn)\]$/i

function filledField(value: string | undefined) {
  const trimmed = value?.replace(/\u00a0/g, ' ').trim() || ''
  if (!trimmed || UNFILLED_FIELD.test(trimmed)) return ''
  return trimmed
}

/** Sign-off for Copy. Empty contact fields are omitted, never written as placeholders. */
export function buildFreeCopySignOff(contact?: SignOffContact) {
  const lines = ['Best regards,']
  for (const field of [contact?.fullName, contact?.phone, contact?.email, contact?.linkedin]) {
    const value = filledField(field)
    if (value) lines.push(value)
  }
  return lines.join('\n')
}

/** On-screen sign-off. Filled fields stay on the letter's contact line; empty fields are omitted. */
export function buildPreviewSignOff(contact?: SignOffContact) {
  const lines = ['Best regards,']
  const name = filledField(contact?.fullName)
  if (name) lines.push(name)
  const contactLine = [contact?.phone, contact?.email, contact?.linkedin]
    .map((field) => filledField(field))
    .filter(Boolean)
    .join(' | ')
  if (contactLine) lines.push(contactLine)
  return lines.join('\n')
}

/**
 * Clipboard text matching the letter the page shows, without emphasis markers.
 */
function letterBody(letter: string) {
  return stripTrailingSignOff(letter.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n'))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Screen letter. Keyword marks stay; the sign-off uses only the contact fields entered so far. */
export function toPreviewLetter(letter: string, contact?: SignOffContact): string {
  const body = letterBody(letter)
  const signOff = buildPreviewSignOff(contact)
  if (!body) return signOff
  return `${body}\n\n${signOff}`
}

/**
 * Clipboard text matching the letter the page shows, without emphasis markers.
 */
export function toFrictionCopyText(letter: string, contact?: SignOffContact): string {
  const body = letterBody(letter).replace(/\*\*([^*]+)\*\*/g, '$1')
  const signOff = buildFreeCopySignOff(contact)
  if (!body) return signOff
  return `${body}\n\n${signOff}`
}

function escapeCopyHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Left-aligned HTML clipboard for Word. Paragraph spacing stays; justification is not applied. */
export function toCopyHtml(plainText: string) {
  const paragraphs = plainText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="text-align:left;margin:0 0 12pt 0;line-height:1.15;font-family:Calibri,Arial,sans-serif;">${escapeCopyHtml(paragraph).replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
  return `<!DOCTYPE html><html><body>${paragraphs}</body></html>`
}
