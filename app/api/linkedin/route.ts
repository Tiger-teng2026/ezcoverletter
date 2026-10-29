import { completeJson } from '@/lib/deepseek-json'
import { runMeteredJson } from '@/lib/ai-usage'
import { clientRateKey, rateLimit, readJsonObject, tooManyRequests } from '@/lib/request-guard'
import { parseLinkedInDraft, validateLinkedInInput } from '@/lib/toolkit-parse'

export const maxDuration = 60

const SYSTEM = `
You write English LinkedIn profile copy. Return ONLY JSON:
{
  "headlines": string[],
  "about": string,
  "experienceSuggestions": [ { "role": string, "bullets": string[] } ],
  "skills": string[],
  "positioning": string
}
Use only facts from the supplied profile or resume. Do not invent employers, metrics, or degrees.
Tailor the wording to the target role. JSON only.
`.trim()

export async function POST(req: Request) {
  if (!rateLimit(clientRateKey(req, 'linkedin'))) return tooManyRequests()
  const parsedBody = await readJsonObject(req)
  if (!parsedBody.ok) return parsedBody.response
  const input = validateLinkedInInput(parsedBody.body)
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 })
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return Response.json({ error: 'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.' }, { status: 500 })
  }
  return runMeteredJson(req, 'linkedin', { tool: 'linkedin', title: input.targetRole.slice(0, 80), input }, async () => {
    const raw = await completeJson(
      SYSTEM,
      `PROFILE / RESUME:\n${input.resume}\n\nTARGET ROLE:\n${input.targetRole}\n\nOPTIONAL JOB DESCRIPTION:\n${input.job || 'Not provided.'}`,
    )
    const result = parseLinkedInDraft(raw)
    if (!result) return Response.json({ error: 'Could not read a LinkedIn draft.' }, { status: 502 })
    return result
  })
}
