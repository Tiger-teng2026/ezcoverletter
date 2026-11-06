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

test('the system prompt forbids unsupported time spans and a second call to action', () => {
  const source = readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8')
  const systemPrompt = source.slice(source.indexOf('const SYSTEM_PROMPT'), source.indexOf('const MATCH_PROMPT_ADDENDUM'))
  assert.match(systemPrompt, /Do not infer how long a responsibility lasted/)
  assert.match(systemPrompt, /all or most of those years/)
  assert.match(systemPrompt, /much of that time/)
  assert.match(systemPrompt, /for most of those years/)
  assert.match(systemPrompt, /eight years of experience in B2B analytics and leadership of a team of six analysts/)
  assert.match(systemPrompt, /exactly one call to action/)
  assert.match(systemPrompt, /Do not invite an interview, phone call, or further conversation a second time/)
  const prompt = buildSystemPrompt('natural', false, null)
  assert.match(prompt, /Never turn "six analysts" into "six years" or "six of those years."/)
  assert.match(prompt, /45% traffic increase/)
  assert.match(prompt, /I have eight years of experience in B2B analytics and have led a team of six analysts/)
  assert.match(prompt, /Never write "much of that time" or "for most of those years"/)
})

test('cover letter generation still uses one streaming DeepSeek call', () => {
  const source = readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8')
  assert.match(source, /model: 'deepseek-chat'/)
  assert.match(source, /stream: true/)
  assert.equal(source.includes('temperature'), false)
  assert.equal(source.includes('max_tokens'), false)
  assert.equal(source.split('api.deepseek.com').length - 1, 1)
})
