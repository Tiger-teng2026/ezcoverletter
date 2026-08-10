/**
 * Single source of truth for cover-letter sign-off blocks.
 * Used by API cleanup and by PDF/Word/copy assembly so only ONE footer remains.
 */

export type SignOffContact = {
  fullName?: string
  phone?: string
  email?: string
  linkedin?: string
}

export const CANONICAL_SIGN_OFF_PLACEHOLDERS = {
  fullName: '[User Full Name]',
  phone: '[Phone]',
  email: '[Email]',
  linkedin: '[LinkedIn]',
} as const

/** Full-line closings only (includes bare "Best," which models often emit). */
function isClosingLine(line: string): boolean {
  return /^(Best regards|Best wishes|All the best|Kind regards|Warm regards|Yours truly|Yours sincerely|Sincerely yours|Sincerely|Respectfully yours|Respectfully|Thanks(?: so much)?|Thank you(?: so much)?|Cheers|Best),?\.?$/i.test(
    line.trim(),
  )
}

function isSignatureOrPlaceholderLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (isClosingLine(t)) return true
  if (/^\[[^\]]+\]/.test(t)) return true
  if (
    /\[(?:User Full Name|User Phone Number|User Email|User LinkedIn URL|Phone|Email|LinkedIn)\]/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\|/.test(t) && t.length < 140) return true
  if (/linkedin\.com/i.test(t) && t.length < 140) return true
  if (/@/.test(t) && t.length < 120 && !/[.!?]$/.test(t)) return true
  // Short name-only line without sentence punctuation
  if (/^[\w .'-]{2,60}$/.test(t) && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 5) {
    return true
  }
  return false
}

function trimTrailingEmpty(lines: string[]) {
  while (lines.length > 0 && !(lines[lines.length - 1] ?? '').trim()) {
    lines.pop()
  }
}

/**
 * Remove every trailing AI/default sign-off (closing + following signature/contact lines).
 * Handles duplicates like:
 *   Best,
 *   Michael Chen
 *   Best regards,
 *   Michael Chen
 *   phone | email | linkedin
 */
export function stripTrailingSignOff(text: string): string {
  let lines = text.replace(/\r\n/g, '\n').trimEnd().split('\n')
  trimTrailingEmpty(lines)

  // Peel one or more trailing sign-off blocks (from a closing line through EOF).
  for (let pass = 0; pass < 8; pass++) {
    let lastClosing = -1
    for (let i = 0; i < lines.length; i++) {
      if (isClosingLine(lines[i] ?? '')) lastClosing = i
    }
    if (lastClosing < 0) break

    const after = lines.slice(lastClosing + 1)
    const afterIsSignOff = after.every((l) => isSignatureOrPlaceholderLine(l))
    if (!afterIsSignOff) {
      // Closing appears mid-body with real prose after it — stop peeling.
      break
    }

    lines = lines.slice(0, lastClosing)
    trimTrailingEmpty(lines)
  }

  // Orphan trailing name / contact lines with no closing left.
  while (lines.length > 0 && isSignatureOrPlaceholderLine(lines[lines.length - 1] ?? '')) {
    const last = (lines[lines.length - 1] ?? '').trim()
    if (last.length > 80 || /[.!?]$/.test(last)) break
    // Don't strip a normal body sentence; require it to look like footer material.
    if (
      !isClosingLine(last) &&
      !/\|/.test(last) &&
      !/linkedin\.com/i.test(last) &&
      !/@/.test(last) &&
      !/^\[[^\]]+\]/.test(last)
    ) {
      // Ambiguous short name line — only strip when the line above is also footer-like
      // or we just removed a closing in a prior pass (remaining lone name after Best,).
      const prev = (lines[lines.length - 2] ?? '').trim()
      if (prev && !isSignatureOrPlaceholderLine(prev) && !isClosingLine(prev)) break
    }
    lines.pop()
    trimTrailingEmpty(lines)
  }

  return lines.join('\n').trimEnd()
}

function normalizePhone(phone: string) {
  return phone
    .replace(/\u00a0/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLinkedIn(url: string) {
  let value = url.replace(/\u00a0/g, ' ').replace(/\s+/g, '').trim()
  if (value && !/^https?:\/\//i.test(value)) {
    value = `https://${value}`
  }
  return value
}

/** Placeholder footer for free preview / clipboard friction — never auto-fills real data. */
export function buildCanonicalSignOff(contact?: SignOffContact): string {
  const fullName = contact?.fullName?.trim() || CANONICAL_SIGN_OFF_PLACEHOLDERS.fullName
  const phone = contact?.phone?.trim() || CANONICAL_SIGN_OFF_PLACEHOLDERS.phone
  const email = contact?.email?.trim() || CANONICAL_SIGN_OFF_PLACEHOLDERS.email
  const linkedin = contact?.linkedin?.trim() || CANONICAL_SIGN_OFF_PLACEHOLDERS.linkedin

  return `Best regards,\n${fullName}\n${phone} | ${email} | ${linkedin}`
}

/** Strip any AI sign-off, then append exactly one system sign-off. */
export function withCanonicalSignOff(text: string, contact?: SignOffContact): string {
  const body = stripTrailingSignOff(stripTrailingSignOff(text))
  if (!body) return buildCanonicalSignOff(contact)
  return `${body}\n\n${buildCanonicalSignOff(contact)}`
}

export type RequiredExportContact = {
  fullName: string
  phone: string
  email: string
  linkedin: string
}

/** Validate contact fields for paid PDF/Word export — no placeholders allowed. */
export function resolveExportContact(contact?: SignOffContact): RequiredExportContact | null {
  let fullName = contact?.fullName?.trim() || ''
  fullName = fullName.replace(/\s+(pm|pmp|mba|phd|jr|sr|ii|iii)$/i, '').trim()
  fullName = fullName.replace(/\s+/g, ' ')

  const phone = normalizePhone(contact?.phone || '')
  const email = (contact?.email || '').replace(/\s+/g, '').trim()
  const linkedin = normalizeLinkedIn(contact?.linkedin || '')

  if (!fullName || !phone || !email || !linkedin) return null
  if (/[\[\]]/.test(`${fullName}${phone}${email}${linkedin}`)) return null
  if (/user full name|\[phone\]|\[email\]|\[linkedin\]/i.test(`${fullName} ${phone} ${email} ${linkedin}`)) {
    return null
  }

  return { fullName, phone, email, linkedin }
}

/** Paid export footer — real contact only, never bracket placeholders. */
export function buildExportSignOff(contact: RequiredExportContact): string {
  return `Best regards,\n${contact.fullName}\n${contact.phone} | ${contact.email} | ${contact.linkedin}`
}

/** Strip AI sign-off and append one real-contact footer for PDF/Word. */
export function withExportSignOff(text: string, contact: RequiredExportContact): string {
  const body = stripTrailingSignOff(stripTrailingSignOff(text))
  const footer = buildExportSignOff(contact)
  if (!body) return footer
  return `${body}\n\n${footer}`
}
