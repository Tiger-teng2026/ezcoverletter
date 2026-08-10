import { withCanonicalSignOff } from '@/lib/sign-off'

export const maxDuration = 60

const TONE_RULES: Record<string, string> = {
  professional:
    'Confident and polished business English. Full sentences, no slang.',
  concise:
    'Extremely tight. Every sentence carries new information. Prefer the shorter end of the word budget.',
  natural:
    'Warm, plain-spoken, first-person voice that sounds like a real person typed it. Contractions are welcome; vary sentence length.',
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
2. PROFESSIONAL TONE: Keep the tone strictly professional, confident, and result-oriented. DO NOT use overly casual, cheesy, or conversational phrases (such as "swap stories" or "grab a coffee").
3. VALUE & METRICS: Focus on business value, problem-solving, and quantifiable metrics (e.g., percentages, scale, speed improvements) from the user's resume.
4. STRONG CTA: End the letter body with a professional, confident call-to-action requesting a 15-minute interview conversation.
5. FORMAT: Keep it clean, structured, and ready to send directly to an HR manager.
6. NO SIGN-OFF: Do NOT include any closing or signature — not "Best regards,", "Best,", "Sincerely,", a name line, phone, email, LinkedIn, or any signature block. End after the CTA paragraph only. The system will append exactly one canonical sign-off after generation.
`.trim()

function buildSystemPrompt(tone: string, highlightKeywords: boolean) {
  return [
    SYSTEM_PROMPT,
    `Tone preference from the user: ${TONE_RULES[tone]}`,
    highlightKeywords
      ? 'Wrap each phrase that is a direct keyword match between the resume and the job description in **double asterisks**. Highlight at most 12 phrases.'
      : 'Do not use any markdown emphasis, asterisks, or headings.',
    'Never invent employers, degrees, metrics, or dates that are not in the resume. Output only the letter body (greeting + paragraphs + CTA) — no commentary and no sign-off.',
  ].join('\n\n')
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

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
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
                content: buildSystemPrompt(tone, highlightKeywords),
              },
              {
                role: 'user',
                content: `RESUME / CV:\n${resume}\n\n---\n\nJOB DESCRIPTION:\n${job}\n\n---\n\nWrite the cover letter now.`,
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

        // Always strip AI sign-offs, then append exactly one canonical system footer.
        const cleanedText = withCanonicalSignOff(cleanPlaceholders(aiResponseText))
        if (!cleanedText) {
          controller.enqueue(encoder.encode('[Generation failed] Empty response from DeepSeek.'))
        } else {
          // Stream cleaned text in small chunks so the UI still updates progressively.
          const chunkSize = 48
          for (let i = 0; i < cleanedText.length; i += chunkSize) {
            controller.enqueue(encoder.encode(cleanedText.slice(i, i + chunkSize)))
          }
        }

        controller.close()
      } catch (error) {
        controller.enqueue(encoder.encode(describeError(error)))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
