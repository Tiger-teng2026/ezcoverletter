import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { toFrictionCopyText } from '../lib/copy-letter.ts'
import { prepareLetterForExport } from '../lib/export-letter.ts'
import { parseMatchResult } from '../lib/match-schema.ts'

test('free copy is plain text and omits unfilled sign-off placeholders', () => {
  const letter = [
    'Dear Hiring Manager,',
    '',
    "I'm a digital marketing specialist with a **proven** record in well-known campaigns.",
    '',
    'On the analytical side, I improved results by 20% — and kept the 15-minute ask.',
    '',
    '- Led a cross-channel rollout.',
    '',
    'Best regards,',
    '[User Full Name]',
    '[Phone] | [Email] | [LinkedIn]',
  ].join('\n')

  const text = toFrictionCopyText(letter)
  assert.match(text, /Dear Hiring Manager,/)
  assert.match(text, /I'm a digital marketing specialist with a proven record in well-known campaigns\./)
  assert.match(text, /On the analytical side, I improved results by 20% — and kept the 15-minute ask\./)
  assert.match(text, /- Led a cross-channel rollout\./)
  assert.match(text, /Best regards,/)
  assert.equal(text.includes('**'), false)
  assert.equal(text.includes('* #'), false)
  assert.equal(text.includes('# *'), false)
  assert.equal(text.includes('-- #'), false)
  assert.equal(text.includes('##'), false)
  assert.equal(text.includes('[Phone]'), false)
  assert.equal(text.includes('[Email]'), false)
  assert.equal(text.includes('[LinkedIn]'), false)
  assert.equal(text.includes('[User Full Name]'), false)
  assert.match(text, /\n\nI'm a digital marketing specialist/)
  assert.match(text, /\n\nOn the analytical side/)
})

test('free copy includes only the sign-off fields the user filled in', () => {
  const text = toFrictionCopyText('I led the migration.', {
    fullName: 'John Smith',
    phone: '',
    email: 'john@example.com',
    linkedin: '[LinkedIn]',
  })
  assert.equal(
    text,
    'I led the migration.\n\nBest regards,\nJohn Smith\njohn@example.com',
  )
})

test('job match parsing still accepts a valid score payload', () => {
  const parsed = parseMatchResult({
    matchScore: 82,
    matchedSkills: ['TypeScript'],
    missingSkills: ['Kubernetes'],
    experienceMatch: 'Strong overlap on backend delivery.',
    suggestions: ['Mention the migration.'],
  })
  assert.equal(parsed?.matchScore, 82)
  assert.deepEqual(parsed?.matchedSkills, ['TypeScript'])
  assert.deepEqual(parsed?.missingSkills, ['Kubernetes'])
})

test('paid sign-off preparation still rejects placeholders and accepts real contact', () => {
  assert.throws(() =>
    prepareLetterForExport('Hello there.', {
      fullName: '[User Full Name]',
      phone: '+1 555 0100',
      email: 'jane@example.com',
      linkedin: 'https://linkedin.com/in/janedoe',
    }),
  )

  const prepared = prepareLetterForExport('Hello there.', {
    fullName: 'Jane Doe',
    phone: '+1 555 0100',
    email: 'jane@example.com',
    linkedin: 'https://linkedin.com/in/janedoe',
  })
  assert.match(prepared, /Hello there\./)
  assert.match(prepared, /Jane Doe/)
  assert.match(prepared, /jane@example.com/)
  assert.doesNotMatch(prepared, /\[User Full Name\]/)
})

test('free generate and match routes do not consult Pro entitlement', () => {
  for (const relativePath of ['../app/api/generate/route.ts', '../app/api/match/route.ts']) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.equal(source.includes('entitlement'), false)
    assert.equal(source.includes('localStorage'), false)
    assert.equal(source.includes('CREEM_'), false)
    assert.equal(source.includes('unlocked'), false)
  }
})
