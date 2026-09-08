export type JobMatchResult = {
  matchScore: number
  matchedSkills: string[]
  missingSkills: string[]
  experienceMatch: string
  suggestions: string[]
}

const MAX_SKILLS = 16
const MAX_SUGGESTIONS = 8
const MAX_EXPERIENCE_CHARS = 1200

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown, max: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const items: string[] = []

  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const text = entry.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(text.slice(0, maxChars))
    if (items.length >= max) break
  }

  return items
}

function clampScore(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

/** Pull a JSON object from model output that may include fences or leading prose. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Empty model response')
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('No JSON object in model response')
  }

  return JSON.parse(candidate.slice(start, end + 1)) as unknown
}

export function parseMatchResult(raw: unknown): JobMatchResult | null {
  if (!raw || typeof raw !== 'object') return null

  const data = raw as Record<string, unknown>
  const matchScore = clampScore(data.matchScore)
  const experienceMatch = asTrimmedString(data.experienceMatch).slice(0, MAX_EXPERIENCE_CHARS)
  const suggestions = asStringArray(data.suggestions, MAX_SUGGESTIONS, 280)

  if (matchScore === null || !experienceMatch || suggestions.length === 0) {
    return null
  }

  return {
    matchScore,
    matchedSkills: asStringArray(data.matchedSkills, MAX_SKILLS, 80),
    missingSkills: asStringArray(data.missingSkills, MAX_SKILLS, 80),
    experienceMatch,
    suggestions: asStringArray(data.suggestions, MAX_SUGGESTIONS, 280),
  }
}

/** Compact JSON block for the cover-letter prompt. */
export function formatMatchAnalysisForPrompt(result: JobMatchResult): string {
  return JSON.stringify(
    {
      matchScore: result.matchScore,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      experienceMatch: result.experienceMatch,
      suggestions: result.suggestions,
    },
    null,
    2,
  )
}
