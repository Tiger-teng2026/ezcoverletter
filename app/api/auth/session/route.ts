import { createRequestAuthClient } from '@/lib/supabase/server'
import { withCookies } from '@/lib/ai-usage'
import { SIGN_IN_UNAVAILABLE } from '@/lib/plans'

export async function POST(req: Request) {
  const auth = createRequestAuthClient(req)
  if (!auth) return Response.json({ error: SIGN_IN_UNAVAILABLE }, { status: 503 })
  const body = await req.json().catch(() => null)
  const accessToken = textField(body, 'access_token', 8000)
  const refreshToken = textField(body, 'refresh_token', 4000)
  if (!accessToken || !refreshToken) return Response.json({ error: 'That sign-in link is invalid or expired.' }, { status: 401 })

  const { error } = await auth.client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) return Response.json({ error: 'That sign-in link is invalid or expired.' }, { status: 401 })
  const { data, error: userError } = await auth.client.auth.getUser()
  if (userError || !data.user) return Response.json({ error: 'That sign-in link is invalid or expired.' }, { status: 401 })
  return withCookies(Response.json({ ok: true }), auth.cookies)
}

function textField(body: unknown, key: string, max: number) {
  if (!body || typeof body !== 'object' || !(key in body)) return ''
  const value = (body as Record<string, unknown>)[key]
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return ''
  return trimmed
}
