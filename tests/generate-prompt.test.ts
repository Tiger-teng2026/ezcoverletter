import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildSystemPrompt, buildUserContent } from '../app/api/generate/route.ts'
import { enforceLetterFacts } from '../lib/letter-facts.ts'

const PM_RESUME = 'Product Manager. Eight years shipping B2B analytics. Led six analysts.'
const SQL_JOB = 'Write requirements alongside SQL stakeholders. Manage a team of 12 engineers and deliver a client case study with a 40% revenue increase.'
const TRUE_BODY =
  'Dear Hiring Manager,\n\nI am a product manager with eight years shipping B2B analytics, and I have led six analysts.'
const FORBIDDEN_SQL = 'Writing requirements alongside SQL stakeholders is central to how I work.'
const ALLOWED_SQL =
  'I would welcome the opportunity to discuss how my product management experience could support your team\'s work with SQL stakeholders.'

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
  assert.match(prompt, /I have eight years of experience shipping B2B analytics, and I have led a team of six analysts/)
  assert.match(prompt, /Do not shorten that to "eight years shipping"/)
  assert.match(prompt, /Never write "much of that time" or "for most of those years"/)
})

test('resume projects and stated numbers stay available, and the job description is not treated as experience', () => {
  const resume = 'Built the Activation Hub for Northwind and cut checkout time by 18%.'
  const job = 'Required: Kubernetes, five years managing a team of 12 engineers, and a client case study with a 40% revenue increase.'
  const user = buildUserContent(resume, job, null)
  assert.match(user, /Built the Activation Hub for Northwind and cut checkout time by 18%/)
  assert.match(user, /Kubernetes/)
  assert.ok(user.indexOf('RESUME / CV:') < user.indexOf('Activation Hub'))
  assert.ok(user.indexOf('Activation Hub') < user.indexOf('JOB DESCRIPTION:'))
  const prompt = buildSystemPrompt('professional', false, null)
  assert.match(prompt, /job description is only a list of requirements, keywords, and target skills/i)
  assert.match(prompt, /Do not turn a job requirement into a claim/)
  assert.match(prompt, /rewrite and organize experience that the resume already states/)
  assert.match(prompt, /only when the resume already states it/)
})

test('a job skill or management duty cannot be claimed unless the resume states it', () => {
  const prompt = buildSystemPrompt('concise', false, null)
  assert.match(prompt, /not evidence that the candidate has done that work/)
  assert.match(prompt, /Do not invent years of experience, projects, achievements, numbers, technical tools, team-management results, client cases, or specific work outcomes/)
  assert.match(prompt, /When the job asks for something the resume does not support, use cautious wording/)
  assert.match(prompt, /Do not say the candidate has already done that work/)
})

test('stated numbers stay exact and missing numbers are not created', () => {
  const prompt = buildSystemPrompt('professional', false, null)
  assert.match(prompt, /If the resume states a number, keep that exact number and its unit/)
  assert.match(prompt, /If the resume does not state a number, do not create one/)
  const user = buildUserContent('Reduced support tickets by 12%.', 'Show measurable business impact and a 3x pipeline increase.', null)
  assert.match(user, /Reduced support tickets by 12%/)
  assert.equal(user.includes('3x pipeline'), true)
  assert.match(prompt, /It is not evidence that the candidate has done that work/)
})

test('professional, concise, and natural tones all keep the factual constraint', () => {
  for (const tone of ['professional', 'concise', 'natural']) {
    const prompt = buildSystemPrompt(tone, false, null)
    assert.match(prompt, /resume is the only source of facts/i)
    assert.match(prompt, /Stay inside the resume facts/)
    assert.match(prompt, /A warmer or more natural tone is not a reason to invent experience/)
    assert.match(prompt, /Professional, concise, and natural wording must all stay inside these facts/)
    assert.match(prompt, /Factual accuracy outranks tone/)
    assert.match(prompt, /Professional, Concise, and Natural Human wording must not invent experience/)
  }
  assert.match(buildSystemPrompt('natural', false, null), /Natural wording must not invent experience, tools, numbers, or outcomes/)
  assert.match(buildSystemPrompt('professional', false, null), /Do not invent results to sound more accomplished/)
  assert.match(buildSystemPrompt('concise', false, null), /Do not add facts to fill a sentence, and do not drop a stated number/)
})

test('a generated letter cannot claim SQL experience the resume does not provide', () => {
  const generated = [
    TRUE_BODY,
    FORBIDDEN_SQL,
    'I regularly partner with SQL stakeholders when I write requirements.',
    'Partnering with SQL stakeholders is already part of my background.',
    ALLOWED_SQL,
  ].join('\n\n')
  const letter = enforceLetterFacts(PM_RESUME, SQL_JOB, generated)
  assert.equal(letter.includes(FORBIDDEN_SQL), false)
  assert.equal(letter.toLowerCase().includes('partner with sql stakeholders'), false)
  assert.equal(letter.toLowerCase().includes('part of my background'), false)
  assert.match(letter, /I would welcome the opportunity to discuss/)
  assert.match(letter, /could support your team's work with SQL stakeholders/)
  assert.doesNotMatch(letter, /central to how I work/)
})

test('a management requirement and a client result are not rewritten as experience', () => {
  const managed = enforceLetterFacts(
    'Product designer. Eight years shipping B2B analytics.',
    'Must manage a team and own the roadmap.',
    'Dear Hiring Manager,\n\nI have managed engineering teams throughout my career. I have eight years shipping B2B analytics.',
  )
  assert.equal(managed.toLowerCase().includes('managed engineering teams'), false)
  assert.match(managed, /eight years of experience shipping B2B analytics/)

  const client = enforceLetterFacts(
    PM_RESUME,
    SQL_JOB,
    `${TRUE_BODY}\n\nI delivered a 40% revenue increase for a client.`,
  )
  assert.equal(client.includes('40%'), false)
  assert.equal(client.toLowerCase().includes('for a client'), false)
  assert.match(client, /eight years/i)
  assert.match(client, /six analysts/i)
})

test('resume facts for eight years and six analysts survive factual cleanup', () => {
  const letter = enforceLetterFacts(
    PM_RESUME,
    SQL_JOB,
    `${TRUE_BODY}\n\n${FORBIDDEN_SQL}\n\nI have managed a team of 12 engineers.`,
  )
  assert.match(letter, /eight years of experience shipping B2B analytics/i)
  assert.match(letter, /led six analysts/i)
  assert.equal(letter.includes('12'), false)
  assert.equal(letter.toLowerCase().includes('sql stakeholders is central'), false)
})

test('ordinary job words do not remove a truthful sentence', () => {
  const letter = enforceLetterFacts(
    PM_RESUME,
    'Own the roadmap, weekly releases, and stakeholder communication. Write requirements alongside SQL stakeholders.',
    'Dear Hiring Manager,\n\nI am excited to help with the roadmap and weekly releases. I have eight years shipping B2B analytics, and I have led six analysts.',
  )
  assert.match(letter, /Dear Hiring Manager,/)
  assert.match(letter, /roadmap and weekly releases/)
  assert.match(letter, /eight years of experience shipping B2B analytics/)
  assert.match(letter, /led six analysts/)
})

test('removing an unsupported claim leaves the greeting, experience, and closing', () => {
  const letter = enforceLetterFacts(
    PM_RESUME,
    SQL_JOB,
    [
      'Dear Hiring Manager,',
      'I am a product manager with eight years shipping B2B analytics, and I have led six analysts. I am excited to help with the roadmap.',
      'I have extensive experience working with SQL stakeholders.',
      'Could we schedule a 15-minute conversation?',
    ].join('\n\n'),
  )
  assert.match(letter, /^Dear Hiring Manager,/)
  assert.match(letter, /eight years of experience shipping B2B analytics/)
  assert.match(letter, /led six analysts/)
  assert.equal(letter.toLowerCase().includes('roadmap'), false)
  assert.match(letter, /15-minute conversation/)
  assert.match(letter, /could support your team's work with SQL stakeholders/)
  assert.equal(letter.toLowerCase().includes('extensive experience working with sql'), false)
  assert.notEqual(letter.trim(), 'Dear Hiring Manager,')
})

test('professional, concise, and natural tones cannot bypass the factual result check', () => {
  const generated = `${TRUE_BODY}\n\n${FORBIDDEN_SQL}`
  for (const tone of ['professional', 'concise', 'natural']) {
    const prompt = buildSystemPrompt(tone, false, null)
    assert.match(prompt, /Writing requirements alongside SQL stakeholders is central to how I work/)
    assert.match(prompt, /could support your team's work with SQL stakeholders/)
    assert.match(prompt, /Do not keep an unsupported requirement by rewording it as a fact/)
    const letter = enforceLetterFacts(PM_RESUME, SQL_JOB, generated)
    assert.equal(letter.includes(FORBIDDEN_SQL), false)
    assert.match(letter, /eight years/i)
    assert.match(letter, /six analysts/i)
  }
  const source = readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8')
  assert.match(source, /enforceLetterFacts\(resume, job, aiResponseText\)/)
})

test('real product-manager wording cannot turn the job into personal experience', () => {
  const resume = 'Alex Chen, product manager.\n\nEight years shipping B2B analytics and leading six analysts.'
  const job = 'Product manager role.\n\nShip analytics, lead a team, and write requirements with SQL stakeholders.'
  const generated = [
    'Dear Hiring Manager,',
    'I have eight years shipping B2B analytics and leading six analysts.',
    'Writing requirements for SQL stakeholders.',
    'Being precise about tables, fields, and definitions.',
    "I've seen vague requirements cost teams weeks.",
    'Tight requirements make a release feel effortless.',
    'My analytics background taught me to be precise about tables, fields, and definitions.',
    'I would welcome the opportunity to discuss how my product management experience could support your team.',
    'Could we schedule a 15-minute conversation?',
  ].join('\n\n')
  for (const tone of ['professional', 'concise', 'natural']) {
    const prompt = buildSystemPrompt(tone, false, null)
    assert.match(prompt, /Being precise about tables, fields, and definitions/)
    assert.match(prompt, /I've seen vague requirements cost teams weeks/)
    const letter = enforceLetterFacts(resume, job, generated)
    assert.match(letter, /Dear Hiring Manager,/)
    assert.match(letter, /eight years of experience shipping B2B analytics/i)
    assert.match(letter, /leading six analysts/i)
    assert.match(letter, /15-minute conversation/)
    assert.match(letter, /I would welcome the opportunity to discuss/)
    assert.equal((letter.match(/I would welcome the opportunity/g) || []).length, 1)
    for (const banned of ['sql', 'tables', 'fields', 'definitions', 'requirements', 'effortless', 'weeks']) {
      assert.equal(letter.toLowerCase().includes(banned), false, banned)
    }
  }
})

test('invented duties, methods, customers, and preferences are removed for every tone', () => {
  const resume = 'Alex Chen, product manager.\n\nEight years shipping B2B analytics and leading six analysts.'
  const job = 'Product manager role.\n\nShip analytics, lead a team, and write requirements with SQL stakeholders.'
  const generated = [
    'Dear Hiring Manager,',
    'I am a product manager with eight years shipping B2B analytics and leading six analysts.',
    'I bring a track record of analytics product ownership.',
    'In my current capacity I run end-to-end delivery for business customers.',
    'Roadmap management is how I prefer to work.',
    'I would welcome the opportunity to discuss how my product management experience could support your team\'s work with SQL stakeholders.',
    'Could we schedule a 15-minute conversation?',
  ].join('\n\n')
  for (const tone of ['professional', 'concise', 'natural']) {
    const prompt = buildSystemPrompt(tone, false, null)
    assert.match(prompt, /Tone changes the wording only/)
    const letter = enforceLetterFacts(resume, job, generated)
    assert.match(letter, /eight years of experience shipping B2B analytics/i)
    assert.match(letter, /leading six analysts/i)
    assert.match(letter, /could support your team's work with SQL stakeholders/)
    assert.match(letter, /15-minute conversation/)
    for (const banned of ['track record', 'ownership', 'current capacity', 'end-to-end', 'customers', 'roadmap', 'prefer']) {
      assert.equal(letter.toLowerCase().includes(banned), false, banned)
    }
  }
})

test('the product manager sample keeps real experience and removes SQL claims for every tone', () => {
  const resume = 'Product Manager.\nEight years shipping B2B analytics and leading six analysts.'
  const job = 'Product manager role.\nShip analytics, lead a team, and write requirements with SQL stakeholders.'
  const generated = [
    'Dear Hiring Manager,',
    'I have eight years shipping B2B analytics and leading six analysts. I write requirements with SQL stakeholders every week.',
    'Relational queries are central to how I work.',
    'I doubled revenue for a client.',
    'Could we schedule a 15-minute conversation?',
  ].join('\n\n')
  for (const tone of ['professional', 'concise', 'natural']) {
    const prompt = buildSystemPrompt(tone, false, null)
    assert.match(prompt, /resume is the only source of facts/i)
    assert.match(prompt, /Do not turn a job requirement into a claim/)
    const letter = enforceLetterFacts(resume, job, generated)
    assert.match(letter, /Dear Hiring Manager,/)
    assert.match(letter, /eight years of experience shipping B2B analytics/i)
    assert.match(letter, /leading six analysts/i)
    assert.match(letter, /15-minute conversation/)
    assert.equal(letter.toLowerCase().includes('write requirements with sql'), false)
    assert.equal(letter.toLowerCase().includes('relational queries'), false)
    assert.equal(letter.toLowerCase().includes('doubled revenue'), false)
    assert.match(letter, /I would welcome the opportunity to discuss/)
  }
})

test('fact cleanup keeps of experience in the years sentence for every tone', () => {
  const resume = 'Alex Chen, product manager.\n\nEight years shipping B2B analytics and leading six analysts.'
  const job = 'Product manager role.\n\nShip analytics, lead a team, and write requirements with SQL stakeholders.'
  const generated = [
    'Dear Hiring Manager,',
    'I have eight years shipping B2B analytics, and I have led a team of six analysts.',
    'I bring a track record of analytics product ownership.',
    'Could we schedule a 15-minute conversation?',
  ].join('\n\n')
  const expected = 'I have eight years of experience shipping B2B analytics, and I have led a team of six analysts.'
  for (const tone of ['professional', 'concise', 'natural']) {
    const prompt = buildSystemPrompt(tone, false, null)
    assert.match(prompt, /I have eight years of experience shipping B2B analytics, and I have led a team of six analysts/)
    assert.match(prompt, /Keep the words "of experience"/)
    const letter = enforceLetterFacts(resume, job, generated)
    assert.match(letter, /I have eight years of experience shipping B2B analytics, and I have led a team of six analysts\./)
    assert.equal(letter.includes('I have eight years shipping '), false)
    assert.equal(letter.toLowerCase().includes('track record'), false)
    assert.match(letter, /15-minute conversation/)
    assert.equal(letter.includes(expected), true)
  }
})

test('cover letter generation still uses one streaming DeepSeek call', () => {
  const source = readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8')
  assert.match(source, /model: 'deepseek-chat'/)
  assert.match(source, /stream: true/)
  assert.equal(source.includes('temperature'), false)
  assert.equal(source.includes('max_tokens'), false)
  assert.equal(source.split('api.deepseek.com').length - 1, 1)
})
