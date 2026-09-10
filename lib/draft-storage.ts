import { parseMatchResult, type JobMatchResult } from '@/lib/match-schema'
import type { SignOffContact } from '@/lib/sign-off'

export const DRAFT_STORAGE_KEY = 'ezcl_draft_v1'
export const CONTACT_STORAGE_KEY = 'ezcl_contact_v1'

export type LetterDraft = {
  resume: string
  job: string
  tone: string
  highlight: boolean
  letter: string
  matchResult: JobMatchResult | null
  matchSnapshot: { resume: string; job: string } | null
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadDraft(): LetterDraft | null {
  if (!canUseStorage()) return null

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LetterDraft>
    const matchResult = parseMatchResult(parsed.matchResult)
    const snapshot =
      parsed.matchSnapshot &&
      typeof parsed.matchSnapshot.resume === 'string' &&
      typeof parsed.matchSnapshot.job === 'string'
        ? parsed.matchSnapshot
        : null

    return {
      resume: typeof parsed.resume === 'string' ? parsed.resume : '',
      job: typeof parsed.job === 'string' ? parsed.job : '',
      tone: typeof parsed.tone === 'string' ? parsed.tone : 'natural',
      highlight: parsed.highlight !== false,
      letter: typeof parsed.letter === 'string' ? parsed.letter : '',
      matchResult,
      matchSnapshot: snapshot,
    }
  } catch {
    return null
  }
}

export function saveDraft(draft: LetterDraft) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Quota or private mode — ignore; checkout must still proceed.
  }
}

export function loadContact(): SignOffContact {
  if (!canUseStorage()) return {}

  try {
    const raw = window.localStorage.getItem(CONTACT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SignOffContact
    return {
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      linkedin: typeof parsed.linkedin === 'string' ? parsed.linkedin : '',
    }
  } catch {
    return {}
  }
}

export function saveContact(contact: SignOffContact) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(contact))
  } catch {
    // ignore
  }
}
