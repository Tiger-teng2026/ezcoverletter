import assert from 'node:assert/strict'
import test from 'node:test'
import { coverLetterPlainText, presentSavedResult, savedResultTitle } from '@/lib/history-display'

const ROLE = 'Senior Product Designer, Growth Platform, Activation, and Experimentation — Northwind'
const JOB = `${ROLE}\nSan Francisco, CA\n\nAbout the role:\nOwn activation experiments for the hub launch and partner with product and engineering.`
const RESUME = 'Alex Chen\nProduct designer with six years of SaaS experience and a shipped activation hub.'

test('a job match record renders the score and skills without raw JSON', () => {
  const view = presentSavedResult({
    tool: 'job-match',
    title: JOB.slice(0, 80),
    createdAt: '2026-11-01T04:00:00.000Z',
    input: { resume: RESUME, job: JOB },
    output: {
      matchScore: 92,
      matchedSkills: ['Product design', 'Activation'],
      missingSkills: ['SQL'],
      experienceMatch: 'The resume shows shipped activation work that fits this role.',
      suggestions: ['Add one SQL project.', 'Name the design system.'],
    },
  })

  assert.equal(view.kind, 'job-match')
  assert.equal(view.toolLabel, 'Job Match Score')
  assert.equal(view.heading, ROLE)
  assert.ok(view.heading.length > 80)
  assert.equal(view.dateLabel, 'November 1, 2026')
  assert.equal(view.match?.matchScore, 92)
  assert.deepEqual(view.match?.matchedSkills, ['Product design', 'Activation'])
  assert.deepEqual(view.match?.missingSkills, ['SQL'])
  assert.equal(view.match?.suggestions.length, 2)
  assert.equal(view.job, JOB)
  assert.equal(view.blocks.length, 0)
  assert.equal(view.letter, null)
})

test('a cover letter record keeps the letter, tone, and signature placeholders', () => {
  const letter = [
    'Dear Hiring Manager,',
    '',
    'I led the **Activation Hub** launch.',
    '',
    'Best regards,',
    '[User Full Name]',
    '[Phone] | [Email] | [LinkedIn]',
  ].join('\n')
  const view = presentSavedResult({
    tool: 'cover-letter',
    title: JOB.slice(0, 80),
    createdAt: '2026-11-01T04:00:00.000Z',
    input: { resume: RESUME, job: JOB, tone: 'natural' },
    output: letter,
  })

  assert.equal(view.kind, 'cover-letter')
  assert.equal(view.toolLabel, 'Cover Letter')
  assert.equal(view.heading, ROLE)
  assert.equal(view.tone, 'Natural Human')
  assert.equal(view.letter, letter)
  assert.match(view.copyText || '', /\[User Full Name\]/)
  assert.match(view.copyText || '', /Activation Hub/)
  assert.equal((view.copyText || '').includes('**'), false)
  assert.equal(JSON.stringify({ letter: view.letter, tone: view.tone }).includes('"resume"'), false)
})

test('cover letter copy text removes emphasis and keeps the original sign-off', () => {
  const plain = coverLetterPlainText('I led the **Activation Hub**.\n\nBest regards,\n[User Full Name]')
  assert.equal(plain, 'I led the Activation Hub.\n\nBest regards,\n[User Full Name]')
})

test('saved result titles use the role name, otherwise the full first sentence', () => {
  const designer = 'We are looking for a Product Designer to join our growing SaaS team.'
  const engineer = 'Hiring a Senior Software Engineer to lead the platform team.'
  assert.equal(savedResultTitle({ tool: 'cover-letter', job: designer }), 'Product Designer')
  assert.equal(savedResultTitle({ tool: 'job-match', title: designer.slice(0, 80) }), 'Product Designer')
  assert.equal(savedResultTitle({ tool: 'job-match', job: engineer }), 'Senior Software Engineer')
  assert.equal(savedResultTitle({ tool: 'cover-letter', title: engineer.slice(0, 80) }), 'Senior Software Engineer')

  const ordinary = 'Our team helps small businesses send invoices. You will write the help center and reply to customers.'
  assert.equal(savedResultTitle({ tool: 'cover-letter', job: ordinary }), 'Our team helps small businesses send invoices.')

  const longSentence = 'Our team helps small businesses send invoices and we need a clear writer who can explain billing, taxes, and payment reminders to owners who have never used accounting software before, while also keeping the product simple enough for a first-time user on a phone.'
  const longJob = `${longSentence} The next paragraph covers the interview process.`
  const longTitle = savedResultTitle({ tool: 'job-match', job: longJob })
  assert.equal(longTitle, longSentence)
  assert.ok(longTitle.length > 80)
  assert.notEqual(longTitle, longJob.slice(0, 80))

  assert.equal(savedResultTitle({ tool: 'cover-letter', title: '', job: '' }), 'Cover Letter')
  assert.equal(savedResultTitle({ tool: 'job-match', title: '   ' }), 'Job Match Score')

  const letter = presentSavedResult({
    tool: 'cover-letter',
    title: designer.slice(0, 80),
    input: { resume: RESUME, job: designer, tone: 'natural' },
    output: 'Dear Hiring Manager,\n\nI led the launch.\n\n[User Full Name]',
  })
  const match = presentSavedResult({
    tool: 'job-match',
    title: designer.slice(0, 80),
    input: { resume: RESUME, job: designer },
    output: {
      matchScore: 92,
      matchedSkills: ['Product design'],
      missingSkills: [],
      experienceMatch: 'The resume shows product design work for this role.',
      suggestions: ['Add one shipped metric.'],
    },
  })
  assert.equal(letter.heading, 'Product Designer')
  assert.equal(match.heading, letter.heading)
  assert.match(letter.copyText || '', /\[User Full Name\]/)
})

test('unknown and malformed records stay readable', () => {
  const unknown = presentSavedResult({
    tool: 'future-tool',
    title: 'start',
    createdAt: 'not-a-date',
    input: { note: 'Keep this' },
    output: { experienceRewrites: [{ before: 'Old bullet', after: 'Clearer bullet' }] },
  })
  assert.equal(unknown.kind, 'document')
  assert.equal(unknown.toolLabel, 'Future Tool')
  assert.equal(unknown.heading, 'Future Tool')
  assert.equal(unknown.dateLabel, 'Date unavailable')
  assert.equal(unknown.blocks.some((block) => block.type === 'label' && block.text === 'Experience rewrites'), true)
  assert.equal(unknown.blocks.some((block) => block.type === 'paragraph' && block.text === 'Clearer bullet'), true)
  assert.equal(JSON.stringify(unknown.blocks).includes('experienceRewrites'), false)

  const brokenMatch = presentSavedResult({
    tool: 'job-match',
    title: JOB.slice(0, 80),
    input: { job: JOB },
    output: { matchScore: 'high' },
  })
  assert.equal(brokenMatch.kind, 'document')
  assert.equal(brokenMatch.heading, ROLE)
  assert.equal(brokenMatch.match, null)

  const empty = presentSavedResult({ tool: '', input: null, output: null })
  assert.equal(empty.kind, 'document')
  assert.equal(empty.toolLabel, 'Saved result')
  assert.match(empty.blocks[0] && empty.blocks[0].type === 'paragraph' ? empty.blocks[0].text : '', /readable text/)
})
