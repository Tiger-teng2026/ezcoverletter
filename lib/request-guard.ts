const hits = new Map<string, number[]>()

export function rateLimit(key: string, limit = 8, windowMs = 60_000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

export function resetRateLimit() {
  hits.clear()
}

export function clientRateKey(req: Request, bucket: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  return `${bucket}:${forwarded.slice(0, 80)}`
}

export function tooManyRequests() {
  return Response.json(
    { error: 'Too many requests. Wait a minute and try again.' },
    { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
  )
}

const MAX_JSON_CHARS = 60_000

export async function readJsonObject(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > MAX_JSON_CHARS) {
    return { ok: false, response: Response.json({ error: 'Request is too large.' }, { status: 413 }) }
  }

  const text = await req.text().catch(() => '')
  if (text.length > MAX_JSON_CHARS) {
    return { ok: false, response: Response.json({ error: 'Request is too large.' }, { status: 413 }) }
  }

  try {
    const body = JSON.parse(text) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, response: Response.json({ error: 'Invalid request body.' }, { status: 400 }) }
    }
    return { ok: true, body: body as Record<string, unknown> }
  } catch {
    return { ok: false, response: Response.json({ error: 'Invalid request body.' }, { status: 400 }) }
  }
}

export function boundedText(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function tooShort(value: string, min: number, label: string) {
  if (value.trim().length < min) return `${label} needs at least ${min} characters.`
  return null
}
