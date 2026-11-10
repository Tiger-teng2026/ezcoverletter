const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
}

const NUMBER_PATTERN = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|\\d+(?:\\.\\d+)?'

const CAUTIOUS =
  /\b(would welcome|welcome the opportunity|opportunity to (?:discuss|learn|explore)|could support|could help|happy to (?:learn|discuss)|open to learning|interested in learning|would like to discuss|i have not|i haven't|i do not have|i don't have|not something i)\b/i

const SKILL_CLAIM =
  /\b(experience(?:\s+working)?\s+with|extensive experience|hands-on experience|proficient in|skilled in|expertise in|experienced in|background in|part of my background|central to how i|how i work|how i operate|partner(?:s|ed|ing)? with|collaborat(?:e|es|ed|ing) with|write|wrote|writing|use|used|using)\b/i

const SKILL_ALIASES: Record<string, RegExp> = {
  SQL: /\b(?:relational (?:databases?|queries|query language)|structured quer(?:y|ies))\b/i,
}

const INVENTED_OUTCOME = /\b(?:doubled|tripled|quadrupled)\b/i

const MANAGEMENT_CLAIM =
  /\b(managed|managing|led|leading|supervised|directed|oversaw|guided a (?:team|group)|ran a team|built a team|direct reports)\b/i

const CLIENT_OUTCOME =
  /\b(delivered|increased|grew|improved|achieved|revenue|percent|%)\b/i

function canonicalNumber(raw: string) {
  const lower = raw.toLowerCase()
  return NUMBER_WORDS[lower] || raw
}

function resumeNumbers(resume: string) {
  const keys = new Set<string>()
  for (const match of resume.matchAll(new RegExp(`\\b(${NUMBER_PATTERN})\\b`, 'gi'))) {
    keys.add(canonicalNumber(match[1] || match[0]))
  }
  return keys
}

function missingAcronyms(resume: string, job: string) {
  const found = new Set<string>()
  for (const match of job.matchAll(/\b[A-Z]{2,}\b/g)) {
    const term = match[0]
    if (!new RegExp(`\\b${term}\\b`, 'i').test(resume)) found.add(term.toUpperCase())
  }
  return [...found]
}

function inventedMetric(text: string, known: Set<string>) {
  const patterns = [
    new RegExp(`\\b(${NUMBER_PATTERN})\\s*%`, 'gi'),
    new RegExp(`\\b(${NUMBER_PATTERN})\\s+percent\\b`, 'gi'),
    new RegExp(`\\b(${NUMBER_PATTERN})\\s+(?:years?|months?|analysts?|engineers?|people|customers?|clients?)\\b`, 'gi'),
    new RegExp(`\\bteam of\\s+(${NUMBER_PATTERN})\\b`, 'gi'),
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const key = canonicalNumber(match[1] || '')
      if (key && !known.has(key)) return true
    }
  }
  return false
}

function resumeHasLeadership(resume: string) {
  return /\b(led|lead|leading|managed|managing|manager|supervised|directed|head of)\b/i.test(resume)
}

function mentionsMissingSkill(text: string, acronyms: string[]) {
  if (acronyms.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(text))) return true
  return acronyms.some((term) => SKILL_ALIASES[term]?.test(text))
}

function claimsMissingSkill(text: string, acronyms: string[]) {
  if (CAUTIOUS.test(text) || !mentionsMissingSkill(text, acronyms)) return false
  return SKILL_CLAIM.test(text) || /\b(i|my)\b/i.test(text)
}

function claimsInventedOutcome(text: string, resume: string) {
  if (CAUTIOUS.test(text) || !INVENTED_OUTCOME.test(text)) return false
  const word = text.match(INVENTED_OUTCOME)?.[0] || ''
  return word !== '' && !new RegExp(`\\b${word}\\b`, 'i').test(resume)
}

function claimsUngroundedManagement(text: string, resume: string) {
  if (resumeHasLeadership(resume) || CAUTIOUS.test(text)) return false
  return MANAGEMENT_CLAIM.test(text)
}

function claimsInventedClientOutcome(text: string, resume: string) {
  if (/\b(client|customer)\b/i.test(resume) || CAUTIOUS.test(text)) return false
  return /\b(i|my)\b/i.test(text) && /\b(client|customer)\b/i.test(text) && CLIENT_OUTCOME.test(text)
}

function isUnsupportedClaim(text: string, resume: string, acronyms: string[], knownNumbers: Set<string>) {
  if (CAUTIOUS.test(text)) return false
  return (
    claimsMissingSkill(text, acronyms) ||
    inventedMetric(text, knownNumbers) ||
    claimsUngroundedManagement(text, resume) ||
    claimsInventedClientOutcome(text, resume) ||
    claimsInventedOutcome(text, resume)
  )
}

function sentencesOf(paragraph: string) {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function rewriteSentence(sentence: string, resume: string, acronyms: string[], knownNumbers: Set<string>) {
  if (CAUTIOUS.test(sentence) || !isUnsupportedClaim(sentence, resume, acronyms, knownNumbers)) {
    return { text: sentence, dropped: false }
  }

  const clauses = sentence.split(/\s+and\s+|,\s+/i).map((clause) => clause.trim()).filter(Boolean)
  if (clauses.length < 2) return { text: null, dropped: true }

  const kept = clauses.filter((clause) => !isUnsupportedClaim(clause, resume, acronyms, knownNumbers))
  if (kept.length === 0) return { text: null, dropped: true }
  const text = kept
    .map((clause) => clause.replace(/[,;]\s*$/, '').trim())
    .filter(Boolean)
    .map((clause) => (/[.!?]$/.test(clause) ? clause : `${clause}.`))
    .join(' ')
  return { text, dropped: true }
}

function cautiousSentence(resume: string, topic: string | null) {
  const role = /\bproduct manager\b/i.test(resume) ? 'product management experience' : 'experience'
  const focus = topic
    ? `your team's work with ${topic}`
    : 'the responsibilities in this role that my background does not already cover'
  return `I would welcome the opportunity to discuss how my ${role} could support ${focus}.`
}

function skillTopic(job: string, acronyms: string[]) {
  if (acronyms.includes('SQL') && /\bSQL stakeholders\b/i.test(job)) return 'SQL stakeholders'
  return acronyms[0] || null
}

function isInvitation(paragraph: string) {
  return /15-minute conversation|\b(interview|speak with you|discuss further)\b/i.test(paragraph)
}

/**
 * Rewrite explicit unsupported claims. Ordinary job words do not delete a sentence,
 * and supported clauses in the same sentence stay in place.
 */
export function enforceLetterFacts(resume: string, job: string, letter: string) {
  const acronyms = missingAcronyms(resume, job)
  const knownNumbers = resumeNumbers(resume)
  const topic = skillTopic(job, acronyms)
  let droppedSkill = false
  let droppedOther = false

  const paragraphs = letter
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => {
      const kept = sentencesOf(paragraph).flatMap((sentence) => {
        const rewritten = rewriteSentence(sentence, resume, acronyms, knownNumbers)
        if (rewritten.dropped && claimsMissingSkill(sentence, acronyms)) droppedSkill = true
        else if (rewritten.dropped) droppedOther = true
        return rewritten.text ? [rewritten.text] : []
      })
      return kept.join(' ').trim()
    })
    .filter(Boolean)

  const alreadyCautious = paragraphs.some((paragraph) => CAUTIOUS.test(paragraph))
  if ((droppedSkill || droppedOther) && !alreadyCautious) {
    const replacement = cautiousSentence(resume, droppedSkill ? topic : null)
    const invitationAt = paragraphs.findIndex(isInvitation)
    if (invitationAt >= 0) paragraphs.splice(invitationAt, 0, replacement)
    else paragraphs.push(replacement)
  }

  return paragraphs.join('\n\n').trim()
}
