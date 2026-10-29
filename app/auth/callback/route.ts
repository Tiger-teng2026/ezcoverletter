import { allowlistedOriginFromRequest } from '@/lib/creem'
import { createRequestAuthClient, readSupabaseAuth } from '@/lib/supabase/server'

const OTP_TYPES = new Set(['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'])

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = allowlistedOriginFromRequest(req)
  if (!readSupabaseAuth()) return redirect(origin, '/login?error=not_configured')
  if (url.searchParams.get('error')) return redirect(origin, '/login?error=link')

  const tokenHash = url.searchParams.get('token_hash')
  const otpType = url.searchParams.get('type')
  if (tokenHash && otpType && OTP_TYPES.has(otpType)) {
    return finishVerification(req, origin, (client) =>
      client.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType as 'email' | 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change',
      }),
    )
  }

  const code = url.searchParams.get('code')
  if (code) return finishVerification(req, origin, (client) => client.auth.exchangeCodeForSession(code))

  return new Response(IMPLICIT_GRANT_PAGE, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function finishVerification(
  req: Request,
  origin: string,
  verify: (client: NonNullable<ReturnType<typeof createRequestAuthClient>>['client']) => Promise<{ error: { message?: string } | null }>,
) {
  const auth = createRequestAuthClient(req)
  if (!auth) return redirect(origin, '/login?error=not_configured')
  const { error } = await verify(auth.client)
  if (error) {
    console.error('[auth] email link was not accepted')
    return redirect(origin, '/login?error=link')
  }
  return redirect(origin, '/account?welcome=1', auth.cookies)
}

function redirect(origin: string, path: string, cookies: string[] = []) {
  const response = new Response(null, { status: 307, headers: { location: new URL(path, origin).toString() } })
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie)
  return response
}

const IMPLICIT_GRANT_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Signing in…</title>
<p>Signing in…</p>
<script>
(function () {
  var params = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  var accessToken = params.get("access_token")
  var refreshToken = params.get("refresh_token")
  if (!accessToken || !refreshToken) {
    window.location.replace("/login?error=link")
    return
  }
  fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
  }).then(function (response) {
    window.location.replace(response.ok ? "/account?welcome=1" : "/login?error=link")
  }).catch(function () {
    window.location.replace("/login?error=link")
  })
})()
</script>
`
