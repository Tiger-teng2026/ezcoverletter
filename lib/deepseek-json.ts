import { extractJsonObject } from '@/lib/match-schema'

export class DeepSeekError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DeepSeekError'
    this.status = status
  }
}

function publicDeepSeekMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/api key|unauthorized|401|authentication/i.test(message)) {
    return 'DeepSeek API key is missing or invalid. Set DEEPSEEK_API_KEY in your environment and try again.'
  }
  if (/429|rate limit/i.test(message)) {
    return 'DeepSeek rate limit reached. Please wait a moment and try again.'
  }
  return message.slice(0, 400)
}

/** Non-streaming JSON completion. The API key stays on the server. */
export async function completeJson(system: string, user: string): Promise<unknown> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() || ''
  if (!apiKey) {
    throw new DeepSeekError(
      'DEEPSEEK_API_KEY is not set. Add it to your environment and restart the server.',
      500,
    )
  }

  let response: Response
  try {
    response = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
  } catch (error) {
    throw new DeepSeekError(publicDeepSeekMessage(error), 502)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    let detail = errText
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } }
      detail = parsed.error?.message || errText
    } catch {
      // keep raw text
    }
    throw new DeepSeekError(publicDeepSeekMessage(new Error(detail || `DeepSeek HTTP ${response.status}`)), 502)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (payload.error?.message) {
    throw new DeepSeekError(publicDeepSeekMessage(new Error(payload.error.message)), 502)
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new DeepSeekError('Empty response from DeepSeek.', 502)
  }

  try {
    return extractJsonObject(content)
  } catch (error) {
    throw new DeepSeekError(publicDeepSeekMessage(error), 502)
  }
}

export function jsonFailure(error: unknown) {
  if (error instanceof DeepSeekError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return Response.json({ error: 'The request failed. Try again.' }, { status: 500 })
}
