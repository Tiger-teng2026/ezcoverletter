import { completeJson } from '@/lib/deepseek-json'
import { runMeteredJson } from '@/lib/ai-usage'
import { clientRateKey, rateLimit, readJsonObject, tooManyRequests } from '@/lib/request-guard'
import { parseAtsReport, validateAtsInput } from '@/lib/toolkit-parse'

export const maxDuration = 60

const SYSTEM = `
You compare one resume with one job description for an English-speaking application. Return ONLY JSON with keys:
- overview: 2-4 sentences
- keywordCoverage: array of { keyword, status } where status is "covered", "partial", or "missing"
- missingKeywords: array of important missing terms
- structureIssues: array of structure or section problems
- readabilityIssues: array of clarity problems
- suggestions: array of concrete edits

Do not invent experience. Do not claim this is an employer ATS score or a guarantee of passing screening. JSON only.
`.trim()

export async function POST(req: Request) {
  if (!rateLimit(clientRateKey(req, 'ats-check'))) return tooManyRequests()
  const parsedBody = await readJsonObject(req)
  if (!parsedBody.ok) return parsedBody.response
  const input = validateAtsInput(parsedBody.body)
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 })
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return Response.json({ error: 'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.' }, { status: 500 })
  }

  return runMeteredJson(req, 'ats-check', { tool: 'ats-check', title: input.job.slice(0, 80), input }, async () => {
    const raw = await completeJson(
      SYSTEM,
      `RESUME:\n${input.resume}\n\n---\n\nJOB DESCRIPTION:\n${input.job}\n\nReturn the review JSON.`,
    )
    const result = parseAtsReport(raw)
    if (!result) return Response.json({ error: 'Could not read an ATS review from the model.' }, { status: 502 })
    return result
  })
}
