/**
 * Free-tier clipboard formatter — intentionally "raw" to add paste friction.
 * Uses shared sign-off cleanup, but does NOT use PDF/Word HTML layout helpers.
 *
 * Rules:
 * - Strip duplicate AI sign-offs; keep exactly one canonical placeholder footer
 * - No polished blank lines between paragraphs
 * - Never auto-fill real contact info in clipboard (placeholders only)
 * - Sprinkle superficial *, #, -- markers on every paragraph
 */

import { withCanonicalSignOff } from '@/lib/sign-off'

const FRICTION_WRAPPERS = [
  (text: string) => `* # -- ${text} -- # *`,
  (text: string) => `# * -- ${text} -- * #`,
  (text: string) => `-- # * ${text} * # --`,
  (text: string) => `## -- * ${text} * -- ##`,
  (text: string) => `* -- ## ${text} ## -- *`,
] as const

function decorateParagraph(text: string, index: number): string {
  return FRICTION_WRAPPERS[index % FRICTION_WRAPPERS.length](text)
}

/**
 * Build raw clipboard text for the free Copy button.
 */
export function toFrictionCopyText(letter: string): string {
  // One canonical placeholder sign-off only — never fill real user contact details here.
  const deduped = withCanonicalSignOff(
    letter.replace(/\*\*/g, '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n'),
  )

  const lines = deduped
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/g, ''))

  const compact = lines.filter((line) => line.length > 0)

  return compact.map((line, index) => decorateParagraph(line, index)).join('\n').trim()
}
