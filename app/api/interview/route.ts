import { completeJson } from '@/lib/deepseek-json'
import { runMeteredJson } from '@/lib/ai-usage'
import { clientRateKey, rateLimit, readJsonObject, tooManyRequests } from '@/lib/request-guard'
import {
  parseInterviewFeedback,
  parseInterviewReply,
  parseInterviewStart,
  validateInterviewInput,
} from '@/lib/toolkit-parse'

export const maxDuration = 60

const START_SYSTEM = `
You are an interview coach for English-speaking roles. Return ONLY JSON:
{ "questions": [ { "prompt": string, "category": "behavioral" | "role", "structure": string, "sampleAnswer": string } ] }
Include at least 3 behavioral questions and at least 2 role questions grounded in the job description.
Sample answers must be clearly marked as examples and must not invent the candidate's employers or metrics.
If a resume is present, examples may use only facts from that resume. JSON only.
`.trim()

const FEEDBACK_SYSTEM = `
You review a candidate's written interview answer. Return ONLY JSON:
{ "feedback": string, "strengths": string[], "improvements": string[], "revisedOutline": string }
Be specific. Do not invent experience the answer did not state. JSON only.
`.trim()

const REPLY_SYSTEM = `
You are continuing a written mock interview. Return ONLY JSON:
{ "feedback": string, "nextQuestion": string, "structureHint": string }
Comment on the candidate's latest answer, then ask one new question that fits the job and has not already been asked. JSON only.
`.trim()

export async function POST(req: Request) {
  if (!rateLimit(clientRateKey(req, 'interview'))) return tooManyRequests()
  const parsedBody = await readJsonObject(req)
  if (!parsedBody.ok) return parsedBody.response
  const input = validateInterviewInput(parsedBody.body)
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 })
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return Response.json({ error: 'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.' }, { status: 500 })
  }
  const action = input.mode === 'start' ? 'interview-start' : input.mode === 'feedback' ? 'interview-feedback' : 'interview-reply'
  return runMeteredJson(req, action, { tool: 'interview', title: input.mode, input: { mode: input.mode, question: input.question } }, async () => {
    if (input.mode === 'start') {
      const raw = await completeJson(
        START_SYSTEM,
        `JOB DESCRIPTION:\n${input.job}\n\nRESUME (optional):\n${input.resume || 'Not provided.'}`,
      )
      const result = parseInterviewStart(raw)
      if (!result) return Response.json({ error: 'Could not read interview questions.' }, { status: 502 })
      return result
    }
    if (input.mode === 'feedback') {
      const raw = await completeJson(
        FEEDBACK_SYSTEM,
        `QUESTION:\n${input.question}\n\nANSWER:\n${input.answer}\n\nJOB:\n${input.job || 'Not provided.'}`,
      )
      const result = parseInterviewFeedback(raw)
      if (!result) return Response.json({ error: 'Could not read interview feedback.' }, { status: 502 })
      return result
    }
    const transcript = input.history.map((turn) => `${turn.role}: ${turn.content}`).join('\n')
    const raw = await completeJson(
      REPLY_SYSTEM,
      `JOB DESCRIPTION:\n${input.job}\n\nTRANSCRIPT:\n${transcript || 'None yet.'}\n\nLATEST ANSWER:\n${input.answer}`,
    )
    const result = parseInterviewReply(raw)
    if (!result) return Response.json({ error: 'Could not continue the interview.' }, { status: 502 })
    return result
  })
}
