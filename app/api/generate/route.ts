import {
  formatMatchAnalysisForPrompt,
  parseMatchResult,
  type JobMatchResult,
} from '@/lib/match-schema'
import { enforceLetterFacts } from '@/lib/letter-facts'
import { withCanonicalSignOff } from '@/lib/sign-off'
import { beginAiUsage } from '@/lib/billing/runtime'
import { usageTextResponse } from '@/lib/ai-usage'

export const maxDuration = 60

const TONE_RULES: Record<string, string> = {
  professional:
    'Confident and polished business English. Full sentences, no slang. Stay inside the resume facts. Do not invent results to sound more accomplished.',
  concise:
    'Extremely tight. Every sentence carries new information. Prefer the shorter end of the word budget. Stay inside the resume facts. Do not add facts to fill a sentence, and do not drop a stated number.',
  natural:
    'Warm, plain-spoken, first-person voice that sounds like a real person typed it. Contractions are welcome; vary sentence length. Stay inside the resume facts. Natural wording must not invent experience, tools, numbers, or outcomes.',
}

function describeError(error: unknown) {
  console.error('[generate] DeepSeek error:', error)
  const message = error instanceof Error ? error.message : String(error)

  if (/api key|unauthorized|401|authentication/i.test(message)) {
    return '[Generation unavailable] DeepSeek API key is missing or invalid. Set DEEPSEEK_API_KEY in your environment and try again.'
  }
  if (/429|rate limit/i.test(message)) {
    return '[Generation unavailable] DeepSeek rate limit reached. Please wait a moment and try again.'
  }
  return `[Generation failed] ${message}`
}

const SYSTEM_PROMPT = `
You are an expert executive resume writer and career coach in Silicon Valley. Your task is to write a high-converting, ATS-optimized Cover Letter based on the provided user Resume and Job Description.

CRITICAL RULES TO FOLLOW:
1. NO PLACEHOLDERS IN BODY: Never output placeholders like "[Company Name]", "[Hiring Manager Name]", "[User Full Name]", "[Phone]", "[Email]", or "[LinkedIn]" in the letter. Extract the actual company name and project details from the Job Description. If the company name is truly missing, use a professional greeting like "Dear Hiring Manager,".
2. PROFESSIONAL TONE: Keep the tone strictly professional and confident. DO NOT use overly casual, cheesy, or conversational phrases (such as "swap stories" or "grab a coffee"). Do not invent accomplishments to sound more result-oriented.
3. VALUE & METRICS: Use business results and numbers only when the user's resume states them. If the resume states a number, keep that exact number and its unit. If the resume does not state a number, do not create one. Do not infer how long a responsibility lasted. A total tenure plus a duty does not mean that duty lasted for all or most of those years. Never write "much of that time", "for most of those years", or any other time span the resume does not state. Separate facts may share one sentence, but do not add a time relationship the resume does not provide. "Eight years shipping B2B analytics and leading six analysts" means eight years of experience in B2B analytics and leadership of a team of six analysts.
4. ONE CALL TO ACTION: End the letter body with exactly one call to action, a short request for a 15-minute conversation. Do not invite an interview, phone call, or further conversation a second time. Do not repeat the same point to make the letter longer. The final paragraph should be short, natural, and professional.
5. FORMAT: Keep it clean, structured, and ready to send directly to an HR manager.
6. NO SIGN-OFF: Do NOT include any closing or signature — not "Best regards,", "Best,", "Sincerely,", a name line, phone, email, LinkedIn, or any signature block. End after the single CTA paragraph only. The system will append exactly one canonical sign-off after generation.
`.trim()

const MATCH_PROMPT_ADDENDUM = `
JOB MATCH CONTEXT IS PROVIDED.
Use it only as a lens on the resume — never as a source of new facts:
- Emphasize matched skills that are clearly evidenced in the resume, using the employer's wording when it is true.
- Ground the story in the experience-match notes, with concrete resume metrics and projects.
- Treat suggestions as editing guidance: highlight real proof the candidate already has. Do not invent missing skills, tools, employers, or outcomes.
- Do not claim skills listed as missing unless they are explicitly present in the resume.
- Do not reinterpret a number in the match notes. Keep the unit that appears in the resume.
- Keep the letter specific and human. Avoid generic AI template language and empty claims.
`.trim()

const FACT_RULES = `
FACTUAL CONSTRAINTS:
The resume is the only source of facts about the candidate's experience.
- Do not invent employers, degrees, jobs, projects, or outcomes the resume does not state.
- Do not change what a number means, and do not change the unit attached to that number.
- A headcount is not a length of time. Never turn "six analysts" into "six years" or "six of those years."
- A length of time is not a headcount. Never turn years of experience into a number of people.
- An amount of money is not a percentage, and a percentage is not an amount of money. "Improved organic website traffic by 45%" stays a 45% traffic increase.
- Do not merge two separate facts into a new claim the resume does not make. "Eight years shipping B2B analytics and leading six analysts" is eight years in B2B analytics, and leadership of a team of six analysts. It is not six years of leadership. The acceptable wording is "I have eight years of experience shipping B2B analytics, and I have led a team of six analysts." Do not shorten that to "eight years shipping". Keep the words "of experience".
- Do not infer how many years a duty lasted. Do not assume a duty filled all or most of the total tenure. Never write "much of that time" or "for most of those years" unless the resume states that span.
- If you cannot tell what a number refers to, keep the resume's wording or leave that detail out.
- The job description is only a list of requirements, keywords, and target skills. It is not evidence that the candidate has done that work.
- Do not turn a job requirement into a claim that the candidate already has that experience, skill, or tool.
- Do not invent years of experience, projects, achievements, numbers, technical tools, team-management results, client cases, or specific work outcomes.
- You may rewrite and organize experience that the resume already states.
- You may emphasize a skill, tool, or result only when the resume already states it and it matches the role.
- When the job asks for something the resume does not support, use cautious wording. Do not say the candidate has already done that work.
- A warmer or more natural tone is not a reason to invent experience. Professional, concise, and natural wording must all stay inside these facts.
- Do not keep an unsupported requirement by rewording it as a fact.
- Counterexample. Resume: "Product Manager. Eight years shipping B2B analytics. Led six analysts." Job description: "Write requirements alongside SQL stakeholders." Forbidden: "Writing requirements alongside SQL stakeholders is central to how I work." Also forbidden: "Writing requirements for SQL stakeholders.", "Being precise about tables, fields, and definitions.", "I've seen vague requirements cost teams weeks.", and "Tight requirements make a release feel effortless." These are unsupported even when they avoid the word experience. Do not invent anecdotes, technical details, or outcomes the resume does not state. Allowed only as future interest, not as work already done: "I would welcome the opportunity to discuss how my product management experience could support your team's work with SQL stakeholders."
- A duty, method, customer, tool, preference, or result must already be written in the resume before the letter can say the candidate does or prefers it. Words that appear only in the job description may describe what the role asks for, or what the candidate would like to discuss. They must not be told as work already done.
- Tone changes the wording only. Professional uses complete polished sentences. Concise stays short. Natural Human may use contractions. All three keep the same facts.
- You may improve the English. You may not change the facts.
`.trim()

export function buildSystemPrompt(
  tone: string,
  highlightKeywords: boolean,
  matchAnalysis: JobMatchResult | null,
) {
  return [
    SYSTEM_PROMPT,
    FACT_RULES,
    `Tone preference from the user: ${TONE_RULES[tone]}`,
    highlightKeywords
      ? 'Wrap each phrase that is a direct keyword match between the resume and the job description in **double asterisks**. Highlight at most 12 phrases.'
      : 'Do not use any markdown emphasis, asterisks, or headings.',
    matchAnalysis ? MATCH_PROMPT_ADDENDUM : '',
    'Factual accuracy outranks tone. Professional, Concise, and Natural Human wording must not invent experience the resume does not state. Never invent employers, degrees, metrics, or dates that are not in the resume. Output only the letter body (greeting + paragraphs + CTA) — no commentary and no sign-off.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildUserContent(
  resume: string,
  job: string,
  matchAnalysis: JobMatchResult | null,
) {
  const parts = [
    `RESUME / CV:\n${resume}`,
    `JOB DESCRIPTION:\n${job}`,
  ]

  if (matchAnalysis) {
    parts.push(
      `JOB MATCH ANALYSIS:\n${formatMatchAnalysisForPrompt(matchAnalysis)}`,
    )
  }

  parts.push(
    matchAnalysis
      ? 'Write the cover letter now. Personalize it using the job match analysis and only facts from the resume.'
      : 'Write the cover letter now.',
  )

  return parts.join('\n\n---\n\n')
}

/** Strip leftover AI placeholders in the body (sign-off is added separately). */
function cleanPlaceholders(aiResponseText: string) {
  const cleanedText = aiResponseText.replace(/\[[^\]]*\]/g, (match) => {
    if (/hiring manager/i.test(match)) return 'Hiring Manager'
    if (/company name/i.test(match)) return 'your esteemed company'
    return ''
  })

  return cleanedText
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)

  if (!body || typeof body !== 'object') {
    return new Response('Invalid request body', { status: 400 })
  }

  const resume = typeof body.resume === 'string' ? body.resume.slice(0, 12000) : ''
  const job = typeof body.job === 'string' ? body.job.slice(0, 12000) : ''
  const tone = typeof body.tone === 'string' && body.tone in TONE_RULES ? body.tone : 'natural'
  const highlightKeywords = body.highlightKeywords === true
  const matchAnalysis = parseMatchResult(
    'matchAnalysis' in body ? body.matchAnalysis : undefined,
  )

  if (resume.trim().length < 40 || job.trim().length < 40) {
    return new Response(
      'Please paste both a resume and a job description (at least 40 characters each).',
      { status: 400 },
    )
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return new Response(
      '[Generation unavailable] DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.',
      { status: 500 },
    )
  }

  const started = await beginAiUsage(req, 'cover-letter', {
    tool: 'cover-letter',
    title: job.slice(0, 80),
    input: { resume, job, tone },
  })
  if (!started.ok) return usageTextResponse(started.error, started.status, started.cookies)
  if (typeof started.replay === 'string') return usageTextResponse(started.replay, 200, started.cookies)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let delivered = false
      try {
        const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            stream: true,
            messages: [
              {
                role: 'system',
                content: buildSystemPrompt(tone, highlightKeywords, matchAnalysis),
              },
              {
                role: 'user',
                content: buildUserContent(resume, job, matchAnalysis),
              },
            ],
          }),
        })

        if (!deepseekRes.ok) {
          const errText = await deepseekRes.text().catch(() => '')
          let detail = errText
          try {
            const parsed = JSON.parse(errText) as { error?: { message?: string } }
            detail = parsed.error?.message || errText
          } catch {
            // keep raw text
          }
          await started.refund()
          controller.enqueue(
            encoder.encode(
              describeError(
                new Error(detail || `DeepSeek HTTP ${deepseekRes.status}`),
              ),
            ),
          )
          controller.close()
          return
        }

        if (!deepseekRes.body) {
          await started.refund()
          controller.enqueue(encoder.encode('[Generation failed] Empty response from DeepSeek.'))
          controller.close()
          return
        }

        const reader = deepseekRes.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let aiResponseText = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue

            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
                error?: { message?: string }
              }

              if (json.error?.message) {
                await started.refund()
                controller.enqueue(encoder.encode(describeError(new Error(json.error.message))))
                controller.close()
                return
              }

              const content = json.choices?.[0]?.delta?.content
              if (content) {
                aiResponseText += content
              }
            } catch {
              // skip malformed SSE chunks
            }
          }
        }

        const cleanedText = withCanonicalSignOff(
          cleanPlaceholders(enforceLetterFacts(resume, job, aiResponseText)),
        )
        if (!cleanedText) {
          await started.refund()
          controller.enqueue(encoder.encode('[Generation failed] Empty response from DeepSeek.'))
        } else {
          delivered = true
          await started.commit(cleanedText)
          const chunkSize = 48
          for (let i = 0; i < cleanedText.length; i += chunkSize) {
            controller.enqueue(encoder.encode(cleanedText.slice(i, i + chunkSize)))
          }
        }

        controller.close()
      } catch (error) {
        if (!delivered) await started.refund()
        controller.enqueue(encoder.encode(describeError(error)))
        controller.close()
      }
    },
  })

  const response = new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
  for (const cookie of started.cookies) response.headers.append('Set-Cookie', cookie)
  return response
}
