import type { SignOffContact } from '@/lib/sign-off'

const SKIP_LINE =
  /^(resume|curriculum vitae|cv|contact|contacts|summary|profile|objective|experience|education|skills|projects|certificates?|references|work history|professional experience)\b/i

const JOB_TITLE_HINT =
  /\b(designer|engineer|manager|developer|analyst|director|consultant|specialist|architect|scientist|intern|officer|executive|founder|president|coordinator|associate|recruiter|marketer|accountant|lawyer|attorney|nurse|teacher|professor|researcher|product|software|marketing|sales|senior|junior|principal|staff)\b/i

/** Words that describe skills or duties, not a person's name. */
const SKILL_OR_DUTY =
  /\b(communication|analytical|analysis|skills?|experience|management|projects?|strong|excellent|proven|abilities|ability|teamwork|leadership|creative|passionate|results|driven|strategic|campaigns?|proficient|knowledge|responsible|managed|developed|led|across|including|with)\b/i

/** Common resume / LinkedIn role crumbs that must never become part of a person's name. */
const ROLE_SUFFIX =
  /^(pm|pmp|mba|phd|ph\.?d|jr|jnr|sr|snr|ii|iii|iv|md|cpa|cfa|eng|hr|ux|ui|qa|sre|devops|cto|ceo|cfo|coo|vp|svp|evp|intern|contractor)$/i

function looksLikePhone(line: string) {
  const digits = line.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15 && /[\d(+]/.test(line)
}

function looksLikeUrl(line: string) {
  return /https?:\/\/|www\.|linkedin\.com|github\.com/i.test(line)
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 2 && part === part.toUpperCase()) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Insert spaces for CamelCase: MichaelChen → Michael Chen */
function splitCamelCase(value: string): string {
  return value
    .replace(/([a-z\u00C0-\u024F])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

/** Drop trailing role tokens: "Michael Chen Pm" / "Jane Doe PM" → clean name. */
function stripRoleSuffixes(value: string): string {
  const words = value.split(/\s+/).filter(Boolean)
  while (words.length > 1 && ROLE_SUFFIX.test(words[words.length - 1] || '')) {
    words.pop()
  }
  return words.join(' ').trim()
}

function nameFromLinkedIn(url: string | undefined) {
  if (!url) return undefined
  const slug = url.match(/linkedin\.com\/in\/([A-Za-z0-9_-]+)/i)?.[1]
  if (!slug || slug.length < 3) return undefined

  // Split slug, but drop trailing role crumbs like "-pm", "-ux"
  const parts = slug
    .split(/[-_]+/)
    .filter(Boolean)
    .filter((part, index, arr) => !(index === arr.length - 1 && ROLE_SUFFIX.test(part)))

  if (parts.length === 0) return undefined

  if (parts.length === 1) {
    return normalizeNameCandidate(splitCamelCase(parts[0]!))
  }

  // michael-chen → Michael Chen (space between given name & family name)
  return normalizeNameCandidate(parts.join(' '))
}

function nameFromEmail(email: string | undefined) {
  if (!email) return undefined
  const local = email.split('@')[0] || ''
  const parts = local
    .replace(/\d+/g, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .filter((part, index, arr) => !(index === arr.length - 1 && ROLE_SUFFIX.test(part)))

  if (parts.length === 0) return undefined
  if (parts.join('').length > 40) return undefined

  if (parts.length === 1) {
    return normalizeNameCandidate(splitCamelCase(parts[0]!))
  }

  return normalizeNameCandidate(parts.join(' '))
}

function normalizeNameCandidate(raw: string): string | undefined {
  let candidate = raw.trim()
  if (!candidate) return undefined

  // "Name: Jane Doe" / "Full Name Jane Doe"
  candidate = candidate.replace(/^(?:full\s*)?name\s*[:：\-–—]\s*/i, '').trim()

  // Take left side of common separators on a header line
  candidate = candidate.split(/[|•·]| {2,}| — | – | - /)[0]?.trim() || candidate

  // "Doe, Jane" → "Jane Doe"
  if (/^[\p{L}']+,\s*[\p{L}' ]+$/u.test(candidate)) {
    const [last, first] = candidate.split(',').map((p) => p.trim())
    if (first && last) candidate = `${first} ${last}`
  }

  // CamelCase glued names on a header line
  if (!/\s/.test(candidate)) {
    candidate = splitCamelCase(candidate)
  }

  // Drop trailing role crumbs: "Jane Doe, Senior Designer" / "Michaelchen PM"
  candidate = candidate.replace(/,\s+[A-Za-z].*$/, '').trim()
  candidate = stripRoleSuffixes(candidate)

  // ALL CAPS / all lowercase → Title Case (keeps spaces)
  if (candidate === candidate.toUpperCase() && /[A-Z]/.test(candidate)) {
    candidate = titleCaseWords(candidate)
  } else if (candidate === candidate.toLowerCase() && /^[a-z]+(?:[\s'][a-z]+)*$/.test(candidate)) {
    candidate = titleCaseWords(candidate)
  }

  candidate = stripRoleSuffixes(candidate)

  // Normalize any accidental multi-spaces — never remove the First/Last space
  candidate = candidate.replace(/\s+/g, ' ').trim()

  const words = candidate.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 5) return undefined
  if (candidate.length < 2 || candidate.length > 60) return undefined
  if (SKIP_LINE.test(candidate)) return undefined
  if (looksLikePhone(candidate) || looksLikeUrl(candidate) || /@/.test(candidate)) return undefined
  if (/\d{3,}/.test(candidate)) return undefined

  // Allow Latin + CJK + common name punctuation
  if (!/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(candidate)) return undefined

  const hasCjk = /[\u4e00-\u9fff]/.test(candidate)
  if (hasCjk && candidate.replace(/\s+/g, '').length < 2) return undefined

  // Latin: prefer First Last; allow single token only as weak fallback
  if (!hasCjk) {
    if (words.length === 1) {
      if (words[0]!.length < 5) return undefined
      if (ROLE_SUFFIX.test(words[0]!)) return undefined
    }
  }

  // Skip job-title lines like "Product Designer" / "Senior Engineer"
  if (!hasCjk && JOB_TITLE_HINT.test(candidate)) return undefined

  return candidate
}

function isProseLine(line: string) {
  const words = line.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 6) return true
  if (/[.!?]$/.test(line.trim()) && words.length >= 4) return true
  if (/,/.test(line) && words.length >= 3) return true
  if (SKILL_OR_DUTY.test(line) && words.length >= 3) return true
  return false
}

function reliablePersonName(value: string | undefined) {
  if (!value) return undefined
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 4) return undefined
  if (SKILL_OR_DUTY.test(value) || JOB_TITLE_HINT.test(value)) return undefined
  return value
}

/**
 * A typed sign-off wins over a later autofill. An empty field can still be filled.
 */
export function preferEnteredValue(current: string, extracted?: string) {
  if (current.trim()) return current
  return extracted?.trim() || ''
}

function extractFullName(text: string, email?: string, linkedin?: string): string | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)

  for (const line of lines) {
    if (isProseLine(line)) break
    if (SKIP_LINE.test(line)) continue
    if (looksLikePhone(line) || looksLikeUrl(line) || /@/.test(line)) continue

    const fromLabeled = line.match(/^(?:full\s*)?name\s*[:：\-–—]\s*(.+)$/i)
    const named = reliablePersonName(normalizeNameCandidate(fromLabeled?.[1] || line))
    if (named) return named
  }

  return reliablePersonName(nameFromLinkedIn(linkedin)) || reliablePersonName(nameFromEmail(email))
}

/** Best-effort contact extraction from pasted resume text (for form autofill only). */
export function extractContactFromResume(resume: string): SignOffContact {
  const text = resume.replace(/\r\n/g, '\n').trim()
  if (!text) return {}

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const phoneMatch = text.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}/,
  )
  const linkedinMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i,
  )

  let linkedin = linkedinMatch?.[0]
  if (linkedin && !/^https?:\/\//i.test(linkedin)) {
    linkedin = `https://${linkedin}`
  }

  const email = emailMatch?.[0]
  const phone = phoneMatch?.[0]?.trim()
  const fullName = extractFullName(text, email, linkedin)

  return {
    fullName,
    email,
    phone,
    linkedin,
  }
}
