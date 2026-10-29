import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, test } from 'node:test'
import { POST as atsPost } from '../app/api/ats-check/route.ts'
import { POST as emailPost } from '../app/api/career-email/route.ts'
import { POST as interviewPost } from '../app/api/interview/route.ts'
import { POST as linkedinPost } from '../app/api/linkedin/route.ts'
import { POST as resumePost } from '../app/api/resume-optimizer/route.ts'
import { MemoryLedger } from '../lib/billing/ledger.ts'
import { useTestLedger } from '../lib/billing/runtime.ts'
import { rateLimit, resetRateLimit } from '../lib/request-guard.ts'
import { ATS_DISCLAIMER } from '../lib/toolkit.ts'
import {
  parseAtsReport,
  parseCareerEmail,
  parseInterviewFeedback,
  parseInterviewReply,
  parseInterviewStart,
  parseLinkedInDraft,
  parseResumeOptimization,
} from '../lib/toolkit-parse.ts'

const RESUME =
  'Alex Chen, product manager. Eight years shipping B2B analytics. Led a team of six analysts and cut onboarding time by documenting the workflow. '
const JOB =
  'Product manager role. Ship analytics, lead a small team, write clear requirements, and work with SQL stakeholders every week. '

let previousKey: string | undefined
let previousSecret: string | undefined
let previousFetch: typeof fetch
let calls = 0

beforeEach(() => {
  previousKey = process.env.DEEPSEEK_API_KEY
  previousSecret = process.env.ENTITLEMENT_SECRET
  previousFetch = globalThis.fetch
  calls = 0
  resetRateLimit()
  delete process.env.DEEPSEEK_API_KEY
  process.env.ENTITLEMENT_SECRET = previousSecret || 'test-entitlement-secret-not-a-real-key'
  process.env.EZCL_BILLING_TEST = '1'
  useTestLedger(new MemoryLedger())
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('tests must not call DeepSeek')
  }
})

afterEach(() => {
  if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = previousKey
  if (previousSecret === undefined) delete process.env.ENTITLEMENT_SECRET
  else process.env.ENTITLEMENT_SECRET = previousSecret
  delete process.env.EZCL_BILLING_TEST
  useTestLedger(null)
  globalThis.fetch = previousFetch
  resetRateLimit()
})

function post(path: string, body: unknown, ip = '203.0.113.10') {
  return new Request(`https://www.ezcoverletter.xyz${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  })
}

function mockModel(payload: unknown) {
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key-not-real'
  globalThis.fetch = async (input, init) => {
    calls += 1
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('authorization'), 'Bearer test-deepseek-key-not-real')
    assert.match(String(input), /api\.deepseek\.com/)
    return Response.json({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    })
  }
}

test('rate limit closes after the window is full', () => {
  assert.equal(rateLimit('toolkit-unit', 2, 60_000, 1_000), true)
  assert.equal(rateLimit('toolkit-unit', 2, 60_000, 1_100), true)
  assert.equal(rateLimit('toolkit-unit', 2, 60_000, 1_200), false)
  assert.equal(rateLimit('toolkit-unit', 2, 60_000, 70_000), true)
})

test('parsers accept structured output and reject incomplete output', () => {
  assert.equal(parseResumeOptimization({ issues: [] }), null)
  const resume = parseResumeOptimization({
    issues: ['Bullets bury the team lead work.'],
    experienceRewrites: [{ before: 'Led a team.', after: 'Led six analysts.', why: 'The count is already in the resume.' }],
    achievementEdits: [{ before: 'Cut onboarding time.', after: 'Documented the workflow and cut onboarding time.' }],
    optimizedResume: RESUME + JOB,
  })
  assert.equal(resume?.experienceRewrites.length, 1)

  const report = parseAtsReport({
    overview: 'The resume supports team leadership and is light on SQL.',
    keywordCoverage: [{ keyword: 'SQL', status: 'missing' }],
    missingKeywords: ['SQL'],
    structureIssues: ['Skills are buried.'],
    readabilityIssues: ['One bullet is too long.'],
    suggestions: ['Move SQL next to analytics.'],
    disclaimer: 'Guaranteed to pass every ATS.',
  })
  assert.equal(report?.disclaimer, ATS_DISCLAIMER)
  assert.equal(parseAtsReport({ overview: 'short' }), null)

  assert.equal(parseInterviewStart({ questions: [{ prompt: 'Q', category: 'other' }] }), null)
  assert.ok(parseInterviewStart({
    questions: [1, 2, 3].map((n) => ({
      prompt: `Question ${n}?`,
      category: n === 1 ? 'behavioral' : 'role',
      structure: 'Situation, action, result.',
      sampleAnswer: 'Example only.',
    })),
  }))
  assert.ok(parseInterviewFeedback({
    feedback: 'The answer names the team.',
    strengths: ['Specific team size'],
    improvements: ['Add the result'],
    revisedOutline: 'Team, action, result.',
  }))
  assert.ok(parseInterviewReply({
    feedback: 'Good start.',
    nextQuestion: 'How did you handle a stakeholder disagreement?',
    structureHint: 'Name the constraint, then the decision.',
  }))

  assert.ok(parseLinkedInDraft({
    headlines: ['Product manager | B2B analytics'],
    about: 'I lead analytics products and write the requirements the team ships.',
    experienceSuggestions: [{ role: 'Product manager', bullets: ['Led six analysts.'] }],
    skills: ['SQL'],
    positioning: 'Aim this profile at product roles that ship analytics.',
  }))
  assert.equal(parseCareerEmail({ subject: 'Thanks', body: 'x'.repeat(50) }, 'thank-you')?.subject, 'Thanks')
  assert.equal(parseCareerEmail({ subject: '', body: 'x'.repeat(50) }, 'thank-you'), null)
})

test('short input is rejected before any model call', async () => {
  const resume = await resumePost(post('/api/resume-optimizer', { resume: 'too short', job: JOB }))
  const ats = await atsPost(post('/api/ats-check', { resume: RESUME, job: 'short' }, '203.0.113.11'))
  const interview = await interviewPost(post('/api/interview', { mode: 'start', job: 'short' }, '203.0.113.12'))
  const linkedin = await linkedinPost(post('/api/linkedin', { resume: 'short', targetRole: 'PM' }, '203.0.113.13'))
  const email = await emailPost(post('/api/career-email', { kind: 'thank-you', fields: { yourName: 'A' } }, '203.0.113.14'))
  assert.equal(resume.status, 400)
  assert.equal(ats.status, 400)
  assert.equal(interview.status, 400)
  assert.equal(linkedin.status, 400)
  assert.equal(email.status, 400)
  assert.equal(calls, 0)
})

test('missing DeepSeek key fails closed and does not call the network', async () => {
  const response = await resumePost(post('/api/resume-optimizer', { resume: RESUME, job: JOB }, '203.0.113.20'))
  const body = await response.json()
  assert.equal(response.status, 500)
  assert.match(body.error, /DEEPSEEK_API_KEY/)
  assert.equal(calls, 0)
})

test('oversized bodies and repeated calls are limited', async () => {
  const oversized = await resumePost(
    new Request('https://www.ezcoverletter.xyz/api/resume-optimizer', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '70000', 'x-forwarded-for': '203.0.113.30' },
      body: '{}',
    }),
  )
  assert.equal(oversized.status, 413)

  let last = 0
  for (let i = 0; i < 9; i += 1) {
    const response = await emailPost(post('/api/career-email', { kind: 'nope' }, '203.0.113.31'))
    last = response.status
  }
  assert.equal(last, 429)
})

test('resume optimizer returns the model rewrite without a payment cookie', async () => {
  mockModel({
    issues: ['The team size is easy to miss.'],
    experienceRewrites: [{ before: 'Led a team of six.', after: 'Led six analysts.', why: 'Keeps the real team size.' }],
    achievementEdits: [{ before: 'Cut onboarding time.', after: 'Documented the workflow and cut onboarding time.' }],
    optimizedResume: `${RESUME}\n\nRewritten for the product manager role without new employers.`,
  })
  const response = await resumePost(post('/api/resume-optimizer', { resume: RESUME, job: JOB }, '203.0.113.40'))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.match(body.optimizedResume, /Rewritten for the product manager role/)
  assert.equal(calls, 1)
})

test('ATS review keeps the server disclaimer', async () => {
  mockModel({
    overview: 'Leadership is covered. SQL is not explicit.',
    keywordCoverage: [{ keyword: 'SQL', status: 'missing' }],
    missingKeywords: ['SQL'],
    structureIssues: ['Requirements are not grouped.'],
    readabilityIssues: ['The summary is one long line.'],
    suggestions: ['Add SQL only if you have used it.'],
    disclaimer: 'This guarantees an ATS pass.',
  })
  const response = await atsPost(post('/api/ats-check', { resume: RESUME, job: JOB }, '203.0.113.41'))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.disclaimer, ATS_DISCLAIMER)
  assert.equal(body.keywordCoverage[0].status, 'missing')
})

test('interview, LinkedIn, and career email return structured drafts', async () => {
  mockModel({
    questions: [1, 2, 3].map((n) => ({
      prompt: `How did you handle situation ${n}?`,
      category: n === 3 ? 'role' : 'behavioral',
      structure: 'Situation, action, result.',
      sampleAnswer: 'Use only facts from the resume.',
    })),
  })
  const started = await interviewPost(post('/api/interview', { mode: 'start', job: JOB, resume: RESUME }, '203.0.113.50'))
  const questions = await started.json()
  assert.equal(started.status, 200)
  assert.equal(questions.questions.length, 3)

  mockModel({
    feedback: 'You named the team.',
    strengths: ['Specific'],
    improvements: ['Add the result'],
    revisedOutline: 'Team, action, result.',
  })
  const reviewed = await interviewPost(
    post('/api/interview', {
      mode: 'feedback',
      job: JOB,
      question: questions.questions[0].prompt,
      answer: 'I led six analysts and wrote the onboarding workflow.',
    }, '203.0.113.51'),
  )
  assert.equal(reviewed.status, 200)

  mockModel({
    feedback: 'That answer is concrete.',
    nextQuestion: 'Tell me about a stakeholder disagreement.',
    structureHint: 'Constraint, decision, result.',
  })
  const replied = await interviewPost(
    post('/api/interview', {
      mode: 'reply',
      job: JOB,
      answer: 'I wrote the workflow with the analysts.',
      history: [{ role: 'coach', content: 'How did you lead the team?' }],
    }, '203.0.113.52'),
  )
  const reply = await replied.json()
  assert.equal(replied.status, 200)
  assert.match(reply.nextQuestion, /stakeholder/)

  mockModel({
    headlines: ['Product manager | B2B analytics'],
    about: 'I lead analytics products and write the requirements the team ships.',
    experienceSuggestions: [{ role: 'Product manager', bullets: ['Led six analysts.'] }],
    skills: ['Requirements'],
    positioning: 'Point the profile at analytics product roles.',
  })
  const profile = await linkedinPost(
    post('/api/linkedin', { resume: RESUME, targetRole: 'Product manager', job: JOB }, '203.0.113.53'),
  )
  assert.equal(profile.status, 200)

  mockModel({
    subject: 'Thank you for the product manager conversation',
    body: 'Priya, thank you for walking through the analytics roadmap. I enjoyed the discussion and remain interested.',
  })
  const email = await emailPost(
    post('/api/career-email', {
      kind: 'thank-you',
      fields: {
        yourName: 'Alex Chen',
        role: 'Product manager',
        interviewer: 'Priya Shah',
        notes: 'We discussed the analytics roadmap and the onboarding workflow.',
      },
    }, '203.0.113.54'),
  )
  const draft = await email.json()
  assert.equal(email.status, 200)
  assert.equal(draft.kind, 'thank-you')
  assert.match(draft.body, /Priya/)
})

test('new tool routes do not consult payment entitlement', () => {
  for (const file of [
    'app/api/resume-optimizer/route.ts',
    'app/api/ats-check/route.ts',
    'app/api/interview/route.ts',
    'app/api/linkedin/route.ts',
    'app/api/career-email/route.ts',
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /entitlement|CREEM_|localStorage|unlocked/i)
  }
})
