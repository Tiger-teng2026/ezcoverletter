import { completeJson } from '@/lib/deepseek-json'
import { runMeteredJson } from '@/lib/ai-usage'
import { clientRateKey, rateLimit, readJsonObject, tooManyRequests } from '@/lib/request-guard'
import { parseResumeOptimization, validateResumeOptimizerInput } from '@/lib/toolkit-parse'

export const maxDuration = 60

const SYSTEM = `
You are an expert resume editor for English-speaking job markets. Return ONLY JSON with keys:
- issues: array of specific resume problems for this target job
- experienceRewrites: array of { before, after, why } comparing an original bullet or sentence with a stronger truthful rewrite
- achievementEdits: array of { before, after } for achievement lines
- optimizedResume: the full rewritten resume as plain text

Rules:
- Never invent employers, titles, dates, tools, or metrics.
- Keep the candidate's real facts. You may clarify wording and reorder emphasis.
- before text must be grounded in the supplied resume.
- Output JSON only.
`.trim()

export async function POST(req: Request) {
  if (!rateLimit(clientRateKey(req, 'resume-optimizer'))) return tooManyRequests()
  const parsedBody = await readJsonObject(req)
  if (!parsedBody.ok) return parsedBody.response
  const input = validateResumeOptimizerInput(parsedBody.body)
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 })
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return Response.json({ error: 'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.' }, { status: 500 })
  }
  return runMeteredJson(req, 'resume-optimizer', { tool: 'resume-optimizer', title: input.job.slice(0, 80), input }, async () => {
    const raw = await completeJson(
      SYSTEM,
      `RESUME:\n${input.resume}\n\n---\n\nTARGET JOB:\n${input.job}\n\nReturn the resume optimization JSON.`,
    )
    const result = parseResumeOptimization(raw)
    if (!result) return Response.json({ error: 'Could not read a resume optimization from the model.' }, { status: 502 })
    return result
  })
}
