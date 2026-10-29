import { extractJsonObject, parseMatchResult } from '@/lib/match-schema'
import { runMeteredJson } from '@/lib/ai-usage'

export const maxDuration = 60

const MATCH_SYSTEM_PROMPT = `
You are an expert recruiter and ATS analyst. Compare a candidate resume against one job description and return a structured job-match assessment.

Return ONLY a JSON object with these exact keys:
- matchScore: integer 0-100 (overall fit for this role)
- matchedSkills: array of short skill/tool phrases evidenced in BOTH the resume and the job description
- missingSkills: array of important job-description requirements not clearly evidenced in the resume
- experienceMatch: 2-4 sentences on whether the candidate's experience fits the role (honest, specific, no fluff)
- suggestions: 3-6 concrete things the candidate should improve before applying

Scoring:
- 85-100 strong overlap in skills, seniority, and domain
- 70-84 solid core fit with a few gaps
- 50-69 partial fit or seniority/domain mismatch
- 0-49 weak overlap

Rules:
- Never invent employers, titles, skills, metrics, or dates that are not in the resume.
- Prefer the employer's wording for skills when the resume supports them.
- Do not include commentary outside JSON.
`.trim()

function describeError(error: unknown) {
  console.error('[match] DeepSeek error:', error)
  const message = error instanceof Error ? error.message : String(error)

  if (/api key|unauthorized|401|authentication/i.test(message)) {
    return 'DeepSeek API key is missing or invalid. Set DEEPSEEK_API_KEY in your environment and try again.'
  }
  if (/429|rate limit/i.test(message)) {
    return 'DeepSeek rate limit reached. Please wait a moment and try again.'
  }
  return message
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)

  if (!body || typeof body !== 'object') {
    return jsonError('Invalid request body', 400)
  }

  const resume = typeof body.resume === 'string' ? body.resume.slice(0, 12000) : ''
  const job = typeof body.job === 'string' ? body.job.slice(0, 12000) : ''

  if (resume.trim().length < 40 || job.trim().length < 40) {
    return jsonError(
      'Please paste both a resume and a job description (at least 40 characters each).',
      400,
    )
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return jsonError(
      'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.',
      500,
    )
  }

  return runMeteredJson(req, 'job-match', { tool: 'job-match', title: job.slice(0, 80), input: { resume, job } }, async () => {
  try {
    const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: MATCH_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `RESUME / CV:\n${resume}\n\n---\n\nJOB DESCRIPTION:\n${job}\n\n---\n\nReturn the job match JSON now.`,
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
      return jsonError(
        describeError(new Error(detail || `DeepSeek HTTP ${deepseekRes.status}`)),
        502,
      )
    }

    const payload = (await deepseekRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    if (payload.error?.message) {
      return jsonError(describeError(new Error(payload.error.message)), 502)
    }

    const content = payload.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return jsonError('Empty response from DeepSeek.', 502)
    }

    let parsed: unknown
    try {
      parsed = extractJsonObject(content)
    } catch (error) {
      return jsonError(describeError(error), 502)
    }

    const result = parseMatchResult(parsed)
    if (!result) {
      return jsonError('Could not read a valid job match score from the model response.', 502)
    }

    return result
  } catch (error) {
    throw error
  }
  })
}
