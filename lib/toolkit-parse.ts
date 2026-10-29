import { ATS_DISCLAIMER } from '@/lib/toolkit'
import { boundedText, tooShort } from '@/lib/request-guard'

const MAX_RESUME = 12_000
const MAX_JOB = 12_000
const MAX_SHORT = 4_000
const MAX_ITEMS = 8

function strings(value: unknown, maxItems: number, maxChars: number) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const items: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const text = entry.replace(/\s+/g, ' ').trim().slice(0, maxChars)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(text)
    if (items.length >= maxItems) break
  }
  return items
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function keywordStatus(value: unknown): 'covered' | 'partial' | 'missing' | null {
  if (value === 'covered' || value === 'partial' || value === 'missing') return value
  return null
}

function questionCategory(value: unknown): 'behavioral' | 'role' | null {
  if (value === 'behavioral' || value === 'role') return value
  return null
}

export function validateResumeOptimizerInput(body: Record<string, unknown>) {
  const resume = boundedText(body.resume, MAX_RESUME)
  const job = boundedText(body.job, MAX_JOB)
  const resumeError = tooShort(resume, 40, 'Resume')
  const jobError = tooShort(job, 40, 'Job description')
  if (resumeError || jobError) return { ok: false as const, error: resumeError || jobError || 'Invalid input.' }
  return { ok: true as const, resume, job }
}

export type ResumeOptimization = {
  issues: string[]
  experienceRewrites: { before: string; after: string; why: string }[]
  achievementEdits: { before: string; after: string }[]
  optimizedResume: string
}

export function parseResumeOptimization(raw: unknown): ResumeOptimization | null {
  const data = record(raw)
  if (!data) return null
  const issues = strings(data.issues, MAX_ITEMS, 280)
  const optimizedResume = boundedText(data.optimizedResume, 14_000).trim()
  const experienceRewrites = Array.isArray(data.experienceRewrites)
    ? data.experienceRewrites.flatMap((entry) => {
        const item = record(entry)
        if (!item) return []
        const before = boundedText(item.before, 500).trim()
        const after = boundedText(item.after, 500).trim()
        const why = boundedText(item.why, 280).trim()
        if (!before || !after || !why) return []
        return [{ before, after, why }]
      }).slice(0, MAX_ITEMS)
    : []
  const achievementEdits = Array.isArray(data.achievementEdits)
    ? data.achievementEdits.flatMap((entry) => {
        const item = record(entry)
        if (!item) return []
        const before = boundedText(item.before, 400).trim()
        const after = boundedText(item.after, 400).trim()
        if (!before || !after) return []
        return [{ before, after }]
      }).slice(0, MAX_ITEMS)
    : []
  if (issues.length === 0 || optimizedResume.length < 80) return null
  if (experienceRewrites.length === 0 && achievementEdits.length === 0) return null
  return { issues, experienceRewrites, achievementEdits, optimizedResume }
}

export function validateAtsInput(body: Record<string, unknown>) {
  return validateResumeOptimizerInput(body)
}

export type AtsReport = {
  overview: string
  keywordCoverage: { keyword: string; status: 'covered' | 'partial' | 'missing' }[]
  missingKeywords: string[]
  structureIssues: string[]
  readabilityIssues: string[]
  suggestions: string[]
  disclaimer: string
}

export function parseAtsReport(raw: unknown): AtsReport | null {
  const data = record(raw)
  if (!data) return null
  const overview = boundedText(data.overview, 1200).trim()
  const keywordCoverage = Array.isArray(data.keywordCoverage)
    ? data.keywordCoverage.flatMap((entry) => {
        const item = record(entry)
        if (!item) return []
        const keyword = boundedText(item.keyword, 80).trim()
        const status = keywordStatus(item.status)
        if (!keyword || !status) return []
        return [{ keyword, status }]
      }).slice(0, 20)
    : []
  const missingKeywords = strings(data.missingKeywords, 16, 80)
  const structureIssues = strings(data.structureIssues, MAX_ITEMS, 280)
  const readabilityIssues = strings(data.readabilityIssues, MAX_ITEMS, 280)
  const suggestions = strings(data.suggestions, MAX_ITEMS, 280)
  if (!overview || keywordCoverage.length === 0 || suggestions.length === 0) return null
  return {
    overview,
    keywordCoverage,
    missingKeywords,
    structureIssues,
    readabilityIssues,
    suggestions,
    disclaimer: ATS_DISCLAIMER,
  }
}

export const INTERVIEW_MODES = ['start', 'feedback', 'reply'] as const
export type InterviewMode = (typeof INTERVIEW_MODES)[number]

export type InterviewTurn = { role: 'coach' | 'candidate'; content: string }

export function validateInterviewInput(body: Record<string, unknown>) {
  const mode = body.mode
  if (mode !== 'start' && mode !== 'feedback' && mode !== 'reply') {
    return { ok: false as const, error: 'Choose a valid interview action.' }
  }
  const job = boundedText(body.job, MAX_JOB)
  const resume = boundedText(body.resume, MAX_RESUME)
  const question = boundedText(body.question, 1000)
  const answer = boundedText(body.answer, MAX_SHORT)
  const history = Array.isArray(body.history)
    ? body.history.flatMap((entry) => {
        const item = record(entry)
        if (!item) return []
        const role = item.role === 'coach' || item.role === 'candidate' ? item.role : null
        const content = boundedText(item.content, 2000).trim()
        if (!role || !content) return []
        return [{ role, content }]
      }).slice(-12)
    : []

  if (mode === 'start') {
    const jobError = tooShort(job, 40, 'Job description')
    if (jobError) return { ok: false as const, error: jobError }
  }
  if (mode === 'feedback') {
    if (question.trim().length < 10 || answer.trim().length < 20) {
      return { ok: false as const, error: 'Add the question and an answer of at least 20 characters.' }
    }
  }
  if (mode === 'reply') {
    const jobError = tooShort(job, 40, 'Job description')
    if (jobError) return { ok: false as const, error: jobError }
    if (answer.trim().length < 10) return { ok: false as const, error: 'Add your latest answer.' }
  }

  return { ok: true as const, mode, job, resume, question, answer, history }
}

export type InterviewQuestion = {
  prompt: string
  category: 'behavioral' | 'role'
  structure: string
  sampleAnswer: string
}

export function parseInterviewStart(raw: unknown): { questions: InterviewQuestion[] } | null {
  const data = record(raw)
  if (!data || !Array.isArray(data.questions)) return null
  const questions = data.questions.flatMap((entry) => {
    const item = record(entry)
    if (!item) return []
    const prompt = boundedText(item.prompt, 400).trim()
    const category = questionCategory(item.category)
    const structure = boundedText(item.structure, 400).trim()
    const sampleAnswer = boundedText(item.sampleAnswer, 1200).trim()
    if (!prompt || !category || !structure || !sampleAnswer) return []
    return [{ prompt, category, structure, sampleAnswer }]
  }).slice(0, 8)
  if (questions.length < 3) return null
  return { questions }
}

export function parseInterviewFeedback(raw: unknown) {
  const data = record(raw)
  if (!data) return null
  const feedback = boundedText(data.feedback, 1600).trim()
  const strengths = strings(data.strengths, 6, 240)
  const improvements = strings(data.improvements, 6, 240)
  const revisedOutline = boundedText(data.revisedOutline, 1200).trim()
  if (!feedback || strengths.length === 0 || improvements.length === 0 || !revisedOutline) return null
  return { feedback, strengths, improvements, revisedOutline }
}

export function parseInterviewReply(raw: unknown) {
  const data = record(raw)
  if (!data) return null
  const feedback = boundedText(data.feedback, 1200).trim()
  const nextQuestion = boundedText(data.nextQuestion, 400).trim()
  const structureHint = boundedText(data.structureHint, 400).trim()
  if (!feedback || !nextQuestion || !structureHint) return null
  return { feedback, nextQuestion, structureHint }
}

export function validateLinkedInInput(body: Record<string, unknown>) {
  const resume = boundedText(body.resume, MAX_RESUME)
  const targetRole = boundedText(body.targetRole, 200)
  const resumeError = tooShort(resume, 40, 'Resume or profile text')
  const roleError = tooShort(targetRole, 2, 'Target role')
  if (resumeError || roleError) return { ok: false as const, error: resumeError || roleError || 'Invalid input.' }
  return { ok: true as const, resume, targetRole, job: boundedText(body.job, MAX_JOB) }
}

export type LinkedInDraft = {
  headlines: string[]
  about: string
  experienceSuggestions: { role: string; bullets: string[] }[]
  skills: string[]
  positioning: string
}

export function parseLinkedInDraft(raw: unknown): LinkedInDraft | null {
  const data = record(raw)
  if (!data) return null
  const headlines = strings(data.headlines, 4, 220)
  const about = boundedText(data.about, 3000).trim()
  const skills = strings(data.skills, 16, 60)
  const positioning = boundedText(data.positioning, 800).trim()
  const experienceSuggestions = Array.isArray(data.experienceSuggestions)
    ? data.experienceSuggestions.flatMap((entry) => {
        const item = record(entry)
        if (!item) return []
        const role = boundedText(item.role, 120).trim()
        const bullets = strings(item.bullets, 5, 240)
        if (!role || bullets.length === 0) return []
        return [{ role, bullets }]
      }).slice(0, 6)
    : []
  if (headlines.length === 0 || about.length < 40 || skills.length === 0 || !positioning) return null
  return { headlines, about, experienceSuggestions, skills, positioning }
}

export const EMAIL_KINDS = ['recommendation', 'salary', 'thank-you', 'follow-up', 'offer-reply', 'decline'] as const
export type EmailKind = (typeof EMAIL_KINDS)[number]

const EMAIL_FIELDS: Record<EmailKind, { key: string; min: number }[]> = {
  recommendation: [
    { key: 'yourName', min: 2 },
    { key: 'candidateName', min: 2 },
    { key: 'relationship', min: 2 },
    { key: 'role', min: 2 },
    { key: 'highlights', min: 40 },
  ],
  salary: [
    { key: 'yourName', min: 2 },
    { key: 'role', min: 2 },
    { key: 'company', min: 2 },
    { key: 'ask', min: 10 },
  ],
  'thank-you': [
    { key: 'yourName', min: 2 },
    { key: 'role', min: 2 },
    { key: 'interviewer', min: 2 },
    { key: 'notes', min: 20 },
  ],
  'follow-up': [
    { key: 'yourName', min: 2 },
    { key: 'role', min: 2 },
    { key: 'company', min: 2 },
    { key: 'context', min: 20 },
  ],
  'offer-reply': [
    { key: 'yourName', min: 2 },
    { key: 'role', min: 2 },
    { key: 'company', min: 2 },
    { key: 'intent', min: 2 },
    { key: 'notes', min: 10 },
  ],
  decline: [
    { key: 'yourName', min: 2 },
    { key: 'role', min: 2 },
    { key: 'company', min: 2 },
    { key: 'reason', min: 20 },
  ],
}

export function validateCareerEmailInput(body: Record<string, unknown>) {
  const kind = body.kind
  if (typeof kind !== 'string' || !EMAIL_KINDS.includes(kind as EmailKind)) {
    return { ok: false as const, error: 'Choose an email type.' }
  }
  const emailKind = kind as EmailKind
  const source = record(body.fields) ?? {}
  const fields: Record<string, string> = {}
  for (const field of EMAIL_FIELDS[emailKind]) {
    const value = boundedText(source[field.key], 2000)
    const error = tooShort(value, field.min, field.key)
    if (error) return { ok: false as const, error: `Please complete ${field.key}.` }
    fields[field.key] = value.trim()
  }
  return { ok: true as const, kind: emailKind, fields }
}

export function parseCareerEmail(raw: unknown, kind: EmailKind) {
  const data = record(raw)
  if (!data) return null
  const subject = boundedText(data.subject, 180).trim()
  const body = boundedText(data.body, 6000).trim()
  if (!subject || body.length < 40) return null
  return { kind, subject, body }
}
