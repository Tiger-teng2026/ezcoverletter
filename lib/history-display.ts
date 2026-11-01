import { parseMatchResult, type JobMatchResult } from '@/lib/match-schema'

const TOOL_LABELS: Record<string, string> = {
  'cover-letter': 'Cover Letter',
  'job-match': 'Job Match Score',
  'resume-optimizer': 'Resume Optimizer',
  'ats-check': 'ATS Resume Checker',
  interview: 'Interview Coach',
  linkedin: 'LinkedIn Profile',
  'career-email': 'Career Email',
}

const TONE_LABELS: Record<string, string> = {
  professional: 'Professional',
  concise: 'Concise & Short',
  natural: 'Natural Human',
}

const ROLE_PATTERNS = [
  /\b(?:we(?:\s+are|'re)|i(?:\s+am|'m))\s+looking\s+for\s+(?:an?\s+)?([A-Za-z][^.,;\n]{1,70}?)(?=\s+(?:to|who|that|with|for|at|in)\b|[,.]|$)/i,
  /\bhiring\s+(?:an?\s+)?([A-Za-z][^.,;\n]{1,70}?)(?=\s+(?:to|who|that|with|for|at|in)\b|[,.]|$)/i,
  /\b(?:seeking|searching\s+for)\s+(?:an?\s+)?([A-Za-z][^.,;\n]{1,70}?)(?=\s+(?:to|who|that|with|for|at|in)\b|[,.]|$)/i,
  /\b(?:job\s*title|position)\s*[:\-–—]\s*([A-Za-z][^.,;\n]{1,70}?)(?=\s+(?:to|who|that|with|for|at|in)\b|[,.]|$)/i,
]

export type SavedResultSource = {
  tool?: unknown
  title?: unknown
  input?: unknown
  output?: unknown
  createdAt?: unknown
}

export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'label'; text: string }

export type SavedResultView = {
  kind: 'cover-letter' | 'job-match' | 'document'
  toolLabel: string
  heading: string
  dateLabel: string
  tone: string | null
  letter: string | null
  copyText: string | null
  match: JobMatchResult | null
  blocks: ContentBlock[]
  resume: string | null
  job: string | null
}

export function toolLabel(tool: string) {
  const known = TOOL_LABELS[tool]
  if (known) return known
  const words = tool.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  if (!words) return 'Saved result'
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export function formatSavedDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

export function coverLetterPlainText(letter: string) {
  return letter.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\u00a0/g, ' ')
}

/** Display title for a saved result. Uses the job title when the description names one. */
export function savedResultTitle(input: { tool?: unknown; title?: unknown; job?: unknown }) {
  const tool = typeof input.tool === 'string' ? input.tool : ''
  const job = cleanText(input.job)
  const stored = cleanText(input.title)
  const source = job || (stored && !isRawToken(stored) ? stored : '')
  if (source) {
    const role = extractRole(source)
    if (role) return role
    const sentence = firstSentence(source)
    if (sentence) return sentence
  }
  return toolLabel(tool)
}

export function presentSavedResult(row: SavedResultSource): SavedResultView {
  try {
    return present(row)
  } catch {
    return documentView(row, [{ type: 'paragraph', text: 'This saved result could not be displayed.' }])
  }
}

function present(row: SavedResultSource): SavedResultView {
  const tool = typeof row.tool === 'string' ? row.tool : ''
  const record = asRecord(row.input)
  const resume = optionalText(record, 'resume')
  const job = optionalText(record, 'job')
  const heading = roleHeading(row, record, job)

  if (tool === 'job-match') {
    const match = readMatch(row.output)
    if (match) {
      return {
        kind: 'job-match',
        toolLabel: toolLabel(tool),
        heading,
        dateLabel: formatSavedDate(row.createdAt),
        tone: null,
        letter: null,
        copyText: null,
        match,
        blocks: [],
        resume,
        job,
      }
    }
  }

  if (tool === 'cover-letter') {
    const letter = readLetter(row.output)
    if (letter) {
      return {
        kind: 'cover-letter',
        toolLabel: toolLabel(tool),
        heading,
        dateLabel: formatSavedDate(row.createdAt),
        tone: toneLabel(record),
        letter,
        copyText: coverLetterPlainText(letter),
        match: null,
        blocks: [],
        resume,
        job,
      }
    }
  }

  const blocks = readableBlocks(row.output)
  const extras = inputExtras(record, row.input)
  const combined = blocks.length > 0 ? blocks : extras
  return documentView(
    row,
    combined.length > 0 ? combined : [{ type: 'paragraph', text: 'This saved result does not include readable text.' }],
    heading,
    resume,
    job,
  )
}

function documentView(
  row: SavedResultSource,
  blocks: ContentBlock[],
  heading = roleHeading(row, asRecord(row.input), optionalText(asRecord(row.input), 'job')),
  resume = optionalText(asRecord(row.input), 'resume'),
  job = optionalText(asRecord(row.input), 'job'),
): SavedResultView {
  const tool = typeof row.tool === 'string' ? row.tool : ''
  return {
    kind: 'document',
    toolLabel: toolLabel(tool),
    heading,
    dateLabel: formatSavedDate(row.createdAt),
    tone: null,
    letter: null,
    copyText: null,
    match: null,
    blocks,
    resume,
    job,
  }
}

function roleHeading(row: SavedResultSource, record: Record<string, unknown> | null, job: string | null) {
  const tool = typeof row.tool === 'string' ? row.tool : ''
  if (tool !== 'cover-letter' && tool !== 'job-match') {
    const explicit = ['targetRole', 'jobTitle', 'position', 'role']
      .map((key) => textField(record, key))
      .find((value) => value && value.length <= 80 && value !== job && !value.includes('\n'))
    if (explicit) return explicit
  }
  return savedResultTitle({ tool, title: row.title, job })
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractRole(text: string) {
  const opening = text.replace(/\s+/g, ' ').trim().slice(0, 600)
  for (const pattern of ROLE_PATTERNS) {
    const match = pattern.exec(opening)
    const role = cleanRole(match?.[1] ?? '')
    if (role) return role
  }
  return ''
}

function cleanRole(value: string) {
  const role = value.replace(/\s+/g, ' ').replace(/^(?:an?\s+)/i, '').replace(/[.,;:]+$/g, '').trim()
  const words = role.split(' ').filter(Boolean)
  if (words.length < 1 || words.length > 8) return ''
  if (role.length < 2 || role.length > 80) return ''
  if (/[.!?]/.test(role)) return ''
  return role
}

function firstSentence(text: string) {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return ''
  const firstLine = trimmed.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const lineSentence = firstLine.match(/^(.+?[.!?])(?:\s|$)/)
  if (lineSentence) return lineSentence[1].trim()
  if (firstLine.length < trimmed.length) return firstLine
  const sentence = trimmed.replace(/\s+/g, ' ').match(/^(.+?[.!?])(?:\s|$)/)
  return sentence ? sentence[1].trim() : firstLine
}

function isRawToken(value: string) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(value)
}

function toneLabel(record: Record<string, unknown> | null) {
  const tone = textField(record, 'tone')
  if (!tone) return null
  if (TONE_LABELS[tone]) return TONE_LABELS[tone]
  return tone.length <= 40 ? tone : null
}

function readLetter(output: unknown) {
  const text = unwrapString(output)
  if (!text || !text.trim()) return null
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (typeof parsed === 'string' && parsed.trim()) return parsed
      return null
    } catch {
      return text
    }
  }
  return text
}

function readMatch(output: unknown) {
  const direct = parseMatchResult(output)
  if (direct) return direct
  const text = unwrapString(output)
  if (!text) return null
  try {
    return parseMatchResult(JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

function unwrapString(value: unknown) {
  if (typeof value !== 'string') return null
  return value
}

function readableBlocks(value: unknown, depth = 0): ContentBlock[] {
  if (depth > 4) return []
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text || text === 'null') return []
    return [{ type: 'paragraph', text: value.trim() }]
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [{ type: 'paragraph', text: String(value) }]
  }
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    if (items.length > 0 && items.length === value.filter((item) => item != null && item !== '').length) {
      return [{ type: 'list', items }]
    }
    return value.flatMap((item) => readableBlocks(item, depth + 1))
  }
  const record = asRecord(value)
  if (!record) return []
  const blocks: ContentBlock[] = []
  for (const [key, child] of Object.entries(record)) {
    const nested = readableBlocks(child, depth + 1)
    if (nested.length === 0) continue
    blocks.push({ type: 'label', text: humanizeKey(key) }, ...nested)
  }
  return blocks
}

function inputExtras(record: Record<string, unknown> | null, input: unknown) {
  if (!record) return readableBlocks(input)
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'resume' || key === 'job' || key === 'tone') continue
    rest[key] = value
  }
  return readableBlocks(rest)
}

function humanizeKey(key: string) {
  const words = key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  if (!words) return 'Detail'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function textField(record: Record<string, unknown> | null, key: string) {
  if (!record) return ''
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(record: Record<string, unknown> | null, key: string) {
  const value = textField(record, key)
  return value || null
}
