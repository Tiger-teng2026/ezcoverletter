import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildSystemPrompt, buildUserContent } from '../app/api/generate/route.ts'

const ANALYST_RESUME = 'Eight years shipping B2B analytics and leading six analysts.'
const TRAFFIC_RESUME = 'Improved organic website traffic by 45% through SEO optimization.'
const JOB = 'Product manager. Own the B2B analytics roadmap and partner with the data team on weekly releases.'

test('the cover letter prompt keeps headcount and years as separate facts', () => {
  const prompt = buildSystemPrompt('natural', false, null)
  assert.match(prompt, /resume is the only source of facts/i)
  assert.match(prompt, /Do not change what a number means/)
  assert.match(prompt, /Never turn "six analysts" into "six years" or "six of those years."/)
  assert.match(prompt, /Never turn years of experience into a number of people/)
  assert.match(prompt, /leadership of a team of six analysts/)
  assert.match(prompt, /It is not six years of leadership/)
  const user = buildUserContent(ANALYST_RESUME, JOB, null)
  assert.match(user, /leading six analysts/)
  assert.equal(user.includes('six of those years'), false)
})

test('the cover letter prompt keeps a percentage on its original metric', () => {
  const prompt = buildSystemPrompt('professional', true, null)
  assert.match(prompt, /percentage is not an amount of money/)
  assert.match(prompt, /45% traffic increase/)
  const user = buildUserContent(TRAFFIC_RESUME, JOB, null)
  assert.match(user, /Improved organic website traffic by 45%/)
})

test('the cover letter prompt forbids experience the resume does not provide', () => {
  const prompt = buildSystemPrompt('concise', false, {
    matchScore: 70,
    matchedSkills: ['Analytics'],
    missingSkills: ['SQL'],
    experienceMatch: 'The resume shows B2B analytics work.',
    suggestions: ['Mention the analyst team.'],
  })
  assert.match(prompt, /Do not invent employers, degrees, jobs, projects, or outcomes/)
  assert.match(prompt, /Never invent employers, degrees, metrics, or dates/)
  assert.match(prompt, /Do not reinterpret a number in the match notes/)
  assert.match(prompt, /You may improve the English\. You may not change the facts\./)
})

test('cover letter generation still uses one streaming DeepSeek call', () => {
  const source = readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8')
  assert.match(source, /model: 'deepseek-chat'/)
  assert.match(source, /stream: true/)
  assert.equal(source.includes('temperature'), false)
  assert.equal(source.includes('max_tokens'), false)
  assert.equal(source.split('api.deepseek.com').length - 1, 1)
})
