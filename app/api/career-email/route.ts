import { completeJson } from '@/lib/deepseek-json'
import { runMeteredJson } from '@/lib/ai-usage'
import { clientRateKey, rateLimit, readJsonObject, tooManyRequests } from '@/lib/request-guard'
import { parseCareerEmail, validateCareerEmailInput } from '@/lib/toolkit-parse'

export const maxDuration = 60

const SYSTEM = `
You draft concise professional English career emails. Return ONLY JSON:
{ "subject": string, "body": string }
Use only details the user provided. Do not invent compensation numbers, dates, or outcomes.
The body should be ready to send after the user reviews it. JSON only.
`.trim()

export async function POST(req: Request) {
  if (!rateLimit(clientRateKey(req, 'career-email'))) return tooManyRequests()
  const parsedBody = await readJsonObject(req)
  if (!parsedBody.ok) return parsedBody.response
  const input = validateCareerEmailInput(parsedBody.body)
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 })
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return Response.json({ error: 'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.' }, { status: 500 })
  }
  const lines = Object.entries(input.fields).map(([key, value]) => `${key}: ${value}`)
  return runMeteredJson(req, 'career-email', { tool: 'career-email', title: input.kind, input: input.fields }, async () => {
    const raw = await completeJson(SYSTEM, `EMAIL TYPE: ${input.kind}\n\n${lines.join('\n')}`)
    const result = parseCareerEmail(raw, input.kind)
    if (!result) return Response.json({ error: 'Could not read the email draft.' }, { status: 502 })
    return result
  })
}
