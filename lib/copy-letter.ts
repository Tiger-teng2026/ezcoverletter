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

/**
 * Clipboard text matching the letter the page shows, without emphasis markers.
 */
export function toFrictionCopyText(letter: string, contact?: SignOffContact): string {
  const visible = letter
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
  const body = stripTrailingSignOff(visible)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const signOff = buildFreeCopySignOff(contact)
  if (!body) return signOff
  return `${body}\n\n${signOff}`
}
