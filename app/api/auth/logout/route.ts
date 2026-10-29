import { parseCookieHeader, readSupabaseAuth, serializeCookie } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: Request) {
  const config = readSupabaseAuth()
  if (!config) return Response.json({ error: 'Sign-in is not configured.' }, { status: 503 })
  const pending: string[] = []
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.get('cookie'))
      },
      setAll(cookies) {
        for (const cookie of cookies) pending.push(serializeCookie(cookie.name, cookie.value, { ...cookie.options, maxAge: 0 }))
      },
    },
  })
  await supabase.auth.signOut()
  const response = Response.json({ ok: true })
  for (const cookie of pending) response.headers.append('Set-Cookie', cookie)
  return response
}
