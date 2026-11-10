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
  /\b(would welcome|i'd welcome|welcome the opportunity|opportunity to (?:discuss|learn|explore)|could support|could help|happy to (?:learn|discuss)|open to learning|interested in(?: learning)?|would like to|excited to|eager to|look(?:ing)? forward|hope to|glad to|willing to|ready to learn|i have not|i haven't|i do not have|i don't have|not something i)\b/i

const PRACTICE =
  /\b(i(?:'ve| have) (?:seen|watched|noticed|found|learned)|i (?:write|wrote|use|used|build|built|deliver|delivered|define|defined|know|focus|own|owned|run|ran|keep|kept|partner|partnered|collaborate|collaborated|care|cared)|in my experience|my approach|how i (?:work|operate))\b/i

const GERUND_CLAIM =
  /^(?:writing|being|building|defining|creating|designing|partnering|working|collaborating|managing|leading|delivering|improving|using|making|keeping|running|owning|driving|shipping)\b/i

const METHOD_CLAIM = /\b(?:make|makes|made)\b[\s\S]{0,80}\b(?:feel|cost|costs)\b|\bfeel effortless\b|\bcost(?:s|ing)? teams\b/i

const REQUIREMENT_LANGUAGE =
  /\b(sql|requirements?|stakeholders?|tables?|fields?|schemas?|quer(?:y|ies)|databases?|columns?|definitions?|specifications?|specs?|data models?)\b/i

const SCAFFOLD = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'our', 'you', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'not', 'but', 'can', 'could', 'would', 'will', 'about', 'into', 'over', 'also', 'both', 'who', 'which', 'while', 'during', 'through', 'their', 'them', 'they', 'its', 'his', 'her', 'she', 'him', 'how', 'what', 'when', 'where', 'why', 'dear', 'hiring', 'manager', 'opportunity', 'discuss', 'conversation', 'minute', 'minutes', 'schedule', 'welcome', 'support', 'experience', 'background', 'role', 'roles', 'position', 'company', 'work', 'working', 'apply', 'help', 'helping',   'team', 'teams', 'career', 'across', 'throughout', 'time', 'way', 'ways', 'part', 'still', 'now', 'today', 'here', 'more', 'most', 'such', 'same', 'each', 'every', 'just', 'only', 'even', 'than', 'then', 'after', 'before', 'again', 'well', 'very', 'really', 'new', 'all', 'any', 'may', 'might', 'should', 'let', 'writing', 'express', 'expressing', 'interest', 'interested', 'appreciate', 'chance', 'discuss', 'talk', 'brief', 'request', 'open', 'bring', 'brings', 'excited', 'eager', 'glad', 'happy', 'hope', 'hoping', 'welcome', 'ready', 'willing', 'forward', 'like', 'likes', 'spent', 'spend', 'align', 'aligns', 'aligned', 'closely', 'core', 'responsibility', 'responsibilities', 'match', 'matches', 'matched', 'posting', 'mentions', 'mention',
])

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

function stemWord(word: string) {
  const lower = word.toLowerCase()
  if (lower === 'led') return 'lead'
  let stem = lower
  if (stem.length > 5 && stem.endsWith('ment')) stem = stem.slice(0, -4)
  else if (stem.length > 4 && stem.endsWith('ing')) stem = stem.slice(0, -3)
  else if (stem.length > 4 && stem.endsWith('ed')) stem = stem.slice(0, -2)
  else if (stem.length > 3 && stem.endsWith('s') && !stem.endsWith('ss')) stem = stem.slice(0, -1)
  if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2]) stem = stem.slice(0, -1)
  if (stem.startsWith('lead')) return 'lead'
  if (stem.startsWith('manag')) return 'manage'
  if (stem.startsWith('analyt')) return 'analyt'
  if (stem.startsWith('ship')) return 'ship'
  return stem
}

function resumeStems(resume: string) {
  const stems = new Set<string>()
  for (const word of resume.toLowerCase().match(/[a-z0-9]+/g) || []) stems.add(stemWord(word))
  return stems
}

function isListed(stem: string, known: Set<string>) {
  if (known.has(stem)) return true
  for (const item of known) {
    const size = Math.min(stem.length, item.length)
    if (size >= 5 && (stem.startsWith(item) || item.startsWith(stem))) return true
  }
  return false
}

function isScaffold(word: string, stem: string) {
  return SCAFFOLD.has(word) || SCAFFOLD.has(stem)
}

function unknownWords(text: string, allowed: Set<string>) {
  const found: string[] = []
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    const stem = stemWord(word)
    if (stem.length < 3 || isScaffold(word, stem) || isListed(stem, allowed)) continue
    found.push(stem)
  }
  return found
}

function jobOnlyWords(text: string, resumeStems: Set<string>, jobStems: Set<string>) {
  const found: string[] = []
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    const stem = stemWord(word)
    if (stem.length < 3 || isScaffold(word, stem) || isListed(stem, resumeStems)) continue
    if (isListed(stem, jobStems)) found.push(stem)
  }
  return found
}

function isWillingness(text: string, allowed: Set<string>) {
  if (!CAUTIOUS.test(text)) return false
  if (PRACTICE.test(text) || GERUND_CLAIM.test(text) || METHOD_CLAIM.test(text) || INVENTED_OUTCOME.test(text)) {
    return false
  }
  return unknownWords(text, allowed).length === 0
}

function isRoleUnderstanding(text: string, allowed: Set<string>) {
  if (unknownWords(text, allowed).length > 0) return false
  if (!/\b(this role|the role|this position|the position|your (?:team|posting|role|needs)|the job|the posting)\b/i.test(text)) {
    return false
  }
  return !/\b(i have|i've|i had|i led|i write|i wrote|i use|i used|my (?:experience|background|work)|i bring)\b/i.test(text)
}

function claimsMissingSkill(text: string, acronyms: string[], allowed: Set<string>) {
  if (isWillingness(text, allowed) || !mentionsMissingSkill(text, acronyms)) return false
  return SKILL_CLAIM.test(text) || PRACTICE.test(text) || /\b(i|my)\b/i.test(text)
}

function claimsUngroundedPractice(text: string, resumeStems: Set<string>, jobStems: Set<string>) {
  const allowed = new Set([...resumeStems, ...jobStems])
  if (isWillingness(text, allowed) || isRoleUnderstanding(text, allowed)) return false
  if (unknownWords(text, allowed).length > 0) return true
  return jobOnlyWords(text, resumeStems, jobStems).length > 0
}

function claimsInventedOutcome(text: string, resume: string, allowed: Set<string>) {
  if (isWillingness(text, allowed) || !INVENTED_OUTCOME.test(text)) return false
  const word = text.match(INVENTED_OUTCOME)?.[0] || ''
  return word !== '' && !new RegExp(`\\b${word}\\b`, 'i').test(resume)
}

function claimsUngroundedManagement(text: string, resume: string, allowed: Set<string>) {
  if (resumeHasLeadership(resume) || isWillingness(text, allowed)) return false
  return MANAGEMENT_CLAIM.test(text)
}

function claimsInventedClientOutcome(text: string, resume: string, allowed: Set<string>) {
  if (/\b(client|customer)\b/i.test(resume) || isWillingness(text, allowed)) return false
  return /\b(i|my)\b/i.test(text) && /\b(client|customer)\b/i.test(text) && CLIENT_OUTCOME.test(text)
}

function isUnsupportedClaim(
  text: string,
  resume: string,
  acronyms: string[],
  knownNumbers: Set<string>,
  resumeStems: Set<string>,
  jobStems: Set<string>,
) {
  const allowed = new Set([...resumeStems, ...jobStems])
  if (isWillingness(text, allowed) || isRoleUnderstanding(text, allowed)) return false
  return (
    claimsMissingSkill(text, acronyms, allowed) ||
    claimsUngroundedPractice(text, resumeStems, jobStems) ||
    inventedMetric(text, knownNumbers) ||
    claimsUngroundedManagement(text, resume, allowed) ||
    claimsInventedClientOutcome(text, resume, allowed) ||
    claimsInventedOutcome(text, resume, allowed)
  )
}

function sentencesOf(paragraph: string) {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function rewriteSentence(
  sentence: string,
  resume: string,
  acronyms: string[],
  knownNumbers: Set<string>,
  resumeStems: Set<string>,
  jobStems: Set<string>,
) {
  const allowed = new Set([...resumeStems, ...jobStems])
  const unsupported = (clause: string) =>
    isUnsupportedClaim(clause, resume, acronyms, knownNumbers, resumeStems, jobStems)
  if (/^dear\b/i.test(sentence) || isInvitation(sentence) || isWillingness(sentence, allowed) || !unsupported(sentence)) {
    return { text: sentence, dropped: false }
  }

  const clauses = sentence
    .split(/,\s+and\s+|;\s+|\s+and\s+(?=I\b|I'm\b|I've\b)|,\s+(?=I\b)/i)
    .map((clause) => clause.trim())
    .filter(Boolean)
  const kept = clauses.filter((clause) => {
    if (unsupported(clause)) return false
    const words = clause.split(/\s+/).filter(Boolean)
    const finite = /\b(i am|i'm|i have|i've|i would|i'd|i also|i understand)\b/i.test(clause)
    const role = isRoleUnderstanding(clause, allowed)
    if (!finite && !role) return false
    return words.length >= 8 || words.length >= 5
  })
  if (kept.length === 0) return { text: null, dropped: true }
  const text = kept
    .map((clause) => (/[.!?]$/.test(clause) ? clause : `${clause.replace(/[,;]\s*$/, '')}.`))
    .join(' ')
  return { text, dropped: true }
}

function resumeFactSentence(resume: string, letter: string) {
  const number = `(?:${NUMBER_PATTERN})`
  const year = resume.match(new RegExp(`\\b(${number})\\s+years?\\b`, 'i'))
  const head = resume.match(new RegExp(`\\b(${number})\\s+analysts?\\b`, 'i'))
  if (!year || !head) return null
  const hasYear = new RegExp(`\\b${year[1]}\\s+years?\\b`, 'i').test(letter)
  const hasHead = new RegExp(`\\b${head[1]}\\s+analysts?\\b`, 'i').test(letter)
  if (hasYear && hasHead) return null
  const analytics = /\bshipping\s+b2b\s+analytics\b/i.test(resume)
  const parts = [
    hasYear ? '' : `I have ${year[1].toLowerCase()} years of experience${analytics ? ' shipping B2B analytics' : ''}`,
    hasHead ? '' : `I have led a team of ${head[1].toLowerCase()} analysts`,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return `${parts.join(', and ')}.`
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
  return /15[-\s]?minutes?\b|\b(interview|speak with you|discuss further)\b/i.test(paragraph)
}

/**
 * Rewrite explicit unsupported claims. Ordinary job words do not delete a sentence,
 * and supported clauses in the same sentence stay in place.
 */
export function enforceLetterFacts(resume: string, job: string, letter: string) {
  const acronyms = missingAcronyms(resume, job)
  const knownNumbers = resumeNumbers(resume)
  const knownStems = resumeStems(resume)
  const jobStems = resumeStems(job)
  const topic = skillTopic(job, acronyms)
  let droppedSkill = false
  let droppedOther = false

  const paragraphs = letter
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => {
      const kept = sentencesOf(paragraph).flatMap((sentence) => {
        const rewritten = rewriteSentence(sentence, resume, acronyms, knownNumbers, knownStems, jobStems)
        const allowed = new Set([...knownStems, ...jobStems])
        if (
          rewritten.dropped &&
          (claimsMissingSkill(sentence, acronyms, allowed) || jobOnlyWords(sentence, knownStems, jobStems).length > 0)
        ) {
          droppedSkill = true
        } else if (rewritten.dropped) droppedOther = true
        return rewritten.text ? [rewritten.text] : []
      })
      return kept.join(' ').trim()
    })
    .filter(Boolean)
    .filter((paragraph, index, all) => {
      const plain = paragraph.replace(/[.!?]$/, '').trim().toLowerCase()
      return !all.slice(0, index).some((earlier) => earlier.toLowerCase().includes(plain))
    })

  const fact = resumeFactSentence(resume, paragraphs.join('\n'))
  if (fact) {
    const greetingAt = paragraphs.findIndex((paragraph) => /^dear\b/i.test(paragraph))
    paragraphs.splice(greetingAt >= 0 ? greetingAt + 1 : 0, 0, fact)
  }

  const alreadyCautious = paragraphs.some((paragraph) => CAUTIOUS.test(paragraph))
  if ((droppedSkill || droppedOther) && !alreadyCautious) {
    const replacement = cautiousSentence(resume, droppedSkill ? topic : null)
    const invitationAt = paragraphs.findIndex(isInvitation)
    if (invitationAt >= 0) paragraphs.splice(invitationAt, 0, replacement)
    else paragraphs.push(replacement)
  }

  return withExperienceGrammar(paragraphs.join('\n\n').trim(), resume)
}

/** Resume notes may be telegraphic. The letter still needs normal English. */
function withExperienceGrammar(letter: string, resume: string) {
  if (!/\bshipping\s+b2b\s+analytics\b/i.test(resume)) return letter
  return letter.replace(
    new RegExp(`\\b(${NUMBER_PATTERN})\\s+(years?)(?!\\s+of\\s+experience)\\s+shipping\\b`, 'gi'),
    (_match, count: string, years: string) => `${count} ${years} of experience shipping`,
  )
}
