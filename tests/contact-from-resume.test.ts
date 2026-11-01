import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractContactFromResume, preferEnteredValue } from '../lib/contact-from-resume.ts'

const JOHN_RESUME = [
  'John Smith',
  '',
  'Marketing Specialist with 4 years of experience in digital marketing, SEO, content strategy, and social media management.',
  '',
  'Managed digital marketing campaigns across multiple channels.',
  '',
  'Strong communication, analytical, and project management skills.',
].join('\n')

test('a name at the top of the resume is used, not a later skill line', () => {
  const contact = extractContactFromResume(JOHN_RESUME)
  assert.equal(contact.fullName, 'John Smith')
  assert.equal(contact.fullName === 'Strong communication', false)
})

test('phone, email, and LinkedIn still extract beside a header name', () => {
  const contact = extractContactFromResume(
    [
      'John Smith',
      'john.smith@example.com',
      '+1 (415) 555-0199',
      'https://linkedin.com/in/john-smith',
      '',
      'Strong communication, analytical, and project management skills.',
    ].join('\n'),
  )
  assert.equal(contact.fullName, 'John Smith')
  assert.equal(contact.email, 'john.smith@example.com')
  assert.equal(contact.phone, '+1 (415) 555-0199')
  assert.equal(contact.linkedin, 'https://linkedin.com/in/john-smith')
})

test('a resume with no reliable name leaves the full name blank', () => {
  const contact = extractContactFromResume(
    [
      'Marketing Specialist with 4 years of experience in digital marketing.',
      '',
      'Strong communication, analytical, and project management skills.',
    ].join('\n'),
  )
  assert.equal(contact.fullName, undefined)
})

test('a name the user already typed is kept', () => {
  assert.equal(preferEnteredValue('Alex Chen', 'Strong communication'), 'Alex Chen')
  assert.equal(preferEnteredValue('', 'John Smith'), 'John Smith')
  assert.equal(preferEnteredValue('   ', undefined), '')
})
